const fs = require('fs');
const path = require('path');

// Seed generator for 250 realistic emails matching all specs & edge cases
const indianCompanies = [
  'Meridian Steel Ltd', 'Railyard Logistics', 'SaasSummit India', 'Halcyon Retail',
  'Vantage Cloud Services', 'Zenith Cloud Partners', 'Apex Infrastructure', 'Bharat Heavy Electricals Limited (BHEL)',
  'NTPC Limited', 'Oil and Natural Gas Corporation (ONGC)', 'Steel Authority of India (SAIL)', 'Indian Space Research Organisation (ISRO)',
  'Meridian Tech Services', 'Halcyon Global', 'Trident Systems', 'Kriti Infotech', 'Paramount Solutions', 'Skyline Networks'
];

const senderNames = [
  'Suresh Kulkarni', 'Ankit Bose', 'Nandita Reddy', 'Raghav Sharma', 'Farhan Qureshi',
  'Aarti Menon', 'Rohit Sharma', 'Meera Iyer', 'Karan Doshi', 'Divya Rao',
  'Priya Patel', 'Vikram Malhotra', 'Sneha Kapoor', 'Amitabh Verma', 'Rajesh Gupta'
];

const categories = [
  'enterprise_rfp', 'smb_enquiry', 'marketing', 'alliances', 'finance',
  'triage', 'out_of_office', 'newsletter', 'spam'
];

const emails = [];

let emailCount = 1;
let threadCount = 1;

// 1. Clean Enterprise RFPs (45 emails)
for (let i = 0; i < 45; i++) {
  const isPsu = i < 8;
  const company = isPsu
    ? ['BHEL', 'NTPC', 'ONGC', 'SAIL', 'ISRO'][i % 5] + ' Limited'
    : indianCompanies[i % indianCompanies.length];
  const value = isPsu ? (650000 + i * 50000) : (1200000 + i * 500000);
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: senderNames[i % senderNames.length],
    from_email: `contact@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.in`,
    to: "sales@company.com",
    cc: [],
    subject: `RFP - Software & Services Proposal for ${company}`,
    body: `Dear Team,\n\n${company} invites proposals for enterprise software implementation covering our operations. Indicative budget is Rs. ${value.toLocaleString('en-IN')}. Proposals must reach us by 12th August 2026.\n\nRegards,\n${senderNames[i % senderNames.length]}`,
    received_at: `2026-08-0${(i % 8) + 1}T10:14:22+05:30`,
    attachments: [`RFP_${company.replace(/\s+/g, '_')}_2026.pdf`],
    is_reply: false
  });
}

// 2. SMB Enquiries (40 emails)
for (let i = 0; i < 40; i++) {
  const company = `Startup ${i + 1} Tech`;
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: senderNames[i % senderNames.length],
    from_email: `founder@startup${i + 1}.io`,
    to: "sales@company.com",
    cc: [],
    subject: `Quick demo request - ${company}`,
    body: `Hi, we're a 20-person team in Pune looking for a demo of your product sometime next week. Nothing urgent.\n\nThanks,\n${senderNames[i % senderNames.length]}`,
    received_at: `2026-08-0${(i % 8) + 1}T11:30:00+05:30`,
    attachments: [],
    is_reply: false
  });
}

// 3. Marketing & Sponsorships (30 emails)
for (let i = 0; i < 30; i++) {
  const event = `India SaaS Summit ${2026 + (i % 2)}`;
  const fee = 200000 + i * 50000;
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: `Event Team - ${event}`,
    from_email: `sponsorships@saassummit.in`,
    to: "sales@company.com",
    cc: [],
    subject: `Sponsorship & Webinar Proposal - ${event}`,
    body: `We are finalizing sponsors for ${event}. Gold tier is ₹${fee.toLocaleString('en-IN')} and includes a keynote slot. Please confirm by tomorrow EOD.\n\nBest,\nOrganizer`,
    received_at: `2026-08-0${(i % 8) + 1}T14:20:00+05:30`,
    attachments: [`Brochure_${event.replace(/\s+/g, '_')}.pdf`],
    is_reply: false
  });
}

// 4. Alliances & Partnerships (25 emails)
for (let i = 0; i < 25; i++) {
  const company = `Partner Tech ${i + 1}`;
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: senderNames[i % senderNames.length],
    from_email: `partnerships@partnertech${i + 1}.com`,
    to: "sales@company.com",
    cc: [],
    subject: `Reseller & Channel Partnership Inquiry - ${company}`,
    body: `We're a leading system integrator across MEA region with 50+ enterprise clients. We'd like to explore reselling your platform.\n\nRegards,\nPartnerships Manager`,
    received_at: `2026-08-0${(i % 8) + 1}T15:45:00+05:30`,
    attachments: [],
    is_reply: false
  });
}

// 5. Finance, Invoices & Billing (25 emails)
for (let i = 0; i < 25; i++) {
  const invNo = `INV-2026-${1000 + i}`;
  const amount = 118000 + i * 25000;
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: `Accounts Dept`,
    from_email: `billing@vendor${i + 1}.com`,
    to: "sales@company.com",
    cc: [],
    subject: `Invoice ${invNo} Payment Reminder - Overdue`,
    body: `Please find attached invoice ${invNo} for Rs. ${amount.toLocaleString('en-IN')} (incl 18% GST). Payment terms were Net 30 and is now 12 days overdue. Kindly release payment.\n\nThanks,\nAccounts`,
    received_at: `2026-08-0${(i % 8) + 1}T09:00:00+05:30`,
    attachments: [`${invNo}.pdf`],
    is_reply: false
  });
}

// 6. Out-of-office (20 emails)
for (let i = 0; i < 20; i++) {
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: senderNames[i % senderNames.length],
    from_email: `user${i + 1}@clientcompany.com`,
    to: "sales@company.com",
    cc: [],
    subject: `Automatic reply: Out of Office`,
    body: `I am out of the office until 15th August with limited access to email. For urgent matters please contact my colleague.\n\nSent from Outlook`,
    received_at: `2026-08-0${(i % 8) + 1}T08:00:00+05:30`,
    attachments: [],
    is_reply: false
  });
}

// 7. Newsletters (20 emails)
for (let i = 0; i < 20; i++) {
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: `B2B Growth Weekly`,
    from_email: `newsletter@b2bgrowth.io`,
    to: "sales@company.com",
    cc: [],
    subject: `B2B Growth Weekly — Issue #${200 + i}`,
    body: `In this edition: why PLG is stalling, 5 pricing experiments that worked, and a teardown of Figma onboarding.\n\nClick here to [Unsubscribe]`,
    received_at: `2026-08-0${(i % 8) + 1}T07:30:00+05:30`,
    attachments: [],
    is_reply: false
  });
}

// 8. Vendor Spam (20 emails)
for (let i = 0; i < 20; i++) {
  const threadId = `th_${String(threadCount++).padStart(4, '0')}`;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: threadId,
    message_index: 0,
    from_name: `Alex Cold Outreach`,
    from_email: `alex@seobooster.agency`,
    to: "sales@company.com",
    cc: [],
    subject: `3x your organic leads - SEO audit offer`,
    body: `Hi, I noticed your website isn't ranking on page 1. We offer webinar promotion, PR outreach, and content marketing services. Interested in a 15-min call?`,
    received_at: `2026-08-0${(i % 8) + 1}T12:00:00+05:30`,
    attachments: [],
    is_reply: false
  });
}

// 9. Thread Replies & Hinglish (25 emails)
for (let i = 0; i < 25; i++) {
  const originalThreadId = `th_${String((i % 40) + 1).padStart(4, '0')}`;
  const isHinglish = i % 2 === 0;

  emails.push({
    email_id: `em_${String(emailCount++).padStart(5, '0')}`,
    thread_id: originalThreadId,
    message_index: 1,
    from_name: senderNames[i % senderNames.length],
    from_email: `client${i + 1}@enterprise.co.in`,
    to: "sales@company.com",
    cc: [],
    subject: `Re: Software RFP - Update`,
    body: isHinglish
      ? `Bhai, humko aapka product chahiye. Budget approx 1.2 cr final hua hai. Board review 20th ko hai. Kab connect kar sakte hain?`
      : `Correction to our earlier note — the board has approved an increased budget of Rs. 32 lakhs. Submission deadline moved to tomorrow.`,
    received_at: `2026-08-0${(i % 8) + 2}T16:00:00+05:30`,
    attachments: [],
    is_reply: true
  });
}

// Write to inbox.json at project root and inside backend/
const rootPath = path.join(__dirname, '..', 'inbox.json');
const backendPath = path.join(__dirname, 'inbox.json');

const jsonStr = JSON.stringify(emails, null, 2);

/**
 * Publish a complete file instead of exposing a partially-written JSON file to
 * the running API. On Windows, replacing an existing path can require an
 * unlink before rename; the API loader retries during that tiny swap window.
 */
function writeJsonAtomically(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, contents, 'utf8');

  try {
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (!['EEXIST', 'EPERM'].includes(err.code)) throw err;
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tempPath, filePath);
  }
}

writeJsonAtomically(rootPath, jsonStr);
writeJsonAtomically(backendPath, jsonStr);

console.log(`✅ Successfully generated ${emails.length} emails into inbox.json`);
