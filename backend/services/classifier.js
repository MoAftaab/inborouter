require('dotenv').config();
const OpenAI = require('openai');
const { isWithin72h } = require('../utils/deadline');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rawModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MODEL = (rawModel.includes('5.4') || rawModel.includes('gpt-5')) ? 'gpt-4o-mini' : rawModel;

const SYSTEM_PROMPT = `You are an email routing classifier for a B2B services company called "Company".
Given one email JSON object, output ONLY a valid JSON object with these exact keys:

{
  "decision": "create_task" or "skip",
  "skip_reason": "out_of_office" or "newsletter" or "spam" or null,
  "assignee_id": one of "u_aarti","u_rohit","u_meera","u_karan","u_divya","u_triage" or null,
  "category": one of "enterprise_rfp","smb_enquiry","marketing","alliances","finance","triage" or null,
  "priority": "high" or "medium" or "low" or null,
  "due_date": "YYYY-MM-DD" or null,
  "deal_value_inr": integer or null,
  "company_name": string or null,
  "confidence": float between 0.0 and 1.0,
  "reasoning": "one sentence explanation"
}

ROUTING RULES (apply in this priority order):

RULE 1 - SKIP FIRST (highest priority):
  - Out-of-office auto-replies → skip, skip_reason: "out_of_office"
  - Newsletters, digests, "[Unsubscribe]" emails → skip, skip_reason: "newsletter"
  - Unsolicited vendor pitches selling TO us (SEO spam, cold outreach selling their services) → skip, skip_reason: "spam"
  - KEY: Vendor spam may use marketing keywords (webinar, PR, content) but is selling TO us. Direction of intent matters.

RULE 2 - PSU/GOVERNMENT OVERRIDE:
  - Tenders from PSU/government entities (BHEL, NTPC, ONGC, SAIL, ISRO, railways, municipal, govt, PSU) → ALWAYS u_aarti, category: "enterprise_rfp"
  - This overrides deal value rules. Even a ₹1 PSU tender goes to u_aarti.

RULE 3 - DEAL VALUE (only if Rule 2 doesn't apply):
  - Deal value > ₹10,00,000 (10 lakhs) → u_aarti, category: "enterprise_rfp"
  - Deal value <= ₹10,00,000 → u_rohit, category: "smb_enquiry"

RULE 4 - MARKETING:
  - Event sponsorships, webinars, conference participation, PR opportunities, content collaborations → u_meera, category: "marketing"
  - IMPORTANT: ₹4,00,000 sponsorship fee → u_meera (NOT u_rohit). Money in marketing context ≠ sales deal.

RULE 5 - ALLIANCES:
  - Reseller requests, channel partner proposals, technology integration → u_karan, category: "alliances"

RULE 6 - FINANCE:
  - Invoices, purchase orders, payment reminders, GST queries, billing → u_divya, category: "finance"
  - Invoice amounts are NOT deal_value_inr. Set deal_value_inr: null for invoices.

RULE 7 - DEMO/SMB (no value stated):
  - Small company demo requests, product enquiries with no stated value → u_rohit, category: "smb_enquiry"

RULE 8 - TRIAGE (when rules conflict):
  - Two or more routing rules conflict → u_triage, category: "triage", confidence < 0.5
  - Multiple distinct asks in one email for different owners → u_triage
  - Deal value stated as TBD/unclear AND no other clear category → u_triage

RULE 9 - PRIORITY:
  - Any deadline within 72 hours of received_at → priority: "high" (regardless of owner)
  - Overdue invoices/payments → priority: "high"
  - Clearly urgent language with no specific date → priority: "medium"
  - No urgency signals → priority: "low"

CRITICAL CONSTRAINTS:
  - NEVER fabricate due_date, deal_value_inr, or company_name. Use null if not explicitly stated.
  - NEVER infer company from email domain unless it's completely unambiguous.
  - Indian currency: "1.2 cr" = 12000000, "25 lakhs" = 2500000, "6.5L" = 650000, "Rs. 1,18,000" = 118000
  - Thread replies: extract ONLY from NEW content, ignore quoted/forwarded text below "---" or "On ... wrote:"
  - If the email is selling TO us (has pricing for their services, mentions their company offering) → skip as spam
  - When in doubt → u_triage with lower confidence score`;

/**
 * Sleep utility for retry backoff
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call OpenAI with exponential backoff retry
 */
async function callOpenAI(messages, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_completion_tokens: 512,
      });
      return response.choices[0].message.content;
    } catch (err) {
      const isRateLimit = err.status === 429 || err.code === 'rate_limit_exceeded';
      const isRetryable = isRateLimit || err.status === 500 || err.status === 503;

      if (isRetryable && attempt < retries) {
        const delay = Math.pow(4, attempt - 1) * 1000; // 1s, 4s, 16s
        console.warn(`OpenAI attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Classify a single email using OpenAI
 */
async function classifyEmail(email) {
  // Strip quoted reply content to avoid double-extraction
  let body = email.body || '';
  const quotedMarkers = [
    /\n-{3,}\s*Original [Mm]essage.*/s,
    /\nOn .+ wrote:.*/s,
    /\n>{1,}.*/gm,
    /\n_{3,}.*/s,
  ];
  for (const marker of quotedMarkers) {
    body = body.replace(marker, '');
  }
  body = body.trim().substring(0, 2000); // Limit to 2000 chars

  const emailContext = JSON.stringify({
    email_id: email.email_id,
    from_name: email.from_name,
    from_email: email.from_email,
    subject: email.subject,
    body,
    received_at: email.received_at,
    is_reply: email.is_reply,
    message_index: email.message_index,
    cc: email.cc,
    attachments: email.attachments,
  });

  const raw = await callOpenAI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Classify this email:\n${emailContext}` },
  ]);

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from LLM: ${raw}`);
  }

  // Validate and normalise
  const validAssignees = ['u_aarti', 'u_rohit', 'u_meera', 'u_karan', 'u_divya', 'u_triage'];
  const validCategories = ['enterprise_rfp', 'smb_enquiry', 'marketing', 'alliances', 'finance', 'triage'];
  const validPriorities = ['high', 'medium', 'low'];
  const validSkipReasons = ['out_of_office', 'newsletter', 'spam'];

  const safeTriage = {
    decision: 'create_task',
    skip_reason: null,
    assignee_id: 'u_triage',
    category: 'triage',
    priority: 'medium',
    due_date: null,
    deal_value_inr: null,
    company_name: null,
    confidence: 0.05,
    reasoning: 'The classifier returned an invalid result; routed to triage for human review.',
  };

  if (result.decision === 'skip') {
    if (!validSkipReasons.includes(result.skip_reason)) return safeTriage;
    return {
      ...result,
      assignee_id: null,
      category: null,
      priority: null,
      confidence: 0.99,
    };
  }

  if (result.decision !== 'create_task') return safeTriage;

  if (result.decision === 'create_task') {
    if (!validAssignees.includes(result.assignee_id) || !validCategories.includes(result.category)) {
      return safeTriage;
    }
    if (!validPriorities.includes(result.priority)) result.priority = 'medium';

    if (typeof result.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(result.due_date)) {
      result.due_date = null;
    }
    if (!Number.isInteger(result.deal_value_inr) || result.deal_value_inr < 0) {
      result.deal_value_inr = null;
    }
    if (typeof result.company_name !== 'string' || !result.company_name.trim()) {
      result.company_name = null;
    }

    // Apply 72h deadline escalation
    if (result.due_date && isWithin72h(email.received_at, result.due_date)) {
      result.priority = 'high';
    }

    // Clamp confidence
    const confidence = Number(result.confidence);
    result.confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5;
  }

  return result;
}

module.exports = { classifyEmail };
