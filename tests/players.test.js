/**
 * players.test.js — the roster the moderator types in.
 */
import { test } from 'node:test';
import { checkPlayerNames, findDuplicateNames, normaliseName } from '../lib/players.ts';
import { assert, eq, throws } from './helpers.js';

test('ตัดช่องว่างส่วนเกินและรวมช่องว่างซ้อนให้เหลืออันเดียว', () => {
  eq(normaliseName('  สมชาย   ใจดี  '), 'สมชาย ใจดี', 'ตัดหัวท้ายและยุบช่องว่างกลาง');
  eq(normaliseName(''), '', 'ค่าว่างยังเป็นค่าว่าง');
  eq(normaliseName(null), '', 'ค่า null ไม่ทำให้พัง');
  eq(normaliseName('ก'.repeat(60)).length, 40, 'ตัดความยาวไม่เกิน 40 ตัวอักษร');
});

test('ชื่อว่างหรือมีแต่ช่องว่าง ต้องถูกปฏิเสธฝั่งเซิร์ฟเวอร์', () => {
  throws(() => checkPlayerNames(['สมชาย', '   ', 'มานี']), 'ชื่อที่มีแต่ช่องว่างต้องไม่ผ่าน');
  throws(() => checkPlayerNames(['สมชาย', 'มานี']), 'น้อยกว่าสามคนต้องไม่ผ่าน');
  throws(() => checkPlayerNames('ไม่ใช่ array'), 'ข้อมูลผิดชนิดต้องไม่ผ่าน');
  throws(() => checkPlayerNames(new Array(41).fill('ก')), 'เกิน 40 คนต้องไม่ผ่าน');
});

test('ชื่อซ้ำต้องถูกรายงาน แต่ไม่ถูกห้าม', () => {
  const result = checkPlayerNames(['ปอนด์', 'มานี', ' ปอนด์ ', 'ชูใจ']);
  eq(result.names.length, 4, 'ยังบันทึกได้ครบทุกคน');
  eq(result.duplicates.length, 1, 'พบชื่อซ้ำหนึ่งชื่อ');
  eq(result.duplicates[0], 'ปอนด์', 'และบอกได้ว่าชื่อไหน');
});

test('ชื่อที่ต่างกันแค่ช่องว่างหรือตัวพิมพ์ ให้ถือว่าซ้ำกัน', () => {
  eq(findDuplicateNames(['Ann', 'ann']).length, 1, 'ตัวพิมพ์เล็กใหญ่ถือว่าซ้ำ');
  eq(findDuplicateNames(['สม ชาย', 'สมชาย']).length, 1, 'ช่องว่างกลางชื่อถือว่าซ้ำ');
  eq(findDuplicateNames(['สมชาย', 'สมหญิง']).length, 0, 'ชื่อคนละคนต้องไม่ถูกนับว่าซ้ำ');
});
