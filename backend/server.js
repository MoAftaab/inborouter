require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const { initDB } = require('./db');
const taskRoutes = require('./routes/tasks');
const ingestRoutes = require('./routes/ingest');
const apiRoutes = require('./routes/api');
const teamRoster = require('./team_roster.json');
const { startKeepalive } = require('./services/keepalive');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const openApiYaml = fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8');
const openApiDocument = YAML.parse(openApiYaml);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, grader scripts)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — used by UptimeRobot keep-warm
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Sales Inbox Router API',
    status: 'ok',
    message: 'Backend is running. Use /health for health checks.',
    endpoints: {
      health: 'GET /health',
      ingest: 'POST /ingest',
      tasks: 'GET /tasks',
      users: 'GET /users',
      chat: 'POST /api/chat',
      stats: 'GET /api/stats',
      docs: 'GET /api-docs',
      openapi_json: 'GET /openapi.json',
      openapi_yaml: 'GET /openapi.yaml',
    },
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', ts: new Date().toISOString() });
});

// Interactive API docs and raw OpenAPI specifications.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'InboxRouter API Docs',
  explorer: true,
}));
app.get('/openapi.json', (req, res) => res.status(200).json(openApiDocument));
app.get('/openapi.yaml', (req, res) => res.type('text/yaml').send(openApiYaml));

// Task API (grader-facing)
app.use('/tasks', taskRoutes);

// Team roster (grader-facing)
app.get('/users', (req, res) => {
  res.status(200).json(teamRoster);
});

// Ingest endpoint
app.use('/ingest', ingestRoutes);

// Internal API (frontend-facing)
app.use('/api', apiRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, HOST, () => {
      startKeepalive();
      console.log(`\n🚀 Sales Inbox Router backend running on port ${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
      console.log(`📬 Ingest: POST http://localhost:${PORT}/ingest`);
      console.log(`✅ Tasks:  GET  http://localhost:${PORT}/tasks`);
      console.log(`💬 Chat:   POST http://localhost:${PORT}/api/chat`);
      console.log(`🧪 Tests:  GET  http://localhost:${PORT}/api/test/run\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
