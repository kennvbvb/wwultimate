/**
 * chime.test.js — when the discussion clock should make a noise.
 */
import { test } from 'node:test';
import { chimeFor } from '../lib/client/chime.ts';
import { eq } from './helpers.js';

test('เตือนครั้งเดียวตอนเหลือ 30 วินาที', () => {
  eq(chimeFor(32, 31), null, 'ยังไม่ถึงเกณฑ์');
  eq(chimeFor(31, 30), 'warn', 'ข้ามเส้น 30 วินาทีต้องเตือน');
  eq(chimeFor(30, 29), null, 'ผ่านไปแล้วต้องไม่เตือนซ้ำทุกวินาที');
});

test('เตือนอีกครั้งตอนหมดเวลา และไม่เตือนซ้ำหลังจากนั้น', () => {
  eq(chimeFor(1, 0), 'end', 'หมดเวลาต้องเตือน');
  eq(chimeFor(0, 0), null, 'อยู่ที่ศูนย์ค้างไว้ต้องเงียบ');
});

test('นาฬิกาที่กระโดดข้ามหลายวินาที (จอหลับแล้วตื่น) ต้องยังเตือนถูกจังหวะ', () => {
  eq(chimeFor(120, 5), 'warn', 'กระโดดข้ามเส้น 30 ต้องยังเตือน');
  eq(chimeFor(45, 0), 'end', 'กระโดดจนหมดเวลาให้ถือว่าเป็นการเตือนหมดเวลา');
});
