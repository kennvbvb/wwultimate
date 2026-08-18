# MIGRATION.md — ย้าย Ultimate Werewolf Moderator จาก Google Apps Script ไป Vercel

เอกสารสั่งงานสำหรับ Claude Code อ่าน `CLAUDE.md` ก่อนเสมอ แล้วจึงทำตามไฟล์นี้ทีละเฟส
**ห้ามข้ามเฟส และห้ามเริ่มเฟสถัดไปจนกว่าเกณฑ์ผ่านของเฟสปัจจุบันจะเป็นจริง**

---

## 0. การตัดสินใจที่ล็อกแล้ว

| หัวข้อ | เลือก | เหตุผล |
|---|---|---|
| Framework | **Next.js 15 App Router** | อยู่ในระบบเดียวกับ Vercel |
| ฐานข้อมูล | **Neon Postgres** (ผ่าน Vercel Marketplace) | บิลรวมกับ Vercel, `jsonb` เหมาะกับ state ที่เป็นก้อนเดียว |
| หน้าเว็บ | **เขียนใหม่เป็น React + TypeScript** | ไม่ต้องติดข้อจำกัด ES5 อีก |
| Realtime | **SSE (Server-Sent Events)** | จอสาธารณะเลิก poll ทุก 5 วินาที |
| ขอบเขตรอบแรก | **ย้าย + realtime + หน้าแอดมินแก้บทบาท** | ทดแทนความสามารถแก้ค่าในชีตที่หายไป |
| ภาษาในอินเทอร์เฟซ | **ไทยทั้งหมด** | ผู้ใช้คือครูและนักเรียนไทย |

**สิ่งที่ห้ามเปลี่ยนระหว่างย้าย**: ตรรกะเกมทั้งหมด ถ้าพบว่ากติกาผิดระหว่างย้าย
ให้จดไว้ในหัวข้อ 8 แล้วแก้**หลัง**ย้ายเสร็จ อย่าแก้ปนกับการย้าย เพราะจะแยกไม่ออกว่าอะไรพัง

---

## 1. หลักการสำคัญที่สุดของการย้ายนี้

### 1.1 ห้ามแก้ไฟล์ตรรกะ 8 ไฟล์

`Config.gs` `RoleCatalog.gs` `Utils.gs` `Validation.gs` `WinConditionService.gs`
`EffectResolver.gs` `RuleEngine.gs` `GameService.gs` — รวม 2,770 บรรทัด 84 ฟังก์ชัน
**ผ่านเทสต์ 69 ข้อแล้ว** และเป็นสินทรัพย์ที่มีค่าที่สุดในโปรเจกต์

ไฟล์เหล่านี้ใช้ `var` อยู่ใน global scope เดียวกัน เรียกข้ามไฟล์กันหลายร้อยจุด
**ห้ามไล่ใส่ `import`/`export` ทีละไฟล์** เพราะเสี่ยงพังสูงและตรวจสอบยาก

ให้ใช้ **สคริปต์ build ที่ต่อไฟล์เข้าด้วยกันแล้วเติม `export` ท้ายไฟล์** แทน (ดูเฟส 1)
วิธีนี้ไม่แตะตรรกะแม้แต่บรรทัดเดียว เทสต์เดิมจึงยังใช้การันตีความถูกต้องได้เต็มที่

### 1.2 เทสต์ต้องเขียวตลอดทาง

ทุกเฟสมีเกณฑ์ผ่านเป็นตัวเลขเทสต์ ถ้าเทสต์แดงให้หยุดแก้ให้เขียวก่อน อย่าสะสมหนี้

### 1.3 ของเดิมบน GAS ต้องใช้งานได้ตลอดการย้าย

ทำงานบน branch `vercel-migration` ห้าม merge เข้า `main` จนกว่าจะผ่านเฟส 6

---

## 2. เฟส 0 — ขึ้น GitHub

```bash
cd ultimate-werewolf-gas
git init && git branch -M main
cat > .gitignore <<'EOF'
node_modules/
.env
.env.local
.env*.local
.next/
.vercel/
lib/engine.generated.js
.DS_Store
EOF
git add . && git commit -m "GAS version 1.0.0 — 77 tests passing"
gh repo create ultimate-werewolf --private --source=. --push
git checkout -b vercel-migration
```

**ห้าม commit**: `SPREADSHEET_ID`, PIN, connection string, API key ใด ๆ

**เกณฑ์ผ่าน**: โค้ดอยู่บน GitHub ครบ 22 ไฟล์ และอยู่บน branch `vercel-migration`

---

## 3. เฟส 1 — โครงกระดูก + ย้าย engine (ครึ่งวัน)

### 3.1 โครงสร้างเป้าหมาย

```
app/
  layout.tsx
  page.tsx                     จอผู้ดำเนินเกม
  public/[gameId]/page.tsx     จอสาธารณะ
  admin/page.tsx               หน้าแก้บทบาท
  api/
    command/route.ts           POST  ทุก mutation
    game/[gameId]/route.ts     GET   view model ผู้ดำเนินเกม
    public/[gameId]/route.ts   GET   view model สาธารณะ
    stream/[gameId]/route.ts   GET   SSE
    admin/roles/route.ts       GET/PUT
lib/
  engine/                      8 ไฟล์เดิม (นามสกุล .gs คงไว้ อย่าเปลี่ยน)
  engine.generated.js          ← build ออกมา ไม่ commit
  db.ts  storage.ts  auth.ts  types.ts
scripts/build-engine.mjs
components/
tests/
```

### 3.2 ย้ายไฟล์

```bash
mkdir -p lib/engine scripts
git mv src/Config.gs src/RoleCatalog.gs src/Utils.gs src/Validation.gs \
       src/WinConditionService.gs src/EffectResolver.gs src/RuleEngine.gs \
       src/GameService.gs lib/engine/
mkdir -p legacy-gas && git mv src/*.gs src/*.html src/appsscript.json legacy-gas/
```

เก็บ `legacy-gas/` ไว้อ้างอิงตอนเขียนหน้าเว็บใหม่ ค่อยลบในเฟส 6

### 3.3 สคริปต์ build engine

```js
// scripts/build-engine.mjs
import fs from 'node:fs';
import path from 'node:path';

const FILES = ['Config', 'RoleCatalog', 'Utils', 'Validation',
  'WinConditionService', 'EffectResolver', 'RuleEngine', 'GameService'];

const EXPORTS = [
  'APP_NAME','APP_VERSION','CAUSE','CAUSE_TH','EVENT_SOFT_LIMIT',
  'MAX_DEATH_QUEUE_ITERATIONS','ST','STATUS','TEAM','TEAM_TH',
  'addPlayer','addStatus','advanceStep','afterResolution','alivePlayers',
  'anyAliveWithRole','anyPlayerHadRole','applyCatalogOverrides','assertVersion',
  'assignRoles','assignmentStatus','attemptKill','buildNightSteps','catalogViewModel',
  'configureGame','createGameState','currentStep','deckRemaining','defaultRuleVariants',
  'detectedTeam','eligibleVoters','emit','endDayAndStartNight','endGame','enqueueDeath',
  'evaluateWin','finalSummary','findPlayer','findStep','finishNight','forceEndDay',
  'getRole','hasRoleDef','hasStatus','isCultMember','isThreatToSeer','isWolfTeam',
  'listRoles','livingNeighbours','moderatorKill','moderatorViewModel','mustPlayer',
  'neighboursForPI','openNomination','pauseGame','playersWithRole','processDeathQueue',
  'publicViewModel','removeStatus','reopenRoleAssignment','resolveDeathPrompt',
  'resolveNight','resolvePrompt','resolveVote','resumeGame','roleDisplay','seatOrder',
  'setPlayers','skipStep','startDiscussion','startGame','startNight','startNomination',
  'statusLabel','submitRoleAction','submitVote','tallyVotes','timeline',
  'uwClone','uwContains','uwEscape','uwGameId','uwNow','uwPin','uwPush','uwRandomId',
  'uwRemove','uwUnique','validateRoleSelection','validateTargets','validateVote',
  'villageImpactSummary','voteWeight','winTeamLabel'
];

const HEADER = `/* AUTO-GENERATED by scripts/build-engine.mjs — DO NOT EDIT.
 * แก้ที่ lib/engine/*.gs แล้วรัน npm run build:engine
 * ไฟล์นี้ห้าม commit (อยู่ใน .gitignore แล้ว) */\n\n`;

const body = FILES.map(f => {
  const p = path.join('lib/engine', f + '.gs');
  const code = fs.readFileSync(p, 'utf8');
  for (const banned of ['SpreadsheetApp', 'CacheService', 'PropertiesService', 'LockService']) {
    if (code.includes(banned)) {
      throw new Error(`${f}.gs เรียก ${banned} — ไฟล์ตรรกะบริสุทธิ์ห้ามแตะ Apps Script API`);
    }
  }
  return `/* ===== ${f}.gs ===== */\n${code}`;
}).join('\n\n');

fs.writeFileSync('lib/engine.generated.js',
  HEADER + body + `\n\nexport {\n  ${EXPORTS.join(',\n  ')}\n};\n`);
console.log(`สร้าง lib/engine.generated.js จาก ${FILES.length} ไฟล์ / export ${EXPORTS.length} รายการ`);
```

การ์ดที่ตรวจ `SpreadsheetApp` ในสคริปต์ **สำคัญ** — มันบังคับให้กฎในข้อ 1.1 ไม่ถูกละเมิดโดยไม่รู้ตัว

`package.json`:

```json
{
  "scripts": {
    "build:engine": "node scripts/build-engine.mjs",
    "prebuild": "npm run build:engine",
    "predev": "npm run build:engine",
    "pretest": "npm run build:engine",
    "test": "node --test tests/",
    "dev": "next dev",
    "build": "next build"
  }
}
```

### 3.4 ย้ายเทสต์

`tests/harness.js` เดิมโหลดไฟล์เข้า `vm` sandbox — เปลี่ยนเป็น import ตรง ๆ

```js
import * as E from '../lib/engine.generated.js';
```

ส่วน helper (`newGame` `pid` `player` `hasStep` `act` `finishRemainingSteps`
`resolveNightAndDawn`) ยกมาได้ทั้งหมดโดยไม่แก้ตรรกะ

**ยกไปเฟส 2**: `loadFull()` และ `mock-sheets.js` (เกี่ยวกับ Sheets ล้วน ๆ)
ให้ลบเทสต์หมวด "ชั้นจัดเก็บข้อมูลและประสิทธิภาพ" 8 ข้อออกชั่วคราว แล้วเขียนใหม่ในเฟส 2

**เกณฑ์ผ่าน**
- `npm test` ได้ **69/69**
- `npm run build:engine` ทำงานได้และการ์ด `SpreadsheetApp` ทำงานจริง (ลองใส่คำนี้เข้าไปดูว่ามัน throw)
- `npm run dev` เปิดหน้าเปล่าได้ที่ localhost:3000

---

## 4. เฟส 2 — ฐานข้อมูล Neon (1 วัน)

### 4.1 สร้างฐานข้อมูล

Vercel Dashboard → Storage → Create → Neon Postgres → เชื่อมกับโปรเจกต์
Vercel จะใส่ `DATABASE_URL` ให้อัตโนมัติ ดึงมาใช้ในเครื่องด้วย `vercel env pull .env.local`

### 4.2 สคีมา

```sql
-- migrations/001_init.sql
CREATE TABLE games (
  game_id     TEXT PRIMARY KEY,
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL,
  title       TEXT,
  pin_hash    TEXT NOT NULL,
  state       JSONB NOT NULL,
  finished    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX games_open_idx ON games (finished, updated_at DESC);

CREATE TABLE events (
  id           BIGSERIAL PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  type         TEXT NOT NULL,
  day_number   INTEGER,
  night_number INTEGER,
  payload      JSONB
);
CREATE INDEX events_game_idx ON events (game_id, seq);

CREATE TABLE snapshots (
  id         BIGSERIAL PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  command_id TEXT,
  label      TEXT,
  state      JSONB NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX snapshots_game_idx ON snapshots (game_id, id DESC);

CREATE TABLE role_overrides (
  role_id        TEXT PRIMARY KEY,
  display_name_th TEXT,
  village_impact INTEGER,
  max_copies     INTEGER,
  enabled        BOOLEAN,
  note_th        TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency (
  key        TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**หายไปจากของเดิม (ตั้งใจ)**: การแตก JSON เป็นชิ้น (`_chunk`/`_unchunk`) —
`jsonb` ไม่มีขีดจำกัด 50,000 ตัวอักษรต่อช่องแบบ Sheets ให้ลบตรรกะนี้ทิ้งได้เลย

### 4.3 `lib/storage.ts` — แทน `Storage.gs`

หน้าที่เดิมที่ต้องคงไว้ทุกข้อ: idempotency, ตรวจ version, snapshot สำหรับ undo,
บันทึก event, กันคำสั่งชนกัน

```ts
export async function runCommand<T>(
  cmd: Command,
  label: string,
  highImpact: boolean,
  mutator: (state: GameState) => void
): Promise<ModeratorViewModel> {
  // 1. idempotency: คีย์เดิม → คืนผลเดิม ไม่ทำซ้ำ
  // 2. BEGIN
  // 3. SELECT ... FOR UPDATE  (ล็อกเฉพาะแถวของเกมนี้)
  // 4. ตรวจ PIN + assertVersion(state, cmd.expectedVersion)
  // 5. ถ้า highImpact → INSERT snapshot
  // 6. mutator(state)
  // 7. UPDATE games SET state, version = version + 1 WHERE game_id = $1 AND version = $2
  //    ถ้า rowCount = 0 → มีคนแก้แทรก ให้โยน Error เดิม
  // 8. INSERT events (จาก state.__events)
  // 9. INSERT idempotency
  // 10. COMMIT
  // 11. ยิง notifyStream(gameId) สำหรับ SSE
}
```

**จุดที่ดีขึ้นกว่าเดิมโดยอัตโนมัติ**: `SELECT ... FOR UPDATE` ล็อกเฉพาะแถวของเกมนั้น
แก้ปัญหา "สองโต๊ะบล็อกกันเอง" ที่ค้างไว้เป็นระยะที่ 3 บน GAS **ได้ฟรี**

**อย่าลืม**: `trimSnapshots` เก็บ 25 จุดเหมือนเดิม ทำด้วย
`DELETE FROM snapshots WHERE game_id=$1 AND id NOT IN (SELECT id FROM snapshots WHERE game_id=$1 ORDER BY id DESC LIMIT 25)`

### 4.4 แคตตาล็อกบทบาท

`applyCatalogOverrides()` ยังใช้ของเดิม แค่เปลี่ยนแหล่งข้อมูลจากชีตเป็นตาราง `role_overrides`
ทำ `ensureCatalogLoaded()` ที่แคชในหน่วยความจำต่อ instance + `unstable_cache` ของ Next.js

**ระวัง**: Vercel เป็น serverless ตัวแปรระดับโมดูลอยู่ได้แค่ช่วงที่ instance ยังอุ่น
อย่าพึ่งพามันเป็นแหล่งความจริง ใช้เป็นแค่ชั้นแคช

### 4.5 เทสต์เฟสนี้

เขียนใหม่ 8 ข้อแทนของเดิม โดยชี้ไปที่ Neon branch สำหรับทดสอบ (Neon แตก branch ได้)
หรือใช้ `pg-mem` ถ้าอยากรันออฟไลน์

ต้องคุมให้ครบ: บันทึก/อ่านกลับ, PIN ผิดเข้าไม่ได้, version ซ้อนทับถูกปฏิเสธ,
idempotencyKey เดิมไม่ทำซ้ำ, snapshot/undo, trim เหลือ 25, สองเกมไม่ปนกัน,
**คำสั่งพร้อมกันสองคำสั่งบนเกมเดียวกันต้องมีตัวหนึ่งแพ้** (เทสต์ที่บน GAS เขียนไม่ได้)

**เกณฑ์ผ่าน**: `npm test` ได้ **77/77** (69 + 8 ข้อใหม่)

---

## 5. เฟส 3 — API + auth (ครึ่งวัน)

### 5.1 route เดียวรับทุก mutation

`Api.gs` มี 31 ฟังก์ชัน แต่ 24 ตัวเป็น `runCommand(...)` ทั้งหมด ให้รวมเป็น route เดียว

```ts
// app/api/command/route.ts
const HANDLERS = {
  setPlayers:      { label: 'ตั้งรายชื่อผู้เล่น',  high: false, fn: (s, c) => E.setPlayers(s, c.playerNames) },
  configureGame:   { label: 'ตั้งค่ากติกา',       high: false, fn: (s, c) => E.configureGame(s, c) },
  startGame:       { label: 'เริ่มเกม',           high: true,  fn: (s) => E.startGame(s) },
  submitRoleAction:{ label: 'บันทึกการกระทำ',     high: false, fn: (s, c) => E.submitRoleAction(s, c.stepId, c.targetIds, c.meta) },
  // ... ครบทุกตัวตาม Api.gs เดิม รวม openNomination ที่เพิ่งเพิ่ม
} as const;
```

**ค่า `high` (ทำ snapshot) ต้องตรงกับของเดิมเป๊ะ ๆ** ปัจจุบันมี 9 ตัว:
`reopenRoleAssignment` `startGame` `resolveNight` `resolvePrompt` `startNomination`
`resolveVote` `forceEndDay` `moderatorKill` `endGame`

### 5.2 auth

- PIN 4 หลักต่อเกมเหมือนเดิม แต่เก็บเป็น **bcrypt hash** ไม่เก็บดิบ
- ยืนยัน PIN สำเร็จ → ออก signed cookie (`jose` JWT, HttpOnly, SameSite=Lax, อายุ 12 ชม.)
- **ห้ามใส่ gameId หรือ PIN ใน URL** (กฎเดิมจาก `CLAUDE.md`)
- จอสาธารณะ **ไม่ต้อง auth** แต่ endpoint ต้องคืน `publicViewModel` เท่านั้น

### 5.3 SSE realtime

```ts
// app/api/stream/[gameId]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

Vercel serverless ไม่มี state ร่วมกัน ให้ใช้ **Postgres `LISTEN`/`NOTIFY`** หรือ
polling ฝั่งเซิร์ฟเวอร์ทุก 1 วินาทีเทียบ `version` แล้วส่งเมื่อเปลี่ยน (ง่ายกว่าและพอสำหรับผู้ใช้หลักสิบ)

**สำคัญ**: ต้องมี fallback เป็น polling ถ้า SSE หลุด — จอทีวีในห้องเรียนค้างไม่ได้

**เกณฑ์ผ่าน**
- เทสต์ยังเขียว 77/77
- ยิง `curl` เข้า `/api/command` ได้ครบทุก handler
- เปิด SSE แล้วสั่งคำสั่งจากอีกแท็บ เห็นอัปเดตภายใน 2 วินาที

---

## 6. เฟส 4 — หน้าเว็บ React (2 วัน)

### 6.1 หน้าจอที่ต้องมี (ยกจาก `legacy-gas/Index.html`)

หน้าแรก → รายชื่อผู้เล่น → เลือกบทบาท → แจกบทบาท → กลางคืน → กลางวัน → จบเกม → จอสาธารณะ

### 6.2 สิ่งที่ต้องคงไว้ให้ครบ ห้ามตกหล่น

- **ปุ่มปิดจอทันที (👁️)** — สำคัญที่สุดในการใช้งานจริง มีคนเดินมาใกล้ต้องกดปิดได้เลย
- **เมนูเครื่องมือ (🔧)** 5 คำสั่ง: สลับบทบาท, กลับไปแก้การแจก, สั่งให้เสียชีวิต, ส่งออกตารางผู้เล่น (เปลี่ยนเป็น export CSV), จบเกมทันที
- **ปุ่มย้อนคำสั่ง (↩️)** ย้อนได้ 25 ขั้น
- **หน้าเลือกบทบาทแบ่งตามฝ่าย** 5 กลุ่ม + ตัวกรองชุดการ์ด + ปุ่มจัดชุดแนะนำอัตโนมัติ
- **คำเตือน Village Impact ยังไม่ยืนยัน** — ห้ามลบจนกว่าจะได้ค่าจริงจากการ์ด
- **นาฬิกา 3 ตัว**: อภิปราย, เสนอชื่อ, ต่อขั้นตอนกลางคืน
- **หน่วงสุ่มตอนข้ามขั้นตอน** (`randomDelayMs`) — กันผู้เล่นเดาจากความเงียบ
- **อ่านบทออกเสียง** ผ่าน Web Speech API ภาษาไทย
- **จอสาธารณะห้ามรั่วบทบาทของคนเป็น** — เขียนเทสต์คุมข้อนี้โดยเฉพาะ

### 6.3 ข้อได้เปรียบที่ควรใช้

- ไม่ต้องเขียน ES5 อีกแล้ว ใช้ TypeScript เต็มที่
- สร้าง type จาก view model จริง ป้องกันการอ้างฟิลด์ผิด (ปัญหาที่เจอบ่อยบน GAS)
- โหลดหน้าไว ไม่ต้องรอ Apps Script ตื่น

### 6.4 ข้อมูลในเครื่อง

`localStorage` เก็บ gameId ล่าสุด (ไม่เก็บ PIN แล้ว เพราะใช้ cookie แทน) ครอบ `try/catch` เสมอ

**เกณฑ์ผ่าน**: เดินเกมจริงจบหนึ่งเกม 8 คนบนมือถือได้ตั้งแต่สร้างเกมจนประกาศผู้ชนะ

---

## 7. เฟส 5 — หน้าแอดมินแก้บทบาท (ครึ่งวัน)

ทดแทนการแก้ในแท็บ `RoleCatalog` ที่หายไป

- ตาราง 46 แถว แก้ได้: `villageImpact` `maxCopies` `enabled` `displayNameTh` `noteTh`
- ปุ่ม **นำเข้า/ส่งออก CSV** เพื่อให้ยังแก้ใน Google Sheets แล้ววางกลับได้
- ปุ่ม **คืนค่าเริ่มต้น** (ลบทั้งตาราง `role_overrides`)
- เมื่อบันทึกแล้วต้องล้างแคชแคตตาล็อกทันที
- ป้องกันด้วยรหัสผ่านแอดมินแยกจาก PIN เกม (env `ADMIN_PASSWORD`)
- **เมื่อค่า Village Impact ถูกยืนยันครบแล้ว** ให้ตั้ง `VILLAGE_IMPACT_VERIFIED = true`
  ซึ่งจะทำให้คำเตือนบนหน้าเลือกบทบาทหายไป

**เกณฑ์ผ่าน**: แก้ค่าในหน้าแอดมิน → สร้างเกมใหม่ → เห็นค่าใหม่มีผลทันที

---

## 8. เฟส 6 — ปิดงาน

1. ลบโฟลเดอร์ `legacy-gas/` (โค้ดยังอยู่ในประวัติ git)
2. อัปเดต `CLAUDE.md` ให้ตรงสแตกใหม่ — โดยเฉพาะหัวข้อ 7 (ประสิทธิภาพ)
   ที่พูดถึง Sheets ทั้งหมด ต้องเขียนใหม่
3. เขียน `README.md` ใหม่: วิธี deploy, env vars, วิธีรัน migration
4. ตั้งค่า GitHub Actions ให้รัน `npm test` ทุก push
5. merge `vercel-migration` → `main`
6. ตั้ง production domain บน Vercel

**เกณฑ์ผ่านสุดท้าย**: ครูใช้สอนจริงได้หนึ่งคาบโดยไม่ต้องกลับไปใช้ GAS

---

## 9. รายการที่ต้องเฝ้าระวัง

| ความเสี่ยง | วิธีรับมือ |
|---|---|
| แก้ตรรกะเกมโดยไม่ตั้งใจระหว่างย้าย | เทสต์ต้องเขียวทุกเฟส และห้ามแก้ไฟล์ใน `lib/engine/` |
| Vercel serverless ไม่มี state ร่วม | อย่าใช้ตัวแปรระดับโมดูลเป็นแหล่งความจริง ใช้เป็นแคชเท่านั้น |
| cold start ทำให้คำสั่งแรกช้า | ยอมรับได้ (~1 วินาที) หรือใช้ Fluid Compute ของ Vercel |
| Neon free tier มี auto-suspend | คำสั่งแรกหลังพักอาจช้า 1–2 วินาที ทดสอบก่อนใช้จริง |
| SSE หลุดกลางคาบ | ต้องมี fallback polling เสมอ |
| Vercel Hobby ห้ามใช้เชิงพาณิชย์ | ใช้ในโรงเรียนน่าจะเข้าเกณฑ์ แต่ให้อ่านเงื่อนไขเอง |
| ลืมย้ายฟีเจอร์เล็ก ๆ | ใช้เช็กลิสต์ข้อ 6.2 ตรวจทีละข้อ |

---

## 10. คำถามที่ยังค้าง (ไม่เกี่ยวกับการย้าย)

ยกมาจาก `CLAUDE.md` ข้อ 9 — ต้องยืนยันกับเจ้าของกล่องเกม ไม่ใช่งานของ Claude Code

1. **ค่า Village Impact จริงของทั้ง 46 บทบาท** (สำคัญที่สุด ค่าปัจจุบันเป็นค่าประมาณ)
2. Wolfpack และ Hunting Party ในกล่องมีบทบาทใดบ้าง
3. Vampire เล่นร่วมกับหมาป่าหรือเล่นแทน
4. การเปิดเผยบทบาทเมื่อตายใช้แบบไหน
5. กติกาเมื่อคะแนนเสมอใช้แบบไหน
6. แม่มดมีขวดยากี่ขวด
7. สมุนหมาป่าแจกเป็นการ์ดหรือให้หมาป่าเลือกภายหลัง

---

## 11. สรุปเวลาโดยประมาณ

| เฟส | งาน | เวลา | เกณฑ์ผ่าน |
|---|---|---|---|
| 0 | ขึ้น GitHub | 30 นาที | โค้ดอยู่บน repo |
| 1 | โครงกระดูก + engine | ครึ่งวัน | เทสต์ 69/69 |
| 2 | ฐานข้อมูล Neon | 1 วัน | เทสต์ 77/77 |
| 3 | API + auth + SSE | ครึ่งวัน | ยิง API ได้ครบ SSE ทำงาน |
| 4 | หน้าเว็บ React | 2 วัน | เดินเกมจริงจบได้ |
| 5 | หน้าแอดมิน | ครึ่งวัน | แก้ค่าแล้วมีผลทันที |
| 6 | ปิดงาน | ครึ่งวัน | ใช้สอนจริงได้ |
| | **รวม** | **~5 วัน** | |
