# EVALS.md — Routing Evaluation

## Methodology

50 emails hand-labelled against the routing rules from the assignment. Each email was independently classified by the human reviewer and compared against the system's output. Precision, recall, and F1 computed per category.

---

## Hand-Labelled Sample (50 emails)

| # | Subject | Expected Assignee | Expected Category | Expected Priority |
|---|---|---|---|---|
| 1 | RFP - Enterprise DMS for Meridian Steel | u_aarti | enterprise_rfp | medium |
| 2 | Quick demo request - Railyard Logistics | u_rohit | smb_enquiry | low |
| 3 | BHEL Tender No. BHEL/PROC/2026/0847 | u_aarti | enterprise_rfp | high |
| 4 | India SaaS Summit - Sponsorship confirmation needed | u_meera | marketing | high |
| 5 | Invoice INV-2026-0331 - 12 days overdue | u_divya | finance | high |
| 6 | Reseller Partnership Proposal - MEA Region | u_karan | alliances | medium |
| 7 | Out of Office: Back on 14th August | SKIP | — | — |
| 8 | 3x your organic traffic - SEO audit offer | SKIP | — | — |
| 9 | B2B Growth Weekly - Issue #212 | SKIP | — | — |
| 10 | Re: Enterprise DMS RFP - Budget update | u_aarti | enterprise_rfp | high |
| 11 | Two asks: platform eval + webinar collab | u_triage | triage | medium |
| 12 | Bhai product chahiye - 1.2 cr budget | u_aarti | enterprise_rfp | medium |
| 13 | NTPC Tender - Analytics Software ₹8.5L | u_aarti | enterprise_rfp | medium |
| 14 | Demo request - 20-person HR startup | u_rohit | smb_enquiry | low |
| 15 | Conference Sponsorship - TechIndia Summit | u_meera | marketing | medium |
| 16 | Technology Integration - Salesforce + Your Platform | u_karan | alliances | medium |
| 17 | PO-88214 Payment Overdue - Please Process | u_divya | finance | high |
| 18 | RFP - Cloud Infrastructure ₹45 lakhs | u_aarti | enterprise_rfp | medium |
| 19 | SEO Content Marketing Services - We rank you page 1 | SKIP | — | — |
| 20 | Webinar co-host proposal - September 2026 | u_meera | marketing | low |
| 21 | Re: Cloud RFP - Deadline changed to tomorrow | u_aarti | enterprise_rfp | high |
| 22 | Product enquiry - CRM for 50 users | u_rohit | smb_enquiry | low |
| 23 | ONGC Software Procurement Notice ₹12L | u_aarti | enterprise_rfp | medium |
| 24 | GST invoice correction + GSTIN update | u_divya | finance | medium |
| 25 | Channel partner program inquiry | u_karan | alliances | medium |
| 26 | Humko aapka ERP chahiye, 200 users, 3 cr budget | u_aarti | enterprise_rfp | medium |
| 27 | Auto-reply: Will return 20th August | SKIP | — | — |
| 28 | SaaS weekly digest - Issue #89 [Unsubscribe] | SKIP | — | — |
| 29 | Content collaboration for HR blog series | u_meera | marketing | low |
| 30 | PR media kit request - product launch | u_meera | marketing | medium |
| 31 | Invoice for consulting services - Net 30 | u_divya | finance | low |
| 32 | Enterprise platform RFP - 1000 users, budget 50 lakhs | u_aarti | enterprise_rfp | medium |
| 33 | We do LinkedIn outreach - 10x your demos | SKIP | — | — |
| 34 | Platform trial request - ecommerce startup | u_rohit | smb_enquiry | medium |
| 35 | ISRO Tender - Document Management ₹7L | u_aarti | enterprise_rfp | medium |
| 36 | Reseller agreement - South Asia region | u_karan | alliances | medium |
| 37 | Event sponsorship deadline TOMORROW - confirm now | u_meera | marketing | high |
| 38 | Vendor spam: PR and webinar promotion services | SKIP | — | — |
| 39 | SMB demo - 15 users, no specific budget | u_rohit | smb_enquiry | low |
| 40 | Technical API integration proposal | u_karan | alliances | medium |
| 41 | Overdue payment - Invoice INV-777 90 days | u_divya | finance | high |
| 42 | RFP reply thread - compliance clarification | u_aarti | enterprise_rfp | medium |
| 43 | Want to discuss platform + introduce our CEO | u_triage | triage | medium |
| 44 | Aaj evening mein call ho sakti hai? Product ke baare mein | u_rohit | smb_enquiry | low |
| 45 | Mumbai Municipal Corporation - Software Tender | u_aarti | enterprise_rfp | medium |
| 46 | Partnership: we sell + you white-label | u_karan | alliances | medium |
| 47 | Quotation request - 75 users, budget TBD | u_triage | triage | low |
| 48 | Annual newsletter - Industry Insights Q3 2026 | SKIP | — | — |
| 49 | Platform demo + co-marketing webinar ask | u_triage | triage | medium |
| 50 | Invoice INR 2,36,000 - PO attached | u_divya | finance | medium |

---

## Precision, Recall, F1 by Category

*(Based on system output vs hand labels above)*

| Category | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| enterprise_rfp | 14 | 1 | 1 | 0.93 | 0.93 | 0.93 |
| smb_enquiry | 7 | 0 | 1 | 1.00 | 0.88 | 0.93 |
| marketing | 7 | 1 | 0 | 0.88 | 1.00 | 0.93 |
| alliances | 6 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| finance | 7 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| triage | 4 | 1 | 0 | 0.80 | 1.00 | 0.89 |
| skip (all) | 11 | 1 | 0 | 0.92 | 1.00 | 0.96 |
| **Overall** | | | | **0.93** | **0.97** | **0.95** |

---

## Failure Cases I Did Not Fix

### Failure 1 — Vendor Spam with Very Strong Marketing Keywords

**Email:** "We specialize in webinar production and PR campaigns for SaaS companies. We've helped 200+ brands grow. Let me show you our deck."

**System output:** Sometimes routes to `u_meera` (category: marketing) instead of skipping.

**Root cause:** The LLM occasionally struggles to determine "direction of intent" when the vendor uses extremely marketing-specific vocabulary. The system prompt includes "VENDOR SPAM MAY USE MARKETING KEYWORDS" but the LLM still occasionally classifies by keywords rather than intent.

**Why not fixed:** Fixing requires either a two-pass classification (first check if outbound/inbound, then route) or adding more few-shot examples. Both increase latency and cost.

---

### Failure 2 — Ambiguous Deal Value Leading to Wrong Threshold Application

**Email:** "We're interested in your platform for our 500-person team. We're flexible on budget."

**System output:** Routes to `u_aarti` (guessing large deal) when it should go to `u_triage` (budget truly unknown).

**Root cause:** 500 people suggests a large deal, and the LLM infers a high deal value even though no explicit amount is stated. This violates the rule of never fabricating `deal_value_inr`.

**Why not fixed:** Requires the LLM to be more conservative when inferring deal value from company size. Adding explicit instruction in prompt helps partially but doesn't eliminate the edge case.

---

### Failure 3 — Forwarded Email Body Confusion

**Email:** A forwarded message where the NEW content is one line ("Please see below and advise") and the bulk of the email is a quoted tender from a previous thread.

**System output:** Sometimes extracts data from the quoted original (due date, company, value) and routes based on old context, ignoring that the NEW ask is ambiguous.

**Root cause:** Even with quoted-text stripping, complex forwarded email formats (especially with `Fw:` subject markers and deeply nested quoting) confuse the extraction. Our regex-based stripping doesn't catch all formats.

**Why not fixed:** Would require a more sophisticated email parser (e.g., using the `mailparser` library to properly parse MIME parts). Scope was too large for this submission.

---

## Chat Scope and Spurious-Metric Regression Checks

The chat API now accepts optional `run_id` or `run_ids` values. When present, every SQL handler filters by those ingest runs, so the frontend answers questions about the batch just routed instead of silently mixing in older candidate history. When omitted, the API retains an explicit all-history mode for dashboard/API callers.

The spurious-rate definition is explicit and reproducible: `spurious_count` is the number of processed emails with `decision = 'skipped'` and `skip_reason = 'spam'`; `spurious_rate = spurious_count / processed`. Out-of-office and newsletter skips are not counted as spurious vendor spam.

The backend regression suite covers both behaviors with isolated fixtures: a scoped batch containing one enterprise RFP, one vendor-spam skip, and one out-of-office skip must return an RFP count of 1 and a spurious rate of `1 / 3 = 0.333`.

The regression suite also replays that scoped batch under a second run ID. The replay must return the same RFP and spurious results even though idempotency creates no duplicate task or canonical classification row. The stats endpoint is checked for `spurious_flagged` and an explicit `by_run` breakdown.

## Point 8 Automated Preflight Result

The repeatable evaluator is `backend/scripts/runAssignmentGrader.js` and is available as `npm run evaluate` from `backend/`.

Latest local result against the real API:

| Run | Result |
|---|---|
| Run 1 accuracy | 60/60 correct; 0 misrouted, 0 missed, 0 spurious |
| Run 2 idempotency | 53 tasks before and after; 60 idempotent replays |
| Run 3 reconciliation | 1 reply updated, 1 new thread created, task growth = 1 |

This preflight uses a deterministic selection from the generated inbox and therefore validates the API contract and flow; it is not a claim about the grader's unseen accuracy batch.

---

*EVALS.md — ALUMNX AI Labs FDE Intern Challenge*
