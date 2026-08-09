# InboxRouter

AI-powered sales inbox routing: classify incoming emails, create or update the right task, preserve thread history, and give operators a grounded view of routing performance.

| | URL |
|---|---|
| Frontend | [inborouter.vercel.app](https://inborouter.vercel.app/) |
| Backend | [inborouter.onrender.com](https://inborouter.onrender.com/) |
| Backend health | [inborouter.onrender.com/health](https://inborouter.onrender.com/health) |

`candidate_id`: `moaftaab786@gmail.com`

## What the product does

InboxRouter turns an unstructured email batch into an operational task queue. Each email is classified into a business category, assigned to the right owner, scored for priority and confidence, and either converted into a task or recorded as an intentional skip.

The application is designed for a sales operations user who needs to answer four questions quickly:

1. What arrived and how was it routed?
2. Which tasks need attention now?
3. Why was an email skipped or sent to triage?
4. Can I trust the numbers for this batch?

## Architecture

![InboxRouter system architecture](docs/architecture.svg)

### Runtime components

| Component | Responsibility |
|---|---|
| Vercel SPA | Hosts the React/Vite operator console and sends HTTPS JSON requests to the API. |
| Render Web Service | Runs the Node.js/Express API, ingest orchestrator, task routes, chat routes, health endpoint, and optional keepalive. |
| OpenAI API | Produces structured email classifications, chat intent extraction, and concise answer phrasing. |
| Neon PostgreSQL | Stores tasks, canonical email decisions, ingest runs, run membership, thread metadata, and audit fields. |
| Render / external monitor | Uses `/health` for readiness checks; an optional 10-minute keepalive reduces demo cold starts. |

### Main request flow

```text
Browser
  -> Vercel React app
  -> Render Express API
  -> domain service
  -> PostgreSQL and/or OpenAI
  -> JSON response
  -> UI updates without a full page reload
```

### Email ingest flow

1. The Batch screen submits a JSON array to `POST /ingest`.
2. The API normalizes the candidate ID and creates an `ingest_runs` row before processing starts.
3. Each email is checked for an existing canonical decision using `(candidate_id, email_id)`.
4. New emails are classified by the LLM with deterministic fallback rules for service resilience.
5. The result is reconciled against the thread:
   - an existing thread task is patched;
   - a new thread creates a new task;
   - a duplicate email does not create duplicate work.
6. The canonical decision is stored in `processed_emails`.
7. A membership row is stored in `ingest_run_emails` for every attempted email, including idempotent replays.
8. Aggregate counters are updated in `ingest_runs` and the UI polls `GET /api/ingest/:run_id` for progress.

### Chat flow

1. The Chat screen sends a natural-language question to `POST /api/chat`.
2. The chat service classifies the question into a small, explicit intent set.
3. The matching handler executes parameterized SQL against PostgreSQL.
4. Optional `run_id`/`run_ids` scope the query to a specific ingest batch.
5. The final answer is phrased using only the returned database data and includes `supporting_data` for auditability.
6. Out-of-scope requests are rejected instead of being presented as completed actions.

## Core features

| Feature | Short explanation |
|---|---|
| AI email classification | Converts email text into category, assignee, priority, confidence, deal value, skip reason, and reasoning. |
| Business routing rules | Covers enterprise RFPs, SMB enquiries, marketing, alliances, finance, triage, spam, newsletters, and out-of-office cases. |
| Structured JSON handling | Uses JSON mode, defensive parsing, retry/fallback behavior, and a deterministic fallback classifier when the model response is unusable. |
| Idempotent ingestion | Replaying the same email does not create duplicate canonical tasks or classifications. |
| Thread reconciliation | Replies update the original task when they belong to the same thread; new threads create new tasks. |
| Run-level membership | Separates canonical email state from run membership so replayed batches still have correct chat and statistics scope. |
| Live progress | Persists run status and counters so the progress bar survives tab switches and long-running ingestion. |
| Task operations | Supports create, list, update, delete, filtering, assignment, priority, confidence, and source/thread metadata. |
| Grounded chat | Supports category counts, triage, skipped reasons, spurious rate, priority/confidence, deal value, assignee lists, thread updates, and general stats. |
| Spurious-rate semantics | Counts only skipped emails with `skip_reason = spam`; newsletter and out-of-office are not counted as spurious vendor spam. |
| Batch history | Lets Chat scope answers to the latest batch, all history, or a selected historical run. |
| Evidence panel | Shows the supporting JSON returned by the API so an operator can audit the answer. |
| Operator dashboard | Provides metrics, category breakdown, skipped reasons, recent tasks, recent runs, and system status. |
| Evaluation runner | Runs contract, routing, idempotency, and thread-reconciliation checks against the live API. |
| Deployment health | Includes Render `/health`, Vercel configuration, CORS configuration, and optional keepalive support. |

## Data model

### `tasks`

The operational work queue. It stores the task title, description, category, assignee, priority, confidence, deal value, deadline, source email ID, thread ID, and update timestamps.

### `processed_emails`

The canonical classification ledger. It contains one decision per candidate/email pair and records whether the email created a task, updated a task, was skipped, or encountered an error.

### `ingest_runs`

One row per submitted batch. It stores the run ID, candidate, start/finish timestamps, total size, processed count, created count, updated count, skipped count, and error count.

### `ingest_run_emails`

The run-membership table. It records every email attempted in every run, including replays, and optionally links the attempt to a task. This prevents an idempotent replay from appearing empty when Chat is scoped to the replay run.

## API reference

### Service and health

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/` | Returns a human-friendly API service summary and endpoint list. |
| `GET` | `/health` | Lightweight health/readiness response for Render and monitors. |
| `GET` | `/users` | Returns the supported team roster. |
| `GET` | `/api-docs` | Interactive Swagger UI for the complete API contract. |
| `GET` | `/openapi.json` | Raw OpenAPI specification in JSON format. |
| `GET` | `/openapi.yaml` | Raw OpenAPI specification in YAML format. |

### Task contract

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/tasks` | Create a task. |
| `GET` | `/tasks?candidate_id=...` | List tasks with optional filters. |
| `PATCH` | `/tasks/:task_id` | Update task fields. |
| `DELETE` | `/tasks/:task_id` | Delete a task. |

### Ingest and operator APIs

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/ingest` | Process a batch of emails; batches are capped at 100 emails per request. |
| `GET` | `/api/ingest/:run_id?candidate_id=...` | Poll progress for a run. |
| `GET` | `/api/tasks?candidate_id=...` | Frontend task view data. |
| `GET` | `/api/stats?candidate_id=...` | Aggregate metrics, skip reasons, spurious count, and `by_run`. |
| `POST` | `/api/chat` | Grounded natural-language query endpoint. |
| `GET` | `/api/generate-emails` | Generate the demo email dataset. |
| `GET` | `/api/test/run` | Run the backend test suite. |

### Example ingest request

```json
{
  "candidate_id": "moaftaab786@gmail.com",
  "run_id": "optional-client-run-id",
  "emails": [
    {
      "email_id": "email-001",
      "thread_id": "thread-001",
      "from": "buyer@example.com",
      "subject": "Enterprise RFP for implementation support",
      "body": "Please share pricing and implementation timelines."
    }
  ]
}
```

### Example chat request

```json
{
  "candidate_id": "moaftaab786@gmail.com",
  "query": "How many enterprise RFPs were in the latest batch?",
  "run_ids": ["run_123"]
}
```

The chat response contains a concise answer plus `supporting_data`, scope metadata, and out-of-scope flags when applicable.

### Interactive Swagger documentation

The backend serves a checked-in OpenAPI 3.0 contract from [`backend/openapi.yaml`](backend/openapi.yaml).
After starting the backend, open [`http://localhost:3000/api-docs`](http://localhost:3000/api-docs) to try
requests interactively. The deployed documentation is available at
[`inborouter.onrender.com/api-docs`](https://inborouter.onrender.com/api-docs).

The same contract is available as [`/openapi.json`](https://inborouter.onrender.com/openapi.json) and
[`/openapi.yaml`](https://inborouter.onrender.com/openapi.yaml) for importing into Postman, Insomnia, or
other API tooling. Routes that read candidate data require `candidate_id`; the ingest and chat schemas
also document the 100-email batch limit and optional run-level chat scoping.

## Local development

### Prerequisites

- Node.js 18 or newer
- A PostgreSQL connection string, such as Neon PostgreSQL
- An OpenAI API key

### Backend

```bash
cd backend
cp .env.example .env
npm ci
npm run dev
```

The local API runs at `http://localhost:3000` unless `PORT` is set.

### Frontend

Open a second terminal:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

The Vite app runs at `http://localhost:5173`.

### Environment variables

Backend `.env`:

```env
OPENAI_API_KEY=your-openai-api-key
DATABASE_URL=postgresql://user:password@host:5432/database
CANDIDATE_ID=your.email@example.com
OPENAI_MODEL=gpt-4o-mini
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Optional. Render provides PORT in production.
PORT=3000

# Optional Render demo keepalive.
KEEPALIVE_ENABLED=false
KEEPALIVE_URL=https://your-service.onrender.com/health
KEEPALIVE_INTERVAL_MS=600000
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_CANDIDATE_ID=moaftaab786@gmail.com
```

Never commit `.env` files or API keys. The repository tracks only `.env.example` templates.

## Deployment

### Backend on Render

This repository includes [`render.yaml`](render.yaml), so the preferred path is to create a Render Blueprint from the repository.

Manual settings are:

```text
Service type: Web Service
Repository: MoAftaab/inborouter
Branch: main
Root Directory: backend
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /health
```

Required Render environment variables:

```env
OPENAI_API_KEY=your-openai-api-key
DATABASE_URL=your-neon-postgres-connection-string
CANDIDATE_ID=moaftaab786@gmail.com
OPENAI_MODEL=gpt-4o-mini
NODE_ENV=production
FRONTEND_URL=https://inborouter.vercel.app
```

Optional keepalive settings:

```env
KEEPALIVE_ENABLED=true
KEEPALIVE_URL=https://inborouter.onrender.com/health
KEEPALIVE_INTERVAL_MS=600000
```

Do not set `PORT` manually on Render. The server uses the platform-provided port and binds to `0.0.0.0`.

### Frontend on Vercel

The [`frontend/vercel.json`](frontend/vercel.json) file configures Vite, `npm ci`, `npm run build`, the `dist` output directory, and SPA fallback rewrites.

Vercel settings:

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Vercel environment variables:

```env
VITE_API_URL=https://inborouter.onrender.com
VITE_CANDIDATE_ID=moaftaab786@gmail.com
```

`FRONTEND_URL` must exactly match the Vercel production origin without a trailing slash. Vite variables are build-time values, so redeploy after changing them.

### Deployment order

1. Deploy the Render backend and copy its public URL.
2. Set `VITE_API_URL` in Vercel and deploy the frontend.
3. Set `FRONTEND_URL` in Render to the Vercel production URL.
4. Set the optional keepalive variables and redeploy/restart Render.
5. Verify `/`, `/health`, the Vercel UI, and one test chat question.

## Evaluation and quality checks

Run the local preflight evaluator:

```bash
cd backend
npm run evaluate
```

The evaluator uses an isolated candidate ID by default. To test a deployed service:

```bash
$env:EVAL_BASE_URL = "https://inborouter.onrender.com"
npm run evaluate
```

The assignment preflight covers:

- Task API contract validation
- Correct, misrouted, missed, and spurious routing buckets
- Idempotent replay behavior
- Thread reply update behavior
- New-thread task creation
- Chat batch scoping
- Spurious-rate semantics
- Stats `spurious_flagged` and `by_run` regression checks

Recorded preflight result in [`EVALS.md`](EVALS.md):

| Check | Result |
|---|---|
| Run 1 accuracy | 60/60 correct; 0 misrouted, 0 missed, 0 spurious |
| Run 2 idempotency | 53 tasks before and after; 60 idempotent replays |
| Run 3 reconciliation | 1 reply updated, 1 new thread created, task growth = 1 |

The frontend production build can be checked with:

```bash
cd frontend
npm run build
```

## Reliability and scaling

### Current assignment-sized path

The current ingest endpoint processes a request synchronously and caps each request at 100 emails. It persists the run before processing, reports progress, retries/falls back around classification failures, and is safe to replay.

### Next production step for 10,000 emails/day

At higher volume, move email processing out of the HTTP request into a queue and worker system:

```text
POST /ingest -> create run + enqueue jobs -> return run_id
worker -> classify -> write task/decision -> update progress
frontend -> poll run status or subscribe to events
```

A Redis-compatible queue such as BullMQ, a Render background worker, bounded concurrency, provider rate limits, retry backoff, and dead-letter handling would make this path suitable for sustained production throughput.

### Operational caveats

- Render Free services can cold-start and can restart; use a paid instance for guaranteed availability.
- The optional self-keepalive only runs while the service process is alive. An external monitor is more reliable for waking a sleeping Free service.
- PostgreSQL is the durable store; the Render filesystem is not used as a source of truth.
- LLM output is treated as untrusted input and is guarded by JSON parsing, validation, fallbacks, and database-grounded chat answers.

## Project structure

```text
sales-inbox-router/
|-- backend/
|   |-- server.js                  Express app, CORS, health, startup
|   |-- openapi.yaml               OpenAPI 3.0 contract used by Swagger UI
|   |-- db.js                      PostgreSQL pool and schema initialization
|   |-- routes/
|   |   |-- tasks.js               Task API contract
|   |   |-- ingest.js              Batch routing and reconciliation
|   |   `-- api.js                 Stats, chat, progress, generator, tests
|   |-- services/
|   |   |-- classifier.js          Email classification and routing rules
|   |   |-- chatService.js          Intent handlers and grounded answers
|   |   |-- emailGenerator.js       Demo dataset generation
|   |   `-- keepalive.js            Optional Render health ping
|   |-- scripts/
|   |   `-- runAssignmentGrader.js  Point 8 preflight evaluator
|   `-- utils/
|       |-- currency.js             Deal-value parsing
|       `-- deadline.js              Deadline detection
|-- frontend/
|   |-- src/App.jsx                 Navigation, global stats, shared props
|   |-- src/components/
|   |   |-- DashboardTab.jsx        Metrics and run overview
|   |   |-- BatchTab.jsx             Ingest form and progress display
|   |   |-- TasksTab.jsx             Task board and detail drawer
|   |   |-- ChatTab.jsx              Grounded assistant UI
|   |   `-- TestsTab.jsx             Test runner UI
|   |-- vercel.json                  Vercel build and SPA configuration
|   `-- vite.config.js               Vite configuration
|-- docs/architecture.svg           Architecture image used above
|-- render.yaml                     Render Blueprint
|-- DECISIONS.md                    Engineering tradeoffs
|-- EVALS.md                        Evaluation method and results
`-- README.md                       This document
```

## Engineering decisions

The longer tradeoff record is in [`DECISIONS.md`](DECISIONS.md). The important choices are:

- Keep canonical classification state separate from run membership.
- Use idempotency keys based on candidate and source email identity.
- Keep chat answers grounded in parameterized SQL results rather than letting the LLM invent metrics.
- Treat spam-only skips as spurious for the assignment metric.
- Keep the assignment-sized synchronous path simple while documenting the queue/worker evolution for higher scale.

## Troubleshooting

### The Render root URL shows an API JSON response

That is expected. Render hosts the backend API; the operator UI is hosted on Vercel. Use the Vercel URL for the interface and `/health` for backend verification.

### The Vercel dashboard shows zeros or cannot connect

Check these values:

```env
VITE_API_URL=https://inborouter.onrender.com
VITE_CANDIDATE_ID=moaftaab786@gmail.com
```

Then confirm Render has:

```env
FRONTEND_URL=https://inborouter.vercel.app
```

The Vercel origin must match exactly and the frontend must be redeployed after changing `VITE_*` variables.

### Chat answers show no records for a replayed batch

Make sure the deployed database has the `ingest_run_emails` table. It is created during startup by `db.js` and is required for replay-safe run scoping.

### The first request is slow

A Render Free instance may be waking from sleep. The keepalive variables or an external monitor can reduce this during a demo; a paid instance removes the Free sleep behavior.

## Security notes

- Secrets belong in Render/Vercel environment settings, never in Git.
- Only `VITE_*` values are exposed to the browser; never place `OPENAI_API_KEY` in frontend variables.
- CORS is restricted to the configured `FRONTEND_URL` plus local development origins.
- SQL queries use parameterized values.
- Chat refuses action requests and external-system requests outside the supported read-only intents.

## License

Assignment project for the AI Labs sales inbox routing challenge.
