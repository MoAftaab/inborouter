require('dotenv').config();
const OpenAI = require('openai');
const { pool } = require('../db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rawModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MODEL = (rawModel.includes('5.4') || rawModel.includes('gpt-5')) ? 'gpt-4o-mini' : rawModel;

/**
 * Intent classification map
 */
const INTENT_HANDLERS = {
  count_by_category: handleCountByCategory,
  count_skipped: handleCountSkipped,
  list_triage: handleListTriage,
  spurious_rate: handleSpuriousRate,
  priority_confidence: handlePriorityConfidence,
  deal_value_sum: handleDealValueSum,
  thread_updates: handleThreadUpdates,
  list_by_assignee: handleListByAssignee,
  out_of_scope: handleOutOfScope,
  general_stats: handleGeneralStats,
};

const INTENT_SYSTEM = `You are an intent classifier for a chat interface over email routing data.
Classify the user's query into exactly one of these intents and extract parameters:

Intents:
- count_by_category: user asks how many emails/tasks of a specific category (enterprise_rfp, smb_enquiry, marketing, alliances, finance, triage, or all skipped types)
- count_skipped: user asks about skipped/ignored emails (out_of_office, newsletter, spam)
- list_triage: user wants to see triage items and their reasons
- spurious_rate: user asks about spurious rate, false positives, spam wrongly created
- priority_confidence: user asks about high priority tasks with low confidence
- deal_value_sum: user asks about total deal value, sum of RFP values
- thread_updates: user asks about thread updates, PATCH history, updated tasks
- list_by_assignee: user asks about tasks assigned to a specific person
- general_stats: user asks for overall summary, totals, how many processed
- out_of_scope: user asks to take an action (send email, reply, update), asks about external systems, or asks something unrelated

Return ONLY this JSON:
{
  "intent": "<intent_name>",
  "params": {
    "category": "<if applicable>",
    "assignee_id": "<if applicable>",
    "skip_reason": "<if applicable>"
  }
}`;

/**
 * A null scope means "all historical data" for API callers that do not
 * provide a batch. An empty run_ids array is intentionally different: it
 * means the requested batch did not resolve to any runs and must return zero.
 */
function normaliseRunScope(run_id, run_ids) {
  const supplied = run_ids !== undefined || run_id !== undefined;
  if (!supplied) return null;

  const values = Array.isArray(run_ids) ? run_ids : [run_id];
  return {
    runIds: [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))],
  };
}

function addRunScope(where, params, scope, recordAlias = 'p') {
  if (!scope) return where;
  params.push(scope.runIds);
  return `${where} AND EXISTS (
    SELECT 1 FROM ingest_run_emails run_scope
    WHERE run_scope.candidate_id = ${recordAlias}.candidate_id
      AND run_scope.email_id = ${recordAlias}.email_id
      AND run_scope.run_id = ANY($${params.length}::text[])
  )`;
}

function addTaskRunScope(where, params, scope, taskAlias = 't') {
  if (!scope) return where;
  params.push(scope.runIds);
  return `${where} AND EXISTS (
    SELECT 1 FROM ingest_run_emails run_scope
    WHERE run_scope.task_id = ${taskAlias}.task_id
      AND run_scope.candidate_id = ${taskAlias}.candidate_id
      AND run_scope.run_id = ANY($${params.length}::text[])
  )`;
}

function addIngestRunScope(where, params, scope, runAlias = 'r') {
  if (!scope) return where;
  params.push(scope.runIds);
  return `${where} AND ${runAlias}.run_id = ANY($${params.length}::text[])`;
}

async function classifyIntent(query) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: INTENT_SYSTEM },
      { role: 'user', content: query },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 100,
  });
  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return { intent: 'general_stats', params: {} };
  }
}

async function phraseAnswer(query, data) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant answering questions about email routing data.
Use ONLY the numbers and data provided below. Do not invent, estimate, or extrapolate.
If the data shows 0 for a category, say "zero" plainly — do not make up a different number.
Be concise (1-3 sentences). Do not add disclaimers unless data is genuinely absent.`,
      },
      {
        role: 'user',
        content: `Question: ${query}\n\nData from database:\n${JSON.stringify(data, null, 2)}\n\nAnswer based only on this data:`,
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 200,
  });
  return response.choices[0].message.content.trim();
}

// ─── Intent handlers ─────────────────────────────────────────────────────────

async function handleCountByCategory(candidateId, params, scope) {
  const queryParams = [candidateId];
  const where = addRunScope('p.candidate_id = $1', queryParams, scope, 'p');
  const { rows } = await pool.query(
    `SELECT 
       COALESCE(p.category, 'unknown') as category,
       COUNT(*) as count
     FROM processed_emails p
     WHERE ${where}
     GROUP BY p.category`,
    queryParams
  );

  const byCategory = {};
  rows.forEach(r => { byCategory[r.category] = parseInt(r.count); });

  const allCategories = ['enterprise_rfp', 'smb_enquiry', 'marketing', 'alliances', 'finance', 'triage'];
  allCategories.forEach(c => { if (!(c in byCategory)) byCategory[c] = 0; });

  // If asking about specific category
  if (params.category && params.category in byCategory) {
    return { [`${params.category}_count`]: byCategory[params.category] };
  }

  return byCategory;
}

async function handleCountSkipped(candidateId, params, scope) {
  const queryParams = [candidateId];
  const where = addRunScope('p.candidate_id = $1 AND p.decision = \'skipped\'', queryParams, scope, 'p');
  const { rows } = await pool.query(
    `SELECT 
       COALESCE(p.skip_reason, 'other') as skip_reason,
       COUNT(*) as count
     FROM processed_emails p
     WHERE ${where}
     GROUP BY p.skip_reason`,
    queryParams
  );

  const byReason = { out_of_office: 0, newsletter: 0, spam: 0, other: 0 };
  rows.forEach(r => {
    const k = r.skip_reason in byReason ? r.skip_reason : 'other';
    byReason[k] = parseInt(r.count);
  });
  byReason.total_skipped = Object.values(byReason).reduce((a, b) => a + b, 0);

  // Specific skip reason
  if (params.skip_reason && params.skip_reason in byReason) {
    return { [`${params.skip_reason}_count`]: byReason[params.skip_reason] };
  }

  // Marketing vs spam breakdown (common question)
  const marketingParams = [candidateId];
  const marketingWhere = addRunScope("p.candidate_id=$1 AND p.category='marketing' AND p.decision='created'", marketingParams, scope, 'p');
  const { rows: mktRows } = await pool.query(
    `SELECT COUNT(*) as marketing_tasks FROM processed_emails p WHERE ${marketingWhere}`,
    marketingParams
  );
  byReason.marketing_tasks_created = parseInt(mktRows[0].marketing_tasks);
  byReason.skipped_marketing_lookalike_spam = byReason.spam || 0;

  return byReason;
}

async function handleListTriage(candidateId, params, scope) {
  const queryParams = [candidateId];
  const where = addTaskRunScope("t.candidate_id = $1 AND t.assignee_id = 'u_triage'", queryParams, scope);
  const scopedReason = scope ? ` AND EXISTS (
         SELECT 1 FROM ingest_run_emails reason_scope
         WHERE reason_scope.task_id = p.task_id
           AND reason_scope.candidate_id = p.candidate_id
           AND reason_scope.run_id = ANY($2::text[])
       )` : '';
  const { rows } = await pool.query(
    `SELECT t.task_id, t.title, t.description, t.confidence, t.company_name,
            p.llm_reasoning, t.created_at
     FROM tasks t
     LEFT JOIN LATERAL (
       SELECT llm_reasoning
       FROM processed_emails p
       WHERE p.task_id = t.task_id AND p.candidate_id = t.candidate_id${scopedReason}
       ORDER BY p.processed_at DESC
       LIMIT 1
     ) p ON true
     WHERE ${where}
     ORDER BY t.created_at DESC`,
    queryParams
  );

  return {
    triage_count: rows.length,
    triage_tasks: rows.map(r => ({
      task_id: r.task_id,
      title: r.title,
      reason: r.llm_reasoning || r.description || 'Ambiguous routing — multiple signals',
      confidence: r.confidence,
      company: r.company_name,
    })),
    triage_task_ids: rows.map(r => r.task_id),
  };
}

async function handleSpuriousRate(candidateId, params, scope) {
  const runParams = [candidateId];
  const runWhere = addIngestRunScope('r.candidate_id = $1', runParams, scope, 'r');
  const { rows: runRows } = await pool.query(
    `SELECT SUM(processed) as processed, SUM(tasks_created) as created, SUM(skipped) as skipped
     FROM ingest_runs r WHERE ${runWhere}`,
    runParams
  );

  const spuriousParams = [candidateId];
  const spuriousWhere = addRunScope("p.candidate_id = $1 AND p.decision = 'skipped' AND p.skip_reason = 'spam'", spuriousParams, scope, 'p');
  const { rows: spuriousRows } = await pool.query(
    `SELECT COUNT(*) as count FROM processed_emails p
     WHERE ${spuriousWhere}`,
    spuriousParams
  );

  const processed = parseInt(runRows[0]?.processed || 0);
  const spuriousCount = parseInt(spuriousRows[0]?.count || 0);
  const rate = processed > 0 ? Math.round((spuriousCount / processed) * 1000) / 1000 : 0;

  return {
    spurious_count: spuriousCount,
    processed,
    spurious_rate: rate,
    spurious_rate_pct: `${(rate * 100).toFixed(1)}%`,
    spurious_definition: 'Skipped emails classified as vendor spam',
  };
}

async function handlePriorityConfidence(candidateId, params, scope) {
  const queryParams = [candidateId];
  const where = addTaskRunScope("t.candidate_id = $1 AND t.priority = 'high' AND t.confidence < 0.6", queryParams, scope);
  const { rows } = await pool.query(
    `SELECT t.task_id, t.title, t.priority, t.confidence, t.assignee_id, t.company_name
     FROM tasks t
     WHERE ${where}
     ORDER BY t.confidence ASC`,
    queryParams
  );

  return {
    count: rows.length,
    matches: rows.map(r => ({
      task_id: r.task_id,
      title: r.title,
      priority: r.priority,
      confidence: r.confidence,
      assignee_id: r.assignee_id,
    })),
  };
}

async function handleDealValueSum(candidateId, params, scope) {
  const queryParams = [candidateId];
  const where = addTaskRunScope("t.candidate_id = $1 AND t.category IN ('enterprise_rfp', 'smb_enquiry') AND t.assignee_id != 'u_triage'", queryParams, scope);
  const { rows } = await pool.query(
    `SELECT t.deal_value_inr, t.task_id FROM tasks t
     WHERE ${where}`,
    queryParams
  );

  const withValue = rows.filter(r => r.deal_value_inr !== null);
  const total = withValue.reduce((sum, r) => sum + r.deal_value_inr, 0);

  return {
    total_deal_value_inr: total,
    total_deal_value_formatted: `₹${(total / 100000).toFixed(1)} Lakhs`,
    rfps_with_stated_value: withValue.length,
    rfps_with_no_stated_value: rows.length - withValue.length,
    total_rfps: rows.length,
  };
}

async function handleThreadUpdates(candidateId, params, scope) {
  const queryParams = [candidateId];
  const where = addRunScope("p.candidate_id = $1 AND p.decision = 'updated'", queryParams, scope, 'p');
  const { rows } = await pool.query(
    `SELECT p.thread_id, COUNT(*) as update_count
     FROM processed_emails p
     WHERE ${where}
     GROUP BY p.thread_id
     HAVING COUNT(*) >= 1
     ORDER BY update_count DESC`,
    queryParams
  );

  const multipleUpdates = rows.filter(r => parseInt(r.update_count) > 1);

  return {
    threads_updated: rows.length,
    threads_updated_multiple_times: multipleUpdates.map(r => r.thread_id),
    total_update_events: rows.reduce((sum, r) => sum + parseInt(r.update_count), 0),
  };
}

async function handleListByAssignee(candidateId, params, scope) {
  const assigneeMap = {
    aarti: 'u_aarti', 'u_aarti': 'u_aarti',
    rohit: 'u_rohit', 'u_rohit': 'u_rohit',
    meera: 'u_meera', 'u_meera': 'u_meera',
    karan: 'u_karan', 'u_karan': 'u_karan',
    divya: 'u_divya', 'u_divya': 'u_divya',
    triage: 'u_triage', 'u_triage': 'u_triage',
  };

  const assigneeId = assigneeMap[params.assignee_id?.toLowerCase()] || 'u_triage';

  const queryParams = [candidateId, assigneeId];
  const where = addTaskRunScope('t.candidate_id = $1 AND t.assignee_id = $2', queryParams, scope);
  const { rows } = await pool.query(
    `SELECT t.task_id, t.title, t.priority, t.confidence, t.category, t.due_date FROM tasks t
     WHERE ${where}
     ORDER BY t.created_at DESC`,
    queryParams
  );

  return {
    assignee_id: assigneeId,
    count: rows.length,
    tasks: rows,
  };
}

async function handleOutOfScope() {
  return null; // Signals out-of-scope to the caller
}

async function handleGeneralStats(candidateId, params, scope) {
  const runParams = [candidateId];
  const runWhere = addIngestRunScope('r.candidate_id = $1', runParams, scope, 'r');
  const { rows: runRows } = await pool.query(
    `SELECT SUM(processed) as processed, SUM(tasks_created) as created,
            SUM(tasks_updated) as updated, SUM(skipped) as skipped, SUM(errors) as errors
     FROM ingest_runs r WHERE ${runWhere}`,
    runParams
  );

  const categoryParams = [candidateId];
  const categoryWhere = addRunScope("p.candidate_id = $1 AND p.decision = 'created'", categoryParams, scope, 'p');
  const { rows: catRows } = await pool.query(
    `SELECT COALESCE(p.category,'unknown') as category, COUNT(*) as count
     FROM processed_emails p WHERE ${categoryWhere}
     GROUP BY p.category`,
    categoryParams
  );

  const byCategory = {};
  catRows.forEach(r => { byCategory[r.category] = parseInt(r.count); });

  return {
    processed: parseInt(runRows[0]?.processed || 0),
    tasks_created: parseInt(runRows[0]?.created || 0),
    tasks_updated: parseInt(runRows[0]?.updated || 0),
    skipped: parseInt(runRows[0]?.skipped || 0),
    errors: parseInt(runRows[0]?.errors || 0),
    by_category: byCategory,
  };
}

// ─── Main chat handler ────────────────────────────────────────────────────────

async function handleChat(candidateId, query, scope = null) {
  const { intent, params } = await classifyIntent(query);

  if (intent === 'out_of_scope') {
    return {
      answer: '🚫 I can only answer questions about processed email data — counts, assignments, priorities, and routing decisions. I cannot send emails, reply to anyone, or take actions outside this system.',
      supporting_data: {},
      intent: 'out_of_scope',
      scope: scope ? { run_ids: scope.runIds } : null,
    };
  }

  const handler = INTENT_HANDLERS[intent] || handleGeneralStats;
  let data;

  try {
    data = await handler(candidateId, params || {}, scope);
  } catch (err) {
    console.error('Chat handler error:', err);
    data = { error: 'Could not retrieve data', details: err.message };
  }

  if (data === null) {
    return {
      answer: '🚫 That\'s outside the scope of what I can help with. I answer questions about routing decisions, task counts, assignees, priorities, and processing stats.',
      supporting_data: {},
      intent: 'out_of_scope',
      scope: scope ? { run_ids: scope.runIds } : null,
    };
  }

  const answer = await phraseAnswer(query, data);

  return {
    answer,
    supporting_data: data,
    intent,
    scope: scope ? { run_ids: scope.runIds } : null,
  };
}

module.exports = { handleChat, normaliseRunScope };
