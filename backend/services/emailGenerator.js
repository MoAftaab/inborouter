const fs = require('fs');
const path = require('path');

const SAMPLE_PATHS = [
  path.join(__dirname, '..', 'inbox.json'),
  path.join(process.cwd(), 'inbox.json'),
  path.join(process.cwd(), 'backend', 'inbox.json'),
];

const MAX_READ_ATTEMPTS = 5;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Read a generated JSON file defensively. The seed generator may be run while
 * the server is live, so a normal read can observe the file halfway through a
 * rewrite. A stable-size check plus short retries makes that race harmless.
 */
async function readEmailFile(filePath) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
    try {
      const before = fs.statSync(filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const after = fs.statSync(filePath);

      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw new Error('sample file changed while it was being read');
      }

      const emails = JSON.parse(raw);
      if (!Array.isArray(emails) || emails.length === 0) {
        throw new Error('sample file must contain a non-empty JSON array');
      }

      return emails;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_READ_ATTEMPTS) {
        await sleep(50 * (2 ** (attempt - 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Load 250 pre-generated sample emails from inbox.json on disk
 */
async function generateEmails() {
  for (const p of SAMPLE_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const emails = await readEmailFile(p);
        console.log(`Loaded ${emails.length} sample emails from ${p}`);
        return emails;
      } catch (err) {
        console.warn(`Failed to parse ${p}:`, err.message);
      }
    }
  }

  throw new Error('inbox.json not found on disk');
}

module.exports = { generateEmails };
