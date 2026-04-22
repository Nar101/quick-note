const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const fsp = fs.promises;
const HEPTABASE_CLI_PATH = '/usr/local/bin/heptabase';
const CLI_PATH = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin';

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(HEPTABASE_CLI_PATH, args, {
      timeout: options.timeout || 15000,
      maxBuffer: 1024 * 1024 * 10,
      env: {
        ...process.env,
        PATH: `${CLI_PATH}:${process.env.PATH || ''}`,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseJsonFromOutput(output) {
  if (!output || !output.trim()) return null;

  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (innerError) {
      return null;
    }
  }
}

function getCliErrorMessage(error) {
  const output = [error.stderr, error.stdout, error.message]
    .filter(Boolean)
    .join('\n')
    .trim();
  const parsed = parseJsonFromOutput(output);

  if (parsed && typeof parsed.error === 'string') {
    return parsed.error;
  }

  return output || 'Heptabase official CLI failed';
}

async function ensureCliAvailable() {
  try {
    await fsp.access(HEPTABASE_CLI_PATH, fs.constants.X_OK);
  } catch (error) {
    throw new Error(`Heptabase official CLI not found at ${HEPTABASE_CLI_PATH}`);
  }
}

async function saveToHeptabaseJournalWithOfficialCli(content) {
  let tempDir = null;

  try {
    await ensureCliAvailable();

    await runCli(['start', '--timeout-ms', '10000'], { timeout: 15000 });

    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hepta-note-'));
    const contentFile = path.join(tempDir, 'journal-entry.md');
    await fsp.writeFile(contentFile, content, 'utf8');

    const date = getTodayDateString();
    const { stdout } = await runCli([
      'journal',
      'append',
      date,
      '--content-file',
      contentFile,
    ], { timeout: 30000 });

    const parsed = parseJsonFromOutput(stdout);
    return {
      success: true,
      result: parsed ? JSON.stringify(parsed) : stdout.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: getCliErrorMessage(error),
    };
  } finally {
    if (tempDir) {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = {
  saveToHeptabaseJournalWithOfficialCli,
};
