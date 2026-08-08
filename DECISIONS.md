# DECISIONS.md — Engineering Tradeoffs

## 1. Rate Limiting & Retries

**Decision:** Process emails **sequentially** (not `Promise.all()`) with a 200ms inter-request delay plus exponential backoff on failure.

**Why:** OpenAI's `gpt-4o-mini` free tier has strict RPM limits. Parallel processing of 100 emails in one batch would immediately hit 429s. Sequential processing with 200ms gaps keeps us well within rate limits (~5 req/s vs the default 500 RPM limit).

**Retry strategy:** 3 attempts with delays of 1s → 4s → 16s. If all retries fail, the email is logged as `error` in `processed_emails` and the batch continues — a dropped email is preferable to crashing the entire batch.

**Tradeoff:** ~100 emails × 1.5s avg = ~150s per batch. Well within the 15-minute timeout.

**With 2 more weeks:** Implement a proper queue (Bull + Redis) with concurrency=3 and a token bucket rate limiter to safely parallelize without 429s.

---

## 2. Idempotency

**Decision:** Two-layer deduplication:
1. **DB-level:** `UNIQUE(source_email_id, candidate_id)` constraint in PostgreSQL. Duplicate inserts use `ON CONFLICT DO NOTHING`.
2. **App-level:** Before calling the LLM, check `processed_emails` table for `email_id`. If found, skip entirely — no LLM cost, no DB write attempt.

**Why:** The grader explicitly sends the same batch twice (Run 2). Without this, a 60-email batch run twice would give 120 tasks. The DB constraint is the final safety net; the app-level check is the cost-saving optimization.

**What this guards against:** Free-tier hosting cold restarts between Run 1 and Run 2. Even if the process restarts, the DB retains all `processed_emails` records.

---

## 3. Data Model for Chat (No Re-LLM)

**Decision:** Store LLM reasoning, category, assignee, skip_reason, and confidence in `processed_emails` at write time. Chat queries are **pure SQL** against this table.

**Why:** If chat answers were derived by re-calling the LLM ("what do you remember about the emails?"), answers would be:
- Inconsistent (LLM might summarize differently each time)
- Expensive (100 emails × chat query = 100 API calls)
- Hallucination-prone (LLM can't "remember" emails from a past context)

**The pipeline:** User question → GPT classifies intent → SQL query runs → raw numbers passed to GPT for phrasing → answer returned with `supporting_data`.

GPT is **only used for two things** in chat: (1) intent classification (tiny prompt, cheap) and (2) phrasing the answer from actual SQL results. Numbers are always from the DB.

**With 2 more weeks:** Add a proper intent-to-SQL transpiler with more complex filter support (e.g., "high priority RFPs from PSU companies this week").

---

## 4. Chat Anti-Hallucination

**Decision:** The GPT phrasing prompt explicitly says: _"Use ONLY the numbers and data provided below. Do not invent, estimate, or extrapolate. If the data shows 0 for a category, say 'zero' plainly."_

**Additionally:**
**Batch scope and spurious definition:** After each ingest, the frontend keeps the returned `run_id` values and sends them with chat questions. Every chat SQL handler applies that run scope when present; API callers that omit it intentionally query all historical data. For the spurious-rate metric, `spurious_count` means emails explicitly skipped as vendor spam (`skip_reason = 'spam'`) divided by processed emails. Newsletters and out-of-office messages are skipped, but they are not spurious vendor-spam flags.

- Every response includes `supporting_data` (the raw SQL result). The frontend displays this as a collapsible JSON block — a human can always cross-check the answer against the raw data.
- Zero-count categories return `0`, not `null`, not an empty response — this prevents LLMs from "filling in" what seems like a reasonable number.
- Out-of-scope intents (action requests, external system queries) are detected by the intent classifier and return a hardcoded decline response. No LLM is consulted for out-of-scope queries.

**The GST refund trap:** Q7 in the test suite explicitly asks about a category with zero matches. This is the most common failure point — systems that were trained to be "helpful" tend to fabricate a plausible number. Our pipeline returns `{gst_refund_count: 0}` from SQL.

**With 2 more weeks:** Add result verification: ask GPT to check if its answer contradicts the data, and retry once if so.

---

## 5. Known Shipped Defect: Multi-Ask Split

**Decision:** Emails with two distinct asks (e.g., "evaluate our platform AND set up a webinar collab") are routed to `u_triage` as a single task — not split into two separate tasks.

**Why shipped:** Splitting requires creating two tasks from one `source_email_id`. This breaks the `UNIQUE(source_email_id, candidate_id)` idempotency constraint without additional engineering (e.g., using `source_email_id + "_1"`, `source_email_id + "_2"` as synthetic IDs). This edge case affects ~4 emails in the 250-email batch, and routing both to triage with a clear reason is a safe fallback documented per the assignment's guidance.

**What I'd do with 2 more weeks:** Allow `source_email_id` to be `em_001_a` / `em_001_b` for split tasks, update the LLM prompt to output an array of task objects, and add a `split_from` field to preserve the link back to the original email.

---

*DECISIONS.md — ALUMNX AI Labs FDE Intern Challenge*
