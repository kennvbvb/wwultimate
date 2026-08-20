/**
 * apierrors.test.js — what an unauthenticated caller is allowed to learn when
 * something goes wrong.
 */
import { test } from 'node:test';
import { classifyError, GameError } from '../lib/errors.ts';
import { assert, eq } from './helpers.js';

test('ฐานข้อมูลล่ม ต้องตอบ 503 พร้อมข้อความไทย ไม่ใช่รายละเอียดของ driver', () => {
  const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
  const mapped = classifyError(err);
  eq(mapped.status, 503, 'ต้องเป็น 503 ไม่ใช่ 400');
  eq(mapped.headers['retry-after'], '5', 'บอกให้ลองใหม่เมื่อไร');
  eq(mapped.logDetail, err.message, 'รายละเอียดจริงต้องถูกเก็บไว้ให้ log');

  assert(mapped.message.indexOf('ฐานข้อมูล') > 0, 'ข้อความต้องเป็นภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง');
  assert(mapped.message.indexOf('5432') < 0, 'ห้ามบอกพอร์ต');
  assert(mapped.message.indexOf('ECONNREFUSED') < 0, 'ห้ามบอกรหัสข้อผิดพลาดของระบบ');
  assert(mapped.message.indexOf('127.0.0.1') < 0, 'ห้ามบอกที่อยู่ภายใน');
});

test('เซิร์ฟเวอร์ฐานข้อมูลกำลังปิดตัว ก็ถือเป็นปัญหาโครงสร้างพื้นฐานเหมือนกัน', () => {
  const err = Object.assign(new Error('terminating connection due to administrator command'),
    { code: '57P01' });
  eq(classifyError(err).status, 503, 'ต้องเป็น 503');
});

test('ยังไม่ได้ตั้งค่า DATABASE_URL ต้องไม่รั่วออกไปหาผู้ใช้', () => {
  const mapped = classifyError(new Error('ยังไม่ได้ตั้งค่า DATABASE_URL'));
  eq(mapped.status, 503, 'ต้องเป็น 503');
  assert(mapped.message.indexOf('DATABASE_URL') < 0, 'ห้ามบอกชื่อ environment variable');
});

test('ข้อผิดพลาดตามกติกาเกม ยังส่งข้อความเดิมออกไปตรง ๆ', () => {
  const mapped = classifyError(new GameError('ยังลงคะแนนไม่ครบ (2/8)'));
  eq(mapped.status, 400, 'ยังเป็น 400 เหมือนเดิม');
  eq(mapped.message, 'ยังลงคะแนนไม่ครบ (2/8)', 'ข้อความจาก engine ต้องถึงผู้ใช้');
});

test('ไม่พบเกม ยังเป็น 404', () => {
  eq(classifyError(new GameError('ไม่พบเกมรหัส GAME-XXXXXX')).status, 404, 'ต้องเป็น 404');
});
