require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id         TEXT PRIMARY KEY,
        candidate_id    TEXT NOT NULL,
        source_email_id TEXT NOT NULL,
        thread_id       TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT,
        assignee_id     TEXT NOT NULL
          CHECK (assignee_id IN ('u_aarti','u_rohit','u_meera','u_karan','u_divya','u_triage')),
        category        TEXT NOT NULL
          CHECK (category IN ('enterprise_rfp','smb_enquiry','marketing','alliances','finance','triage')),
        priority        TEXT NOT NULL
          CHECK (priority IN ('high','medium','low')),
        due_date        DATE,
        deal_value_inr  INTEGER,
        company_name    TEXT,
        confidence      REAL NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ,
        UNIQUE (source_email_id, candidate_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_emails (
        id              SERIAL PRIMARY KEY,
        candidate_id    TEXT NOT NULL,
        email_id        TEXT NOT NULL,
        thread_id       TEXT NOT NULL,
        decision        TEXT NOT NULL
          CHECK (decision IN ('created','updated','skipped','error')),
        skip_reason     TEXT,
        category        TEXT,
        assignee_id     TEXT,
        confidence      REAL,
        llm_reasoning   TEXT,
        run_id          TEXT,
        task_id         TEXT,
        processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (email_id, candidate_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ingest_runs (
        run_id        TEXT PRIMARY KEY,
        candidate_id  TEXT NOT NULL,
        started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at   TIMESTAMPTZ,
        total         INTEGER DEFAULT 0,
        processed     INTEGER DEFAULT 0,
        tasks_created INTEGER DEFAULT 0,
        tasks_updated INTEGER DEFAULT 0,
        skipped       INTEGER DEFAULT 0,
        errors        INTEGER DEFAULT 0
      );
    `);

    // Keep existing deployments compatible with the progress API.
    await client.query(`ALTER TABLE ingest_runs ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`);

    // One row per email attempt in each ingest run. processed_emails is the
    // canonical classification (one row per email), while this table keeps
    // replayed batches queryable by their own run_id without overwriting the
    // original classification's run ownership.
    await client.query(`
      CREATE TABLE IF NOT EXISTS ingest_run_emails (
        id              SERIAL PRIMARY KEY,
        run_id          TEXT NOT NULL REFERENCES ingest_runs(run_id) ON DELETE CASCADE,
        candidate_id    TEXT NOT NULL,
        email_id        TEXT NOT NULL,
        decision        TEXT NOT NULL DEFAULT 'error'
          CHECK (decision IN ('created','updated','skipped','error')),
        task_id         TEXT,
        processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (run_id, candidate_id, email_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ingest_run_emails_scope_idx
      ON ingest_run_emails (run_id, candidate_id, email_id);
    `);

    // Backfill memberships for data created before this table was introduced.
    await client.query(`
      INSERT INTO ingest_run_emails (run_id, candidate_id, email_id, decision, task_id)
      SELECT p.run_id, p.candidate_id, p.email_id, p.decision, p.task_id
      FROM processed_emails p
      INNER JOIN ingest_runs r ON r.run_id = p.run_id
      WHERE p.run_id IS NOT NULL
      ON CONFLICT (run_id, candidate_id, email_id) DO NOTHING;
    `);

    console.log('✅ Database tables initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
