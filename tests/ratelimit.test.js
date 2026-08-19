/**
 * ratelimit.test.js — the throttle that stands between an 8-character PIN and
 * somebody with a script.
 */
import { after, test } from 'node:test';
import { closePool, query } from '../lib/db.ts';
import {
  RATE_LIMITS, RateLimitError, clientKey, enforceRateLimit, purgeExpiredRateLimits
} from '../lib/rateLimit.ts';
import { assert, eq } from './helpers.js';

after(() => closePool());

const unique = (name) => name + '-' + Math.random().toString(16).slice(2);

test('เกินโควตาแล้วต้องถูกปฏิเสธ และบอกเวลาที่ต้องรอ', async () => {
  const key = unique('key');
  const rule = RATE_LIMITS.adminLogin;

  for (let i = 0; i < rule.limit; i++) {
    await enforceRateLimit('adminLogin', key);   /* ครั้งที่ 1..limit ต้องผ่าน */
  }

  let error = null;
  try { await enforceRateLimit('adminLogin', key); } catch (e) { error = e; }
  assert(error instanceof RateLimitError, 'ครั้งที่เกินโควตาต้องถูกปฏิเสธ');
  assert(error.retryAfterSeconds > 0, 'ต้องบอกว่าให้รอกี่วินาที');
  assert(error.message.indexOf('บ่อยเกินไป') > 0, 'ข้อความต้องเป็นภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง');
});

test('คนละ key ต้องนับแยกกัน ไม่ทำให้คนอื่นถูกล็อกตาม', async () => {
  const a = unique('a');
  const b = unique('b');
  for (let i = 0; i < RATE_LIMITS.adminLogin.limit + 2; i++) {
    try { await enforceRateLimit('adminLogin', a); } catch { /* ตั้งใจให้เต็ม */ }
  }
  await enforceRateLimit('adminLogin', b);   /* ต้องไม่ throw */
});

test('หน้าต่างเวลาหมดอายุแล้วต้องเริ่มนับใหม่', async () => {
  const key = unique('window');
  await enforceRateLimit('adminLogin', key);

  /* ย่นเวลาให้หน้าต่างหมดอายุ แทนการรอจริง */
  await query("UPDATE rate_limits SET expires_at = now() - interval '1 second' WHERE bucket = $1",
    ['adminLogin:' + key]);

  for (let i = 0; i < RATE_LIMITS.adminLogin.limit; i++) {
    await enforceRateLimit('adminLogin', key);   /* นับใหม่ตั้งแต่หนึ่ง */
  }
  const row = await query('SELECT count FROM rate_limits WHERE bucket = $1', ['adminLogin:' + key]);
  eq(row.rows[0].count, RATE_LIMITS.adminLogin.limit, 'ตัวนับต้องเริ่มใหม่หลังหมดอายุ');
});

test('ชื่อกติกาที่ไม่รู้จัก ต้องปล่อยผ่านไม่ใช่ปิดกั้น', async () => {
  await enforceRateLimit('ไม่มีกติกานี้', unique('x'));   /* ต้องไม่ throw */
});

test('อ่านหมายเลขผู้เรียกจาก header ที่ proxy ใส่มา', () => {
  const withForwarded = new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
  eq(clientKey(withForwarded), '203.0.113.7', 'ใช้ hop แรกของ x-forwarded-for');

  const withReal = new Request('http://x/', { headers: { 'x-real-ip': '198.51.100.9' } });
  eq(clientKey(withReal), '198.51.100.9', 'ถอยไปใช้ x-real-ip');

  eq(clientKey(new Request('http://x/')), 'unknown', 'ไม่มีข้อมูลก็ยังต้องได้ key');
});

test('ล้างรายการที่หมดอายุนานแล้วได้', async () => {
  const key = unique('old');
  await enforceRateLimit('adminLogin', key);
  await query("UPDATE rate_limits SET expires_at = now() - interval '2 days' WHERE bucket = $1",
    ['adminLogin:' + key]);
  await purgeExpiredRateLimits();
  const row = await query('SELECT 1 FROM rate_limits WHERE bucket = $1', ['adminLogin:' + key]);
  eq(row.rowCount, 0, 'รายการเก่าต้องถูกลบ');
});
