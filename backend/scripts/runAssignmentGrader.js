const fs = require('fs');
const path = require('path');

const BASE_URL = (process.env.EVAL_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const CANDIDATE_ID = (process.env.EVAL_CANDIDATE_ID || ('assignment-eval-' + Date.now() + '@example.com')).toLowerCase().trim();
const INBOX_PATH = path.join(__dirname, '..', 'inbox.json');
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

function readInbox() {
  const emails = JSON.parse(fs.readFileSync(INBOX_PATH, 'utf8'));
  if (!Array.isArray(emails) || emails.length < 208) {
    throw new Error('backend/inbox.json does not contain enough generated emails for the evaluator');
  }
  return emails;
}

async function request(endpoint, options = {}) {
  const response = await fetch(BASE_URL + endpoint, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error((options.method || 'GET') + ' ' + endpoint + ' returned ' + response.status + ': ' + JSON.stringify(body));
  }
  return body;
}

async function postIngest(emails) {
  return request('/ingest', {
    method: 'POST',
    body: JSON.stringify({ candidate_id: CANDIDATE_ID, emails }),
  });
}

async function getTasks(threadId) {
  const suffix = threadId ? '&thread_id=' + encodeURIComponent(threadId) : '';
  return request('/tasks?candidate_id=' + encodeURIComponent(CANDIDATE_ID) + suffix);
}

function buildRun1() {
  const all = readInbox();
  const expected = new Map();
  const selected = [];

  function add(emails, expectation) {
    for (const email of emails) {
      selected.push(email);
      expected.set(email.email_id, expectation);
    }
  }

  // 45 enterprise RFPs, 5 SMB enquiries, 3 marketing requests, and 7
  // explicit skip cases. This deterministic batch validates the deployed
  // contract; it is not a replacement for the grader's unseen batch.
  add(all.slice(0, 45), { skip: false, category: 'enterprise_rfp', assignee_id: 'u_aarti' });
  add(all.slice(45, 50), { skip: false, category: 'smb_enquiry', assignee_id: 'u_rohit' });
  add(all.slice(85, 88), { skip: false, category: 'marketing', assignee_id: 'u_meera' });
  add(all.slice(165, 167), { skip: true, skip_reason: 'out_of_office' });
  add(all.slice(185, 187), { skip: true, skip_reason: 'newsletter' });
  add(all.slice(205, 208), { skip: true, skip_reason: 'spam' });

  return { all, emails: selected, expected };
}

function metricCounts() {
  return { correct: 0, misrouted: 0, missed: 0, spurious: 0 };
}

function scoreRun1(tasks, expected) {
  const taskBySource = new Map(tasks.map(task => [task.source_email_id, task]));
  const buckets = metricCounts();
  const labels = ['enterprise_rfp', 'smb_enquiry', 'marketing', 'skip'];
  const matrix = {};
  labels.forEach(label => { matrix[label] = { tp: 0, fp: 0, fn: 0 }; });

  for (const [emailId, expectation] of expected.entries()) {
    const task = taskBySource.get(emailId);

    if (expectation.skip) {
      if (!task) {
        buckets.correct++;
        matrix.skip.tp++;
      } else {
        buckets.spurious++;
        matrix.skip.fn++;
        if (matrix[task.category]) matrix[task.category].fp++;
      }
      continue;
    }

    if (!task) {
      buckets.missed++;
      matrix[expectation.category].fn++;
      continue;
    }

    const routeCorrect = task.category === expectation.category &&
      task.assignee_id === expectation.assignee_id;
    if (routeCorrect) buckets.correct++;
    else buckets.misrouted++;

    if (task.category === expectation.category) {
      matrix[expectation.category].tp++;
    } else {
      matrix[expectation.category].fn++;
      if (matrix[task.category]) matrix[task.category].fp++;
    }
  }

  const categoryMetrics = {};
  for (const label of labels) {
    const item = matrix[label];
    const precision = item.tp + item.fp > 0 ? item.tp / (item.tp + item.fp) : 0;
    const recall = item.tp + item.fn > 0 ? item.tp / (item.tp + item.fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    categoryMetrics[label] = {
      ...item,
      precision: Number(precision.toFixed(3)),
      recall: Number(recall.toFixed(3)),
      f1: Number(f1.toFixed(3)),
    };
  }

  return {
    total_expected: expected.size,
    total_tasks: tasks.length,
    buckets,
    category_metrics: categoryMetrics,
  };
}

async function main() {
  const { all, emails, expected } = buildRun1();

  const run1Response = await postIngest(emails);
  const run1Tasks = await getTasks();
  const run1Score = scoreRun1(run1Tasks, expected);

  const beforeRun2 = run1Tasks.length;
  const run2Response = await postIngest(emails);
  const afterRun2Tasks = await getTasks();
  const run2 = {
    before_task_count: beforeRun2,
    after_task_count: afterRun2Tasks.length,
    task_count_stable: beforeRun2 === afterRun2Tasks.length,
    response: run2Response,
  };

  const reply = all.find(email => email.message_index > 0 && email.thread_id === 'th_0001');
  if (!reply) throw new Error('Could not find a generated reply on th_0001 for Run 3');

  const newEmail = {
    ...emails[45],
    email_id: 'assignment_eval_new_' + Date.now(),
    thread_id: 'assignment_eval_new_thread_' + Date.now(),
    subject: 'New thread demo request for Run 3',
    body: 'We would like a demo of your platform for our 20-person team. Nothing urgent.',
    is_reply: false,
    message_index: 0,
  };

  const beforeRun3 = afterRun2Tasks.length;
  const run3Response = await postIngest([reply, newEmail]);
  const afterRun3Tasks = await getTasks();
  const replyTasks = await getTasks(reply.thread_id);
  const newThreadTasks = await getTasks(newEmail.thread_id);
  const run3 = {
    before_task_count: beforeRun3,
    after_task_count: afterRun3Tasks.length,
    expected_growth: 1,
    actual_growth: afterRun3Tasks.length - beforeRun3,
    task_count_grew_only_for_new_thread: afterRun3Tasks.length - beforeRun3 === 1,
    reply_thread_task_count: replyTasks.length,
    new_thread_task_count: newThreadTasks.length,
    response: run3Response,
  };

  const report = {
    base_url: BASE_URL,
    candidate_id: CANDIDATE_ID,
    run1: { email_count: emails.length, response: run1Response, score: run1Score },
    run2,
    run3,
    passed: {
      run1_has_no_unexpected_errors: (run1Response.errors || []).length === 0,
      run2_idempotent: run2.task_count_stable,
      run3_reconciles_reply: run3.reply_thread_task_count === 1,
      run3_creates_one_new_thread: run3.task_count_grew_only_for_new_thread && run3.new_thread_task_count === 1,
    },
  };
  report.all_checks_passed = Object.values(report.passed).every(Boolean);

  console.log(JSON.stringify(report, null, 2));
  if (!report.all_checks_passed) process.exitCode = 1;
}

main().catch(error => {
  console.error(JSON.stringify({ all_checks_passed: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
