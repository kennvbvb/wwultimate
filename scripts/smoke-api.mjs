/**
 * Drives a whole game through the HTTP API — create, deal, night, vote, undo,
 * export, rematch — against a running server. Not part of npm test: it needs a
 * server, where the test suite only needs a database.
 *
 *   npm run build && npm start &
 *   node scripts/smoke-api.mjs
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';

let cookie = '';
const used = new Set();
let checks = 0;

/* Each run looks like a different client so repeated local runs do not eat the
 * rate-limit budget. In production the platform overwrites this header with the
 * real client IP, so it cannot be used to dodge the limiter there. */
const RUN_IP = '198.51.100.' + (1 + Math.floor(Math.random() * 250));

function ok(cond, what) {
  checks++;
  if (!cond) { console.error('✗ ' + what); process.exit(1); }
  console.log('✓ ' + what);
}

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': RUN_IP,
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {})
    }
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) cookie = c.split(';')[0];
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

let version = 0;
let gameId = '';
let keySeq = 0;

async function cmd(action, extra = {}, expectOk = true) {
  used.add(action);
  const res = await call('/api/command', {
    method: 'POST',
    body: JSON.stringify({
      action, gameId, expectedVersion: version,
      idempotencyKey: action + '-' + (++keySeq), ...extra
    })
  });
  if (expectOk) {
    if (res.status !== 200) {
      console.error('✗ ' + action + ' → ' + res.status + ' ' + JSON.stringify(res.body));
      process.exit(1);
    }
    version = res.body.version;
  }
  return res;
}

const names = (n) => Array.from({ length: n }, (_, i) => 'นักเรียน' + (i + 1));

/* ---- bootstrap ---- */
const boot = await call('/api/bootstrap');
ok(boot.status === 200 && boot.body.catalog.roles.length === 46, 'bootstrap คืนบทบาทครบ 46');
ok(boot.body.catalog.impactVerified === false, 'ธง Village Impact ยังไม่ยืนยันถูกส่งมาด้วย');
ok(boot.body.openGames === undefined, 'bootstrap ต้องไม่แจกรายการเกมที่ยังเล่นค้างอยู่ให้ทุกคน');

/* ---- create ---- */
const created = await call('/api/games', { method: 'POST', body: JSON.stringify({ playerNames: names(8), title: 'ห้อง ป.5/2' }) });
ok(created.status === 201 && created.body.gameId, 'สร้างเกมได้ ' + created.body.gameId);
ok(!!created.body.moderatorPin, 'ได้ PIN กลับมาครั้งเดียวตอนสร้าง');
gameId = created.body.gameId;
version = created.body.version;
const pin = created.body.moderatorPin;

/* ---- public view must not leak ---- */
const pub = await call('/api/public/' + gameId);
ok(pub.status === 200 && pub.body.mode === 'PUBLIC', 'จอสาธารณะเปิดได้โดยไม่ต้องล็อกอิน');
ok(pub.body.players.every((p) => p.roleTh === ''), 'จอสาธารณะไม่รั่วบทบาท');

/* ---- commands ---- */
await cmd('setPlayers', { playerNames: names(8) });
await cmd('configureGame', {
  title: 'ห้อง ป.5/2',
  selectedRoles: [
    { roleId: 'werewolf', count: 2 }, { roleId: 'seer', count: 1 },
    { roleId: 'hunter', count: 1 }, { roleId: 'villager', count: 4 }
  ],
  ruleVariants: { discussionSeconds: 120 }
});

const validate = await call('/api/game/' + gameId + '/validate', {
  method: 'POST',
  body: JSON.stringify({ selectedRoles: [{ roleId: 'werewolf', count: 2 }, { roleId: 'seer', count: 1 }, { roleId: 'hunter', count: 1 }, { roleId: 'villager', count: 4 }] })
});
ok(validate.status === 200 && validate.body.problems.length === 0, 'ตรวจชุดบทบาทผ่าน');
ok(!!validate.body.impact, 'ได้สรุปสมดุลกลับมาด้วย');

let view = (await call('/api/game/' + gameId)).body;
const roles = ['werewolf', 'werewolf', 'seer', 'hunter', 'villager', 'villager', 'villager', 'villager'];
await cmd('assignRoles', { assignments: view.players.map((p, i) => ({ playerId: p.playerId, roleId: roles[i] })) });
await cmd('swapRoles', { playerA: view.players[6].playerId, playerB: view.players[7].playerId });
await cmd('reopenRoleAssignment', { reason: 'แจกการ์ดผิดคน' });
await cmd('assignRoles', { assignments: view.players.map((p, i) => ({ playerId: p.playerId, roleId: roles[i] })) });
await cmd('startGame');

view = (await call('/api/game/' + gameId)).body;
ok(view.status === 'FIRST_NIGHT', 'เริ่มเกมแล้วเข้าคืนแรก');

/* ---- night 1: the wolves eat the hunter, which fires a death prompt ---- */
const hunter = view.players.find((p) => p.currentRoleId === 'hunter');
let guard = 0;
while (view.currentStep && guard++ < 40) {
  const step = view.currentStep;
  const targets = view.players.filter((p) => p.alive && !step.actorIds.includes(p.playerId));
  if (step.stepId === 'wolves' && step.maxTargets > 0) {
    await cmd('submitRoleAction', { stepId: step.stepId, targetIds: [hunter.playerId], meta: {} });
  } else if (step.minTargets > 0 && targets.length) {
    await cmd('submitRoleAction', { stepId: step.stepId, targetIds: [targets[0].playerId], meta: {} });
  } else {
    await cmd('skipStep', { stepId: step.stepId });
  }
  view = (await call('/api/game/' + gameId)).body;
}
await cmd('resolveNight');
view = (await call('/api/game/' + gameId)).body;
ok(view.players.find((p) => p.playerId === hunter.playerId).alive === false, 'หมาป่ากินนายพรานสำเร็จ');
ok(view.pendingPrompts.length > 0, 'การตายของนายพรานสร้างทริกเกอร์ให้ผู้ดำเนินเกมตัดสิน');

while (view.pendingPrompts.length) {
  const prompt = view.pendingPrompts[0];
  const choices = (prompt.options || []).filter((o) => o.playerId !== hunter.playerId);
  await cmd('resolvePrompt', { promptId: prompt.promptId, targetId: choices.length ? choices[0].playerId : null });
  view = (await call('/api/game/' + gameId)).body;
}

/* ---- day 1 ---- */
await cmd('pauseGame');
await cmd('resumeGame');
await cmd('startDiscussion');
await cmd('openNomination');
view = (await call('/api/game/' + gameId)).body;
const nominee = view.players.find((p) => p.alive);
await cmd('startNomination', { nomineeIds: [nominee.playerId] });
view = (await call('/api/game/' + gameId)).body;
const voters = view.voteProgress ? view.voteProgress.eligible : view.day.eligibleVoters;
const votes = {};
for (const voter of voters) votes[voter.playerId] = nominee.playerId;

/* ลงไม่ครบต้องถูกปฏิเสธ */
const partial = { [voters[0].playerId]: nominee.playerId };
if (voters.length > 1) {
  await cmd('submitVote', { votes: partial });
  const early = await cmd('resolveVote', {}, false);
  ok(early.status === 400 && /ยังลงคะแนนไม่ครบ/.test(early.body.error || ''),
     'สรุปผลทั้งที่ลงคะแนนไม่ครบ ต้องถูกปฏิเสธ');
  const still = (await call('/api/game/' + gameId)).body;
  ok(still.status === 'VOTING', 'คำสั่งที่ถูกปฏิเสธต้องไม่เปลี่ยนสถานะเกม');
  ok(still.voteProgress && still.voteProgress.received === 1,
     'คะแนนที่บันทึกไปแล้วต้องยังอยู่ครบ');
  version = still.version;
}

await cmd('submitVote', { votes });
await cmd('resolveVote');
view = (await call('/api/game/' + gameId)).body;
ok(view.players.find((p) => p.playerId === nominee.playerId).alive === false || view.status !== 'VOTING',
   'ลงคะแนนแล้วมีผล');

while (view.pendingPrompts.length) {
  await cmd('resolvePrompt', { promptId: view.pendingPrompts[0].promptId, targetId: null });
  view = (await call('/api/game/' + gameId)).body;
}

/* ---- night 2: skip every step, then a day that ends with no lynch ---- */
if (view.status === 'NIGHT' || view.status === 'FIRST_NIGHT') {
  guard = 0;
  while (view.currentStep && guard++ < 40) {
    await cmd('skipStep', { stepId: view.currentStep.stepId });
    view = (await call('/api/game/' + gameId)).body;
  }
  await cmd('resolveNight');
  view = (await call('/api/game/' + gameId)).body;
  while (view.pendingPrompts.length) {
    await cmd('resolvePrompt', { promptId: view.pendingPrompts[0].promptId, targetId: null });
    view = (await call('/api/game/' + gameId)).body;
  }
}
if (view.status === 'DAWN' || view.status === 'DISCUSSION') {
  if (view.status === 'DAWN') await cmd('startDiscussion');
  await cmd('forceEndDay');
  ok(true, 'ปิดวันโดยไม่แขวนคอได้');
}

/* ---- undo ---- */
const beforeUndo = version;
const undo = await cmd('undo');
ok(undo.body.version > beforeUndo, 'ย้อนคำสั่งแล้วเวอร์ชันเดินต่อ');
version = undo.body.version;

/* ---- remaining commands ---- */
view = (await call('/api/game/' + gameId)).body;
const victim = view.players.find((p) => p.alive);
await cmd('moderatorKill', { playerId: victim.playerId, reason: 'ทดสอบ' });
view = (await call('/api/game/' + gameId)).body;
while (view.pendingPrompts.length) {
  await cmd('resolvePrompt', { promptId: view.pendingPrompts[0].promptId, targetId: null });
  view = (await call('/api/game/' + gameId)).body;
}
ok(true, 'ผู้ดำเนินเกมสั่งให้เสียชีวิตได้');

/* ---- reads ---- */
const summary = await call('/api/game/' + gameId + '/summary');
ok(summary.status === 200 && summary.body.players.length === 8, 'สรุปท้ายเกมครบทุกคน');
const events = await call('/api/game/' + gameId + '/events?limit=20');
ok(events.status === 200 && events.body.length > 0, 'อ่าน event log ได้');
const csv = await call('/api/game/' + gameId + '/players.csv');
ok(typeof csv.body === 'string' && csv.body.split('\n').length === 9, 'ส่งออก CSV ได้ 8 แถว + หัวตาราง');

/* ---- rematch, then close that game down ---- */
const originalGameId = gameId;
const originalVersion = version;
const again = await cmd('rematch');
ok(again.body.gameId !== gameId, 'เริ่มเกมใหม่ด้วยที่นั่งเดิมได้');

gameId = again.body.gameId;
version = again.body.version;
const ended = await cmd('endGame', { reason: 'จบการทดสอบ' });
ok(ended.body.status === 'FINISHED', 'สั่งจบเกมทันทีได้');
gameId = originalGameId;
version = originalVersion;

/* ---- auth ---- */
const savedCookie = cookie;
cookie = '';
const denied = await call('/api/game/' + gameId);
ok(denied.status === 401, 'ไม่มี cookie เข้าจอผู้ดำเนินเกมไม่ได้');
const badPin = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ gameId, pin: '0000-0000' }) });
ok(badPin.status === 401, 'PIN ผิดเข้าไม่ได้');
cookie = '';
const goodPin = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ gameId, pin }) });
ok(goodPin.status === 200 && goodPin.body.gameId === gameId, 'PIN ถูกต้องเข้าได้');
cookie = savedCookie;

/* ---- SSE: a command in one place must reach a listener within two seconds ---- */
const live = await call('/api/games', { method: 'POST', body: JSON.stringify({ playerNames: names(4), title: 'ทดสอบสตรีม' }) });
const liveId = live.body.gameId;
const sse = await fetch(BASE + '/api/stream/' + liveId, { headers: { accept: 'text/event-stream' } });
const reader = sse.body.getReader();
const decoder = new TextDecoder();

async function waitForChange(ms) {
  const deadline = Date.now() + ms;
  let buffer = '';
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise((r) => setTimeout(() => r({ value: undefined }), deadline - Date.now()))
    ]);
    if (!chunk.value) break;
    buffer += decoder.decode(chunk.value);
    const match = buffer.match(/event: change\ndata: (.*)/);
    if (match) return JSON.parse(match[1]);
  }
  return null;
}

const firstChange = await waitForChange(3000);
ok(firstChange && firstChange.version === live.body.version, 'SSE ส่งเวอร์ชันปัจจุบันทันทีที่เชื่อมต่อ');

const startedAt = Date.now();
await call('/api/command', {
  method: 'POST',
  body: JSON.stringify({
    action: 'setPlayers', gameId: liveId, expectedVersion: live.body.version,
    idempotencyKey: 'sse-1', playerNames: names(5)
  })
});
const nextChange = await waitForChange(2500);
ok(nextChange && nextChange.version === live.body.version + 1, 'สั่งคำสั่งแล้ว SSE แจ้งเวอร์ชันใหม่');
ok(Date.now() - startedAt < 2500, 'แจ้งภายใน 2 วินาที (' + (Date.now() - startedAt) + ' ms)');
await reader.cancel();

/* ---- coverage ---- */
const { listCommands } = await import('../lib/commands.ts');
const missing = listCommands().filter((c) => !used.has(c));
ok(missing.length === 0, 'ยิงครบทุกคำสั่ง (' + used.size + ' คำสั่ง)' + (missing.length ? ' ขาด: ' + missing : ''));

/* ---- admin: edit a role, then confirm a new game sees the change ---- */
const adminCookieBefore = cookie;
cookie = '';
const noAuth = await call('/api/admin/roles');
ok(noAuth.status === 401, 'หน้าแอดมินต้องใส่รหัสผ่านก่อน');

const badLogin = await call('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) });
ok(badLogin.status === 401, 'รหัสผ่านผู้ดูแลผิดเข้าไม่ได้');

const adminLogin = await call('/api/admin/login', {
  method: 'POST', body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || 'admin1234' })
});
ok(adminLogin.status === 200, 'รหัสผ่านผู้ดูแลถูกต้องเข้าได้');

const before = await call('/api/admin/roles');
ok(before.status === 200 && before.body.roles.length === 46, 'หน้าแอดมินเห็นบทบาทครบ 46');

const put = await call('/api/admin/roles', {
  method: 'PUT',
  body: JSON.stringify({ rows: [{ roleId: 'villager', displayNameTh: 'ชาวบ้านทดสอบ', villageImpact: 3, maxCopies: 20, enabled: true, noteTh: 'แก้จากหน้าแอดมิน' }] })
});
ok(put.status === 200 && put.body.saved === 1, 'บันทึกค่าที่แก้ได้');

const afterBoot = await call('/api/bootstrap');
const villager = afterBoot.body.catalog.roles.find((r) => r.roleId === 'villager');
ok(villager.th === 'ชาวบ้านทดสอบ' && villager.villageImpact === 3,
   'เกมที่สร้างหลังจากนี้เห็นค่าใหม่ทันที (ไม่ต้องรอแคชหมดอายุ)');

const del = await call('/api/admin/roles', { method: 'DELETE' });
ok(del.status === 200, 'คืนค่าเริ่มต้นได้');
const restored = await call('/api/bootstrap');
ok(restored.body.catalog.roles.find((r) => r.roleId === 'villager').th === 'ชาวบ้าน',
   'ค่ากลับไปเป็นค่าเริ่มต้นจริง');
/* ---- cross-game stats ---- */
const stats = await call('/api/admin/stats');
ok(stats.status === 200 && stats.body.games >= 1, 'หน้าสถิติเห็นเกมที่เล่นจบแล้ว ' + stats.body.games + ' เกม');
ok(Array.isArray(stats.body.teamWins) && stats.body.players.length > 0, 'สถิติมีทั้งฝ่ายที่ชนะและรายผู้เล่น');
ok(stats.body.recent.every((g) => g.winnersTh), 'ทุกเกมในรายการมีผลแพ้ชนะกำกับ');

cookie = adminCookieBefore;

console.log('\nผ่านการตรวจ ' + checks + ' ข้อ');
