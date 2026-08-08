const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { classifyEmail } = require('../services/classifier');

const router = express.Router();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function generateTaskId() {
  return 'tsk_' + uuidv4().replace(/-/g, '').substring(0, 6);
}

/**
 * Safe degradation when the LLM is unavailable or returns malformed JSON.
 * Obvious non-action mail is still skipped; uncertain mail becomes a low
 * confidence triage task so it is not silently lost.
 */
function fallbackClassification(email) {
  const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();

  if (/out of office|automatic reply|auto-reply|away from the office/.test(text)) {
    return {
      decision: 'skip',
      skip_reason: 'out_of_office',
      reasoning: 'Fallback identified an out-of-office auto-reply.',
    };
  }

  if (/unsubscribe|newsletter|weekly digest|issue #\d+/.test(text)) {
    return {
      decision: 'skip',
      skip_reason: 'newsletter',
      reasoning: 'Fallback identified a newsletter or digest.',
    };
  }

  if (/seo|organic traffic|page 1|free audit|lead generation/.test(text) &&
      /we offer|our services|we help|interested in a call|15[- ]?min/.test(text)) {
    return {
      decision: 'skip',
      skip_reason: 'spam',
      reasoning: 'Fallback identified an unsolicited vendor pitch.',
    };
  }

  return {
    decision: 'create_task',
    skip_reason: null,
    assignee_id: 'u_triage',
    category: 'triage',
    priority: 'medium',
    due_date: null,
    deal_value_inr: null,
    company_name: null,
    confidence: 0.05,
    reasoning: 'AI classification was unavailable; routed to triage for human review.',
  };
}

/**
 * Find existing task by thread_id (for thread reconciliation)
 */
async function findTaskByThread(candidateId, threadId) {
  const { rows } = await pool.query(
    'SELECT * FROM tasks WHERE candidate_id = $1 AND thread_id = $2 ORDER BY created_at ASC LIMIT 1',
    [candidateId, threadId]
  );
  return rows[0] || null;
}

/**
 * Check if email already processed (idempotency)
 */
async function isAlreadyProcessed(candidateId, emailId) {
  const { rows } = await pool.query(
    "SELECT id, decision, task_id FROM processed_emails WHERE candidate_id = $1 AND email_id = $2 AND decision <> 'error'",
    [candidateId, emailId]
  );
  return rows[0] || null;
}

/**
 * Log a processed email record
 */
async function logProcessed(candidateId, email, decision, classificationResult, runId, taskId = null) {
  await pool.query(
    `INSERT INTO processed_emails
      (candidate_id, email_id, thread_id, decision, skip_reason, category,
       assignee_id, confidence, llm_reasoning, run_id, task_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (email_id, candidate_id) DO UPDATE SET
       thread_id = EXCLUDED.thread_id,
       decision = EXCLUDED.decision,
       skip_reason = EXCLUDED.skip_reason,
       category = EXCLUDED.category,
       assignee_id = EXCLUDED.assignee_id,
       confidence = EXCLUDED.confidence,
       llm_reasoning = EXCLUDED.llm_reasoning,
       run_id = EXCLUDED.run_id,
       task_id = EXCLUDED.task_id,
       processed_at = NOW()
     WHERE processed_emails.decision = 'error'`,
    [
      candidateId,
      email.email_id,
      email.thread_id,
      decision,
      classificationResult?.skip_reason || null,
      classificationResult?.category || null,
      classificationResult?.assignee_id || null,
      classificationResult?.confidence ?? null,
      classificationResult?.reasoning || null,
      runId,
      taskId,
    ]
  );
}

async function updateRunProgress(runId, results) {
  await pool.query(
    `UPDATE ingest_runs
     SET processed=$1, tasks_created=$2, tasks_updated=$3, skipped=$4, errors=$5
     WHERE run_id=$6`,
    [results.processed, results.tasks_created, results.tasks_updated,
     results.skipped, results.errors.length, runId]
  );
}

async function recordRunEmail(runId, candidateId, emailId, decision, taskId = null) {
  await pool.query(
    `INSERT INTO ingest_run_emails
      (run_id, candidate_id, email_id, decision, task_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (run_id, candidate_id, email_id) DO UPDATE SET
       decision = EXCLUDED.decision,
       task_id = EXCLUDED.task_id,
       processed_at = NOW()`,
    [runId, candidateId, emailId, decision || 'error', taskId]
  );
}

/**
 * Process a single email: classify, create/update task
 */
async function processEmail(candidateId, email, runId) {
  // Idempotency check
  const existing = await isAlreadyProcessed(candidateId, email.email_id);
  if (existing) {
    return { status: 'already_processed', decision: existing.decision, task_id: existing.task_id };
  }

  let classification;
  try {
    classification = await classifyEmail(email);
  } catch (err) {
    console.error(`Classification error for ${email.email_id}:`, err.message);
    classification = fallbackClassification(email);
  }

  // Skip emails
  if (classification.decision === 'skip') {
    await logProcessed(candidateId, email, 'skipped', classification, runId);
    return { status: 'skipped', skip_reason: classification.skip_reason };
  }

  // Thread identity is the source of truth. Relying only on is_reply or
  // message_index lets provider-normalised replies create duplicate tasks.
  const existingTask = await findTaskByThread(candidateId, email.thread_id);

  if (existingTask) {
    // PATCH the existing task
    const updates = {};
    if (classification.priority) updates.priority = classification.priority;
    if (classification.due_date !== undefined && classification.due_date !== null) updates.due_date = classification.due_date;
    if (classification.deal_value_inr !== undefined && classification.deal_value_inr !== null) updates.deal_value_inr = classification.deal_value_inr;
    if (classification.company_name !== undefined && classification.company_name !== null) updates.company_name = classification.company_name;
    if (classification.confidence !== undefined && classification.confidence !== null) updates.confidence = classification.confidence;
    if (classification.description) updates.description = classification.description;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length > 1) { // more than just updated_at
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values = [...Object.values(updates), existingTask.task_id];
      await pool.query(
        `UPDATE tasks SET ${setClauses} WHERE task_id = $${Object.keys(updates).length + 1}`,
        values
      );
    }

    await logProcessed(candidateId, email, 'updated', classification, runId, existingTask.task_id);
    return { status: 'updated', task_id: existingTask.task_id };
  }

  // Check for duplicate source_email_id
  const { rows: dupRows } = await pool.query(
    'SELECT task_id FROM tasks WHERE source_email_id = $1 AND candidate_id = $2',
    [email.email_id, candidateId]
  );
  if (dupRows.length > 0) {
    await logProcessed(candidateId, email, 'created', classification, runId, dupRows[0].task_id);
    return { status: 'duplicate', task_id: dupRows[0].task_id };
  }

  // CREATE new task
  const taskId = generateTaskId();
  const now = new Date().toISOString();

  const title = classification.title ||
    `${classification.category?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} - ${email.subject?.substring(0, 60)}`;

  const description = classification.reasoning ||
    `Email from ${email.from_name} (${email.from_email}): ${email.subject}`;

  try {
    await pool.query(
      `INSERT INTO tasks
        (task_id, candidate_id, source_email_id, thread_id, title, description,
         assignee_id, category, priority, due_date, deal_value_inr, company_name,
         confidence, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        taskId, candidateId, email.email_id, email.thread_id,
        title, description,
        classification.assignee_id, classification.category, classification.priority,
        classification.due_date ?? null,
        classification.deal_value_inr ?? null,
        classification.company_name ?? null,
        classification.confidence, now,
      ]
    );
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation — already exists
      const { rows } = await pool.query(
        'SELECT task_id FROM tasks WHERE source_email_id=$1 AND candidate_id=$2',
        [email.email_id, candidateId]
      );
      await logProcessed(candidateId, email, 'created', classification, runId, rows[0]?.task_id);
      return { status: 'duplicate' };
    }
    throw err;
  }

  await logProcessed(candidateId, email, 'created', classification, runId, taskId);
  return { status: 'created', task_id: taskId };
}

// POST /ingest
router.post('/', async (req, res) => {
  const { candidate_id, emails, run_id: requestedRunId } = req.body;

  if (!candidate_id) return res.status(400).json({ error: 'candidate_id required' });
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails array required' });
  }
  if (emails.length > 100) {
    return res.status(400).json({ error: 'max 100 emails per batch' });
  }

  const candidateId = candidate_id.toLowerCase().trim();
  const runId = typeof requestedRunId === 'string' && requestedRunId.trim()
    ? requestedRunId.trim()
    : `run_${Date.now()}`;
  const startedAt = new Date().toISOString();

  // Create run record
  await pool.query(
    'INSERT INTO ingest_runs (run_id, candidate_id, started_at, total) VALUES ($1, $2, $3, $4)',
    [runId, candidateId, startedAt, emails.length]
  );

  const results = { processed: 0, tasks_created: 0, tasks_updated: 0, skipped: 0, idempotent_replays: 0, errors: [] };

  // Process SEQUENTIALLY (no Promise.all) to avoid rate limits
  for (const email of emails) {
    try {
      const result = await processEmail(candidateId, email, runId);
      results.processed++;

      if (result.status === 'created') results.tasks_created++;
      else if (result.status === 'updated') results.tasks_updated++;
      else if (result.status === 'skipped') results.skipped++;
      else if (result.status === 'error') results.errors.push({ email_id: email.email_id, error: result.error });
      else if (result.status === 'already_processed') {
        // Idempotency — count appropriately
        results.idempotent_replays++;
      }

      const runDecision = result.status === 'already_processed'
        ? result.decision
        : (result.status === 'duplicate' ? 'created' : result.status);
      await recordRunEmail(runId, candidateId, email.email_id, runDecision, result.task_id || null);

      await updateRunProgress(runId, results);

      // Small delay between LLM calls to respect rate limits
      await sleep(200);
    } catch (err) {
      console.error(`Fatal error on ${email.email_id}:`, err);
      results.errors.push({ email_id: email.email_id, error: err.message });
      results.processed++;
      try {
        await recordRunEmail(runId, candidateId, email.email_id, 'error');
      } catch (membershipError) {
        console.error(`Could not record run membership for ${email.email_id}:`, membershipError.message);
      }
      await updateRunProgress(runId, results);
    }
  }

  // Update run record
  await pool.query(
    `UPDATE ingest_runs SET finished_at=$1, processed=$2, tasks_created=$3, tasks_updated=$4, skipped=$5, errors=$6
     WHERE run_id=$7`,
    [new Date().toISOString(), results.processed, results.tasks_created,
     results.tasks_updated, results.skipped, results.errors.length, runId]
  );

  return res.status(200).json({ run_id: runId, ...results });
});

module.exports = router;
