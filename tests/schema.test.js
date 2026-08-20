/**
 * schema.test.js — the app has to notice when a deploy ran ahead of its
 * migrations, because that is what breaks production loudest and least clearly.
 */
import { after, test } from 'node:test';
import { checkSchema, evaluateSchema, REQUIRED } from '../lib/schema.ts';
import { closePool } from '../lib/db.ts';
import { assert, eq } from './helpers.js';

after(() => closePool());

const allTables = () => REQUIRED.filter((r) => !r.column).map((r) => r.table);
const allColumns = () => REQUIRED.filter((r) => r.column).map((r) => r.table + '.' + r.column);

test('ฐานข้อมูลที่รัน migration ครบแล้ว ต้องผ่านการตรวจ', async () => {
  const check = await checkSchema();
  eq(check.ok, true, 'ขาด: ' + check.missing.join(', '));
  eq(check.missing.length, 0, 'ต้องไม่ขาดอะไรเลย');
  eq(check.runMigration, null, 'ไม่มี migration ค้าง');
});

test('คอลัมน์ outcome หายไป ต้องรู้ว่าต้องรัน 003_retention.sql', () => {
  const check = evaluateSchema(allTables(), allColumns().filter((c) => c !== 'games.outcome'));
  eq(check.ok, false, 'ต้องไม่ผ่าน');
  eq(check.missing.join(','), 'games.outcome', 'ต้องบอกชื่อสิ่งที่ขาด');
  eq(check.runMigration, '003_retention.sql', 'ต้องบอก migration ที่ต้องรัน');
});

test('ฐานข้อมูลเปล่า ต้องชี้ไปที่ migration แรกสุด ไม่ใช่ตัวล่าสุด', () => {
  const check = evaluateSchema([], []);
  eq(check.ok, false, 'ต้องไม่ผ่าน');
  eq(check.missing.length, REQUIRED.length, 'ต้องขาดทุกอย่าง');
  eq(check.runMigration, '001_init.sql', 'เริ่มจากตัวแรก');
});

test('รายการที่ต้องมี ต้องครอบคลุมทุกตารางที่โค้ดใช้จริง', () => {
  const tables = allTables();
  ['games', 'events', 'snapshots', 'role_overrides', 'idempotency', 'rate_limits']
    .forEach((t) => assert(tables.indexOf(t) >= 0, 'ลืมใส่ตาราง ' + t));
});
