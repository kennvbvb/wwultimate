/**
 * Makes a Postgres database available for the test run.
 *
 * The storage layer is half the value of this project (idempotency, version
 * conflicts, row locking) and none of it can be tested against a fake — an
 * in-memory stand-in ignores SELECT ... FOR UPDATE, which is exactly the line
 * the concurrency test exists to prove. So tests run against a real server:
 * whatever DATABASE_URL points at, or a local cluster started here.
 */
import { execFileSync, execSync } from 'node:child_process';

const TEST_DB = 'uw_test';
const TEST_USER = 'uw';
const TEST_PASS = 'uw';

function quiet(cmd) {
  try { execSync(cmd, { stdio: 'pipe' }); return true; } catch { return false; }
}

/* su runs the command through a shell, so the SQL has to survive shell quoting
 * intact — hence single quotes and no $$ blocks anywhere in these statements. */
function shellQuote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }

function psqlAsSuperuser(sql, capture) {
  const out = execFileSync('su', ['postgres', '-c', 'psql -tAq -v ON_ERROR_STOP=1 -c ' + shellQuote(sql)],
    { stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'pipe' });
  return String(out || '').trim();
}

/** @returns {string|null} a usable DATABASE_URL, or null if none could be arranged */
export function ensureTestDb() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  if (!quiet('pg_isready -q')) {
    /* Debian/Ubuntu package layout — the only one we can start unattended. */
    if (!quiet('pg_ctlcluster 16 main start') && !quiet('service postgresql start')) return null;
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) ok = quiet('pg_isready -q');
    if (!ok) return null;
  }

  try {
    const role = psqlAsSuperuser("SELECT 1 FROM pg_roles WHERE rolname = " + "'" + TEST_USER + "'", true);
    if (!role) {
      psqlAsSuperuser('CREATE ROLE ' + TEST_USER + " LOGIN PASSWORD '" + TEST_PASS + "' CREATEDB");
    }
    const db = psqlAsSuperuser("SELECT 1 FROM pg_database WHERE datname = '" + TEST_DB + "'", true);
    if (!db) {
      psqlAsSuperuser('CREATE DATABASE ' + TEST_DB + ' OWNER ' + TEST_USER);
    }
  } catch {
    return null;
  }

  return 'postgres://' + TEST_USER + ':' + TEST_PASS + '@127.0.0.1:5432/' + TEST_DB;
}
