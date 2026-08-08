/**
 * Deadline detection utility
 * Checks if a due date is within 72 hours of the received_at timestamp
 */
function isWithin72h(receivedAt, dueDate) {
  if (!dueDate || !receivedAt) return false;

  try {
    const received = new Date(receivedAt);
    const due = new Date(dueDate);

    if (isNaN(received.getTime()) || isNaN(due.getTime())) return false;

    const diffMs = due.getTime() - received.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours >= 0 && diffHours <= 72;
  } catch {
    return false;
  }
}

/**
 * Parse natural language date references from body text
 * Returns ISO date string or null
 */
function parseRelativeDate(text, receivedAt) {
  if (!text || !receivedAt) return null;

  const received = new Date(receivedAt);
  const lower = text.toLowerCase();

  // "today" / "by today EOD"
  if (/\btoday\b/.test(lower)) {
    return received.toISOString().split('T')[0];
  }

  // "tomorrow" / "by tomorrow EOD"
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(received);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  // "day after tomorrow"
  if (/day after tomorrow/.test(lower)) {
    const d = new Date(received);
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  }

  // "this week" / "end of week"
  if (/\bthis week\b|\bend of week\b|\beow\b/.test(lower)) {
    const d = new Date(received);
    const daysToFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToFriday);
    return d.toISOString().split('T')[0];
  }

  return null;
}

module.exports = { isWithin72h, parseRelativeDate };
