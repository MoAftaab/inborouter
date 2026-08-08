# Sales Inbox → Task Router

**candidate_id:** `moaftaab786@gmail.com`

**Backend:** https://your-backend.onrender.com  
**Frontend:** https://your-app.vercel.app

> Update the URLs above after deployment, and set `CANDIDATE_ID` in backend `.env` to your actual email.

---

## Setup (3 commands)

```bash
# 1. Backend
cd backend && cp .env.example .env   # fill in CANDIDATE_ID with your email
npm install && npm run dev

# 2. Frontend (new terminal)
cd frontend && cp .env.example .env  # VITE_API_URL=http://localhost:3000
npm install && npm run dev
```

Frontend opens at http://localhost:5173

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | Neon Serverless PostgreSQL (cloud, free) |
| LLM | OpenAI gpt-4o-mini (JSON mode) |
| Frontend | React + Vite |
| Backend Deploy | Render Web Service |
| Frontend Deploy | Vercel |

---

## Project Structure

```
sales-inbox-router/
├── backend/
│   ├── server.js              Main Express app
│   ├── db.js                  Neon PostgreSQL + schema init
│   ├── team_roster.json       Team definitions
│   ├── routes/
│   │   ├── tasks.js           Task API (grader-facing)
│   │   ├── ingest.js          POST /ingest
│   │   └── api.js             /api/* (frontend + tests)
│   ├── services/
│   │   ├── classifier.js      GPT email classifier
│   │   ├── chatService.js     NLQ → SQL → GPT pipeline
│   │   └── emailGenerator.js  250 email generator
│   └── utils/
│       ├── currency.js        Indian currency parser
│       └── deadline.js        72h deadline detector
└── frontend/
    └── src/
        ├── App.jsx            5-tab app
        └── components/
            ├── DashboardTab.jsx
            ├── BatchTab.jsx   JSON input + email table
            ├── TasksTab.jsx   Task cards grid
            ├── ChatTab.jsx    Grounded NLQ chat
            └── TestsTab.jsx   43-test suite runner
```

---

## Environment Variables

### Backend `.env`
```
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
CANDIDATE_ID=your.email@example.com
OPENAI_MODEL=gpt-4o-mini
PORT=3000
NODE_ENV=development
FRONTEND_URL=https://your-app.vercel.app
KEEPALIVE_ENABLED=true
KEEPALIVE_URL=https://your-backend.onrender.com/health
KEEPALIVE_INTERVAL_MS=600000
```

### Frontend `.env`
```
VITE_API_URL=http://localhost:3000
VITE_CANDIDATE_ID=moaftaab786@gmail.com
```

---

## Key Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/tasks` | Create task (grader) |
| `PATCH` | `/tasks/:id` | Update task (grader) |
| `GET` | `/tasks?candidate_id=` | List tasks (grader) |
| `GET` | `/users` | Team roster (grader) |
| `POST` | `/ingest` | Batch classify emails |
| `GET` | `/api/ingest/:run_id?candidate_id=` | Live progress for a routing run |
| `GET` | `/api/stats` | Aggregate counts, spurious flags, category and run breakdowns |
| `POST` | `/api/chat` | Grounded NLQ chat |
| `GET` | `/api/generate-emails` | Generate 250 samples |
| `GET` | `/api/test/run` | Run 43 test cases |
| `GET` | `/health` | Health check |

`POST /api/chat` accepts optional `run_id` or `run_ids`. The frontend sends the run IDs returned by `/ingest`, so chat answers are scoped to the latest routed batch. If omitted, the endpoint intentionally queries all historical data for that candidate.

The Batch tab sends at most 100 emails per ingest request and polls the progress endpoint while the AI router processes that batch. The run record is persisted before processing starts, so switching UI tabs does not cancel the request or lose the progress display.

Every ingest attempt also writes an `ingest_run_emails` membership row. This is separate from the canonical `processed_emails` classification row so an idempotent replay can still be queried as its own batch without duplicating tasks or overwriting the original classification.

`GET /api/stats` includes `spurious_flagged` and `by_run`. `spurious_flagged` counts canonical emails skipped specifically as vendor spam; newsletters and out-of-office messages remain skipped but are not treated as spurious spam.

## Submission deployment checklist

The URLs at the top of this README are intentionally placeholders until deployment. Before submitting:

1. Deploy the backend with a persistent PostgreSQL `DATABASE_URL`, `OPENAI_API_KEY`, `CANDIDATE_ID`, `OPENAI_MODEL`, `NODE_ENV=production`, and the exact deployed frontend URL in `FRONTEND_URL`. Render provides `PORT`; the server binds to `0.0.0.0`.
2. Deploy the frontend with `VITE_API_URL` set to the deployed backend base URL and `VITE_CANDIDATE_ID` set to the same lowercased email used in the submission form.
3. Replace both placeholder URLs above with the real public HTTPS URLs and verify `/health`, `/users`, `/tasks?candidate_id=...`, `/ingest`, `/api/stats`, and `/api/chat` through the single backend URL.
4. Confirm the public repository contains no `.env` files or API keys and that setup still works in three commands or fewer.

## Point 8 preflight evaluator

Run the local assignment checks with:

```bash
cd backend && npm run evaluate
```

The evaluator exercises Run 1 accuracy and the correct/misrouted/missed/spurious buckets, then runs the exact same batch again for idempotency and posts a reply plus a new thread for reconciliation. Set `EVAL_BASE_URL` to test a deployed backend. It uses an isolated candidate ID by default; set `EVAL_CANDIDATE_ID` only when you intentionally want to test a specific candidate's data.

---

## Deployment

### Backend → Render
1. Push to GitHub
2. Connect Render to the repo and set Root Directory to `backend/` (or use the root `render.yaml` Blueprint)
3. Add `OPENAI_API_KEY`, `DATABASE_URL`, `CANDIDATE_ID`, `FRONTEND_URL`, and `KEEPALIVE_URL`
4. Set Health Check Path to `/health`, then deploy the Node web service with `npm ci` and `npm start`

### Frontend → Vercel
1. Connect Vercel to repo, set root to `frontend/`
2. Add `VITE_API_URL=https://your-backend.onrender.com`
3. Add `VITE_CANDIDATE_ID=moaftaab786@gmail.com` (must match the submission candidate ID)
4. Deploy

### Keep-warm
The Render Blueprint enables an optional server keepalive. Set `KEEPALIVE_URL` to the deployed backend URL plus `/health`; the backend sends a GET request every 10 minutes. This is useful for a demo, but Render Free services can still restart and the reliable production option is a paid instance. An external monitor such as UptimeRobot is also recommended because it sends inbound traffic even after a service has slept.
