/**
 * Test entry point: arranges a database, applies migrations, runs the whole
 * suite and prints the pass/fail line this project has always reported.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureTestDb } from './ensure-test-db.mjs';

const url = ensureTestDb();
if (!url) {
  console.error('\nไม่พบฐานข้อมูล Postgres สำหรับทดสอบ');
  console.error('ตั้ง DATABASE_URL ให้ชี้ไปยังฐานข้อมูลเปล่า แล้วรัน npm test อีกครั้ง');
  console.error('เช่น  DATABASE_URL=postgres://uw:uw@127.0.0.1:5432/uw_test npm test\n');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: url };

const migrate = spawnSync(process.execPath, ['scripts/migrate.mjs'], { env, stdio: 'inherit' });
if (migrate.status !== 0) process.exit(migrate.status || 1);

const tapFile = path.join(os.tmpdir(), 'uw-tests-' + process.pid + '.tap');
const run = spawnSync(process.execPath, [
  '--test',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=tap', '--test-reporter-destination=' + tapFile,
  'tests/**/*.test.js'
], { env, stdio: 'inherit' });

let passed = 0, failed = 0;
try {
  const tap = fs.readFileSync(tapFile, 'utf8');
  passed = Number((tap.match(/^# pass (\d+)$/m) || [0, 0])[1]);
  failed = Number((tap.match(/^# fail (\d+)$/m) || [0, 0])[1]);
  fs.unlinkSync(tapFile);
} catch { /* the reporter output is a nicety, the exit code is the truth */ }

console.log('\n' + '='.repeat(60));
console.log('ผ่าน ' + passed + ' / ล้มเหลว ' + failed);
console.log('='.repeat(60));

process.exit(run.status === null ? 1 : run.status);
