const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const teamRoster = require('../team_roster.json');

const router = express.Router();

const VALID_ASSIGNEES = ['u_aarti', 'u_rohit', 'u_meera', 'u_karan', 'u_divya', 'u_triage'];
const VALID_CATEGORIES = ['enterprise_rfp', 'smb_enquiry', 'marketing', 'alliances', 'finance', 'triage'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

function validateTaskFields(body, requireAll = true) {
  const errors = [];

  if (requireAll || body.assignee_id !== undefined) {
    if (!VALID_ASSIGNEES.includes(body.assignee_id)) {
      return { error: 'invalid_enum_value', field: 'assignee_id' };
    }
  }
  if (requireAll || body.category !== undefined) {
    if (!VALID_CATEGORIES.includes(body.category)) {
      return { error: 'invalid_enum_value', field: 'category' };
    }
  }
  if (requireAll || body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return { error: 'invalid_enum_value', field: 'priority' };
    }
  }

  if (requireAll) {
    if (!body.candidate_id) return { error: 'missing_required_field', field: 'candidate_id' };
    if (!body.source_email_id) return { error: 'missing_required_field', field: 'source_email_id' };
    if (!body.thread_id) return { error: 'missing_required_field', field: 'thread_id' };
    if (!body.title) return { error: 'missing_required_field', field: 'title' };
    if (body.confidence === undefined || body.confidence === null) return { error: 'missing_required_field', field: 'confidence' };
  }

  return null;
}

// POST /tasks — create a task
router.post('/', async (req, res) => {
  const body = req.body;

  const validationError = validateTaskFields(body, true);
  if (validationError) return res.status(400).json(validationError);

  const taskId = 'tsk_' + uuidv4().replace(/-/g, '').substring(0, 6);
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO tasks
        (task_id, candidate_id, source_email_id, thread_id, title, description,
         assignee_id, category, priority, due_date, deal_value_inr, company_name,
         confidence, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (source_email_id, candidate_id) DO NOTHING`,
      [
        taskId,
        body.candidate_id.toLowerCase().trim(),
        body.source_email_id,
        body.thread_id,
        body.title,
        body.description || null,
        body.assignee_id,
        body.category,
        body.priority,
        body.due_date || null,
        body.deal_value_inr || null,
        body.company_name || null,
        body.confidence,
        now,
      ]
    );

    // Check if it was actually inserted (vs skipped due to conflict)
    const { rows } = await pool.query(
      'SELECT task_id, created_at FROM tasks WHERE source_email_id=$1 AND candidate_id=$2',
      [body.source_email_id, body.candidate_id.toLowerCase().trim()]
    );

    return res.status(201).json({
      task_id: rows[0].task_id,
      candidate_id: body.candidate_id.toLowerCase().trim(),
      source_email_id: body.source_email_id,
      created_at: rows[0].created_at,
    });
  } catch (err) {
    if (err.code === '23514') {
      // Check constraint violation
      const match = err.detail?.match(/\((\w+)\)/);
      return res.status(400).json({ error: 'invalid_enum_value', field: match?.[1] || 'unknown' });
    }
    console.error('POST /tasks error:', err);
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// PATCH /tasks/:task_id — update a task
router.patch('/:task_id', async (req, res) => {
  const { task_id } = req.params;
  const body = req.body;

  // Validate provided enum fields
  const validationError = validateTaskFields(body, false);
  if (validationError) return res.status(400).json(validationError);

  const allowed = ['title', 'description', 'assignee_id', 'category', 'priority',
                   'due_date', 'deal_value_inr', 'company_name', 'confidence'];

  const updates = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = $${idx++}`);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'no_fields_to_update' });

  updates.push(`updated_at = $${idx++}`);
  values.push(new Date().toISOString());
  values.push(task_id);

  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE task_id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) return res.status(404).json({ error: 'task_not_found' });
    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('PATCH /tasks error:', err);
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// GET /tasks — list tasks
router.get('/', async (req, res) => {
  const { candidate_id, thread_id, source_email_id, assignee_id } = req.query;

  if (!candidate_id) return res.status(400).json({ error: 'candidate_id_required' });

  let query = 'SELECT * FROM tasks WHERE candidate_id = $1';
  const params = [candidate_id.toLowerCase().trim()];
  let idx = 2;

  if (thread_id) { query += ` AND thread_id = $${idx++}`; params.push(thread_id); }
  if (source_email_id) { query += ` AND source_email_id = $${idx++}`; params.push(source_email_id); }
  if (assignee_id) { query += ` AND assignee_id = $${idx++}`; params.push(assignee_id); }

  query += ' ORDER BY created_at DESC';

  try {
    const { rows } = await pool.query(query, params);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('GET /tasks error:', err);
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// DELETE /tasks/:task_id — delete one task
router.delete('/:task_id', async (req, res) => {
  const { task_id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE task_id = $1', [task_id]);
    if (rowCount === 0) return res.status(404).json({ error: 'task_not_found' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// GET /users — team roster
router.get('/users', (req, res) => {
  res.status(200).json(teamRoster);
});

module.exports = router;
