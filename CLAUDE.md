# CLAUDE.md — Ultimate Werewolf: Deluxe Moderator Web App

เอกสารบริบทสำหรับ Claude Code วางไฟล์นี้ไว้ที่รากโปรเจกต์
อ่านไฟล์นี้ก่อนแตะโค้ดใด ๆ เพื่อไม่ให้ทำงานซ้ำหรือรื้อการตัดสินใจที่ผ่านการทดสอบแล้ว

---

## 1. โปรเจกต์นี้คืออะไร

เว็บแอปบน **Next.js 15 + Vercel + Postgres** ช่วย *ผู้ดำเนินเกม (Moderator)* ดำเนินเกมกระดาน
**Ultimate Werewolf: Deluxe Edition** สำหรับการเล่นแบบเจอหน้ากันโดยใช้การ์ดจริง

แอปทำหน้าที่เป็น "สมองและสมุดจด" ของผู้ดำเนินเกม — จำว่าใครเป็นอะไร คำนวณผลกลางคืน
จัดลำดับการปลุก นับคะแนน ตัดสินผู้ชนะ **ไม่ได้แทนการ์ด และไม่แสดงภาพหรือข้อความจากการ์ดจริง**

**ผู้ใช้จริง**: ครูโรงเรียนประถม ใช้กับนักเรียน เปิดบนมือถือเป็นหลัก
ภาษาในอินเทอร์เฟซและข้อความทั้งหมด **เป็นภาษาไทย**

### ขอบเขตที่ห้ามข้าม

- ห้ามปนกติกาของ **One Night Ultimate Werewolf** (คนละเกม คนละกติกา)
- ห้ามคัดลอกข้อความหรือภาพจากการ์ดจริง — บทพูดผู้ดำเนินเกมต้องเขียนขึ้นใหม่
- จอสาธารณะ **ห้ามรั่วบทบาทของผู้เล่นที่ยังมีชีวิตอยู่** เด็ดขาด (มีเทสต์คุมไว้ 3 ข้อ)

---

## 2. สถานะปัจจุบัน

| หัวข้อ | สถานะ |
|---|---|
| เวอร์ชัน | 2.0.0 (ย้ายจาก Google Apps Script 1.0.0 มาแล้วครบทุกเฟส) |
| ชุดทดสอบ | **ผ่าน 118 / ล้มเหลว 0** (`npm test`) |
| บทบาท | ครบ 46 (Core 34 / Wolfpack 6 / Hunting Party 6) |
| คำสั่งที่หน้าเว็บสั่งได้ | 22 ตัว ทุกตัวมีปุ่มเรียกจากหน้าจอและถูกยิงใน `npm run smoke` |
| ตัวเลือกกติกา | 18 ตัว ทุกตัวมีโค้ดรองรับจริงและมีเทสต์คุม |
| ตรรกะเกม | 2,770 บรรทัด ไม่ถูกแก้แม้แต่บรรทัดเดียวระหว่างย้าย |

ประวัติเวอร์ชัน Apps Script อยู่ใน git history (commit `GAS version 1.0.0`)

---

## 3. แผนผังไฟล์

```
app/
  page.tsx                     401  จอผู้ดำเนินเกมทั้งหมด (state + routing + เครื่องมือ)
  layout.tsx / globals.css          ธีมกลางคืน ฟอนต์ Sarabun+Prompt โฮสต์เอง
  public/[gameId]/page.tsx          จอสาธารณะ
  admin/page.tsx               271  หน้าแก้บทบาท 46 รายการ + CSV
  admin/stats/page.tsx              สถิติข้ามเกม (เฉพาะเกมที่จบแล้ว)
  api/
    command/route.ts                POST ทุก mutation (ตารางคำสั่งอยู่ที่ lib/commands.ts)
    games/route.ts                  POST สร้างเกม
    game/[gameId]/route.ts          GET view model ผู้ดำเนินเกม
    game/[gameId]/{events,summary,validate,players.csv}/
    public/[gameId]/route.ts        GET view model สาธารณะ (ไม่ต้อง auth)
    stream/[gameId]/route.ts     78  SSE ส่งเฉพาะเลขเวอร์ชัน
    auth/{login,logout}/route.ts    ยืนยัน PIN → cookie
    admin/{login,roles,stats}/route.ts  หน้าแอดมินและสถิติ
components/
  ui.tsx                       174  Loading, PrivacyCover, Toast, Dialog, Modal
  PublicScreen.tsx              74
  screens/{Home,Players,Roles,Assign,Night,Day,End}Screen.tsx
lib/
  engine/*.gs                 2770  ตรรกะเกม 8 ไฟล์ (ห้ามแก้ ดูข้อ 4)
  engine.generated.js               build ออกมาจาก 8 ไฟล์ข้างบน ไม่ commit
  engine.generated.d.ts        155  type ของ engine เขียนมือ
  types.ts                     284  type ของ state และ view model
  storage.ts                   352  runCommand, snapshot/undo, event log, idempotency
  db.ts                         61  pool ต่อ instance
  catalog.ts                   132  override บทบาทจากตาราง role_overrides
  auth.ts                      113  PIN → bcrypt + JWT cookie, รหัสผ่านแอดมิน
  voting.ts                         บังคับลงคะแนนให้ครบ + ตรวจผู้ที่คะแนนเสมอ
  pause.ts                          หยุด/เดินนาฬิกาต่อเมื่อพักเกม
  ids.ts                            รหัสเกมและ PIN จาก CSPRNG
  rateLimit.ts                      โควตาต่อ IP สำหรับสร้างเกมและล็อกอิน
  commands.ts                  138  ตารางคำสั่ง 20 ตัว + label + ธง snapshot
  nightHints.ts                     บอกว่าปุ่มเป้าหมายใดกดไม่ได้และเพราะอะไร
  stats.ts                          รวมสถิติข้ามเกมจากเกมที่จบแล้ว
  api.ts                        34  แปลง Error เป็น HTTP status
  client/{api,useGameStream,variants,announce}.ts
scripts/
  build-engine.mjs              72  ต่อ .gs เป็น ES module + การ์ดกัน Apps Script API
  migrate.mjs / ensure-test-db.mjs / run-tests.mjs
  smoke-api.mjs                304  เดินเกมจริงผ่าน HTTP ครบทุกคำสั่ง
  smoke-ui.mjs                 222  เดินเกม 8 คนบน Chromium ขนาดมือถือ
migrations/001_init.sql, 002_rate_limit.sql
tests/{engine,storage,publicview,nighthints,stats,voting,pause,ids,ratelimit,announce}.test.js
       + helpers.js
```

### ชั้นของสถาปัตยกรรม

```
app/**/page.tsx + components/    ← หน้าเว็บ (React + TypeScript)
        ↓ fetch
app/api/**/route.ts              ← ชั้นเดียวที่หน้าเว็บเรียกได้ (auth อยู่ตรงนี้)
        ↓ runCommand()
lib/storage.ts                   ← tx → idempotency → FOR UPDATE → version → mutate → persist
        ↓
lib/engine/*.gs                  ← ตรรกะบริสุทธิ์ ไม่แตะฐานข้อมูล ไม่แตะ network
```

---

## 4. กฎเหล็ก: ห้ามแก้ไฟล์ใน `lib/engine/`

`Config.gs` `RoleCatalog.gs` `Utils.gs` `Validation.gs` `WinConditionService.gs`
`EffectResolver.gs` `RuleEngine.gs` `GameService.gs`

ไฟล์เหล่านี้ผ่านเทสต์ 69 ข้อมาตั้งแต่ยุค Apps Script และเป็นสินทรัพย์ที่มีค่าที่สุดในโปรเจกต์
มันใช้ `var` อยู่ใน global scope เดียวกัน เรียกข้ามไฟล์กันหลายร้อยจุด
`scripts/build-engine.mjs` จึง **ต่อไฟล์ทั้งหมดเข้าด้วยกันแล้วเติม `export` ท้ายไฟล์**
แทนการไล่ใส่ `import`/`export` ทีละไฟล์

- นามสกุล `.gs` คงไว้โดยตั้งใจ เพื่อให้เห็นชัดว่าไฟล์กลุ่มนี้เล่นคนละกติกากับที่เหลือ
- สคริปต์ build มีการ์ดตรวจ `SpreadsheetApp` / `CacheService` / `PropertiesService` / `LockService`
  ถ้าใครเผลอใส่กลับเข้าไป build จะพังทันทีพร้อมข้อความภาษาไทย
- ถ้าจะแก้กติกาจริง ๆ ให้แก้พร้อมเทสต์ในไฟล์ `tests/engine.test.js` เสมอ
- เพิ่ม export ใหม่ต้องแก้ทั้ง `EXPORTS` ใน `scripts/build-engine.mjs`
  และ `lib/engine.generated.d.ts` (สคริปต์ตรวจให้ว่าชื่อมีจริง)

---

## 5. ข้อตกลงในการเขียนโค้ด

### ฝั่งเซิร์ฟเวอร์ (`lib/*.ts`, `app/api/**`)

- TypeScript เต็มรูปแบบ แต่ **import ภายใน `lib/` ต้องใส่นามสกุล `.ts`**
  เพราะชั้นเทสต์รันไฟล์เหล่านี้ด้วย Node ตรง ๆ (Node ลบ type ให้เอง ไม่ผ่าน bundler)
- ห้ามใช้ `enum` หรือ namespace (Node strip-types ไม่รองรับ)
- โยน `Error` พร้อมข้อความภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง — `lib/api.ts` ส่งข้อความนั้นออกไปตรง ๆ
- ทุก mutation ต้องผ่าน `runCommand()` ใน `lib/storage.ts` ห้ามเขียนตาราง `games` เอง
- คอมเมนต์อธิบาย **"ทำไม"** ไม่ใช่ "ทำอะไร" และเขียนเป็นภาษาอังกฤษ

### ฝั่งหน้าเว็บ

- ข้อจำกัด ES5 หมดไปแล้ว ใช้ TypeScript + React 19 ได้เต็มที่
- ห้ามใช้ `localStorage` โดยไม่ครอบ `try/catch` (โหมดส่วนตัวบน iOS โยน error)
- **ห้ามใส่ Game ID หรือ PIN ลงใน URL** ของจอผู้ดำเนินเกม (จอสาธารณะใช้ gameId ใน path ได้ เพราะไม่มีความลับ)
- ทุกคำสั่งต้องแนบ `expectedVersion` และ `idempotencyKey` ผ่าน `sendCommand()`
- ไม่พึ่ง CDN — ฟอนต์โฮสต์เอง ไม่มี Bootstrap/SweetAlert2 แล้ว (`components/ui.tsx` แทน)

---

## 6. แนวคิดหลักของ engine

### state machine

```
SETUP → ROLE_ASSIGNMENT → FIRST_NIGHT → RESOLVE_NIGHT → DAWN
      → DISCUSSION → NOMINATION → VOTING → RESOLVE_DAY
      → [DEATH_TRIGGER] → WIN_CHECK → NIGHT → ... → FINISHED
                                              (PAUSED แทรกได้ทุกจุด)
```

### ทีม

`VILLAGE` `WEREWOLF` `VAMPIRE` `CULT` `INDEPENDENT`

### ลำดับการปลุกกลางคืน

**ห้าม hard-code** ลำดับการปลุก ระบบอ่านจาก `wakePriority` ใน `RoleCatalog.gs`
แล้วเรียงเอง (`buildNightSteps()`) หมาป่าเป็น group step หนึ่งขั้น ที่เหลือแยกขั้น

ค่าที่ใช้อยู่: doppelganger 2, mason 3, cupid 4, hoodlum 6, dire_wolf 7,
virginia_woolf 8, minion 9, drunk 10, priest 20, bodyguard 22, **wolfpack 30**,
alpha_wolf 32, vampire 34, witch 40, seer 50, apprentice_seer 51, mystic_seer 52,
pi 54, aura_seer 56, sorceress 58, huntress 60, revealer 62, mentalist 64,
spellcaster 70, old_hag 72, cult_leader 74, troublemaker 76, ghost 80

### ลำดับการฆ่า (`attemptKill()` ใน EffectResolver.gs)

```
vampire immunity → bodyguard → cursed convert → tough_guy delay → blessing → เข้าคิวตาย
```

คิวการตายประมวลผลแบบลูกโซ่ (ตายคนหนึ่งอาจทำให้อีกคนตายตาม) มี guard 300 รอบ
กันลูปไม่สิ้นสุด — **ห้ามลบ guard นี้**

### targetRule ที่รองรับ (Validation.gs)

`NONE` `OTHER_ALIVE` `OPTIONAL_OTHER_ALIVE` `TWO_ALIVE` `TWO_OTHER_ALIVE`
`WOLF_VICTIM` `OTHER_ALIVE_NO_REPEAT_CONSECUTIVE` `OTHER_ALIVE_NEVER_REPEATED`
`DEAD_PLAYER`

การเพิ่ม targetRule ใหม่ต้องแก้ **3 จุด**: `Validation.gs` (ตรวจ),
`RuleEngine.buildNightSteps()` (สร้างขั้นตอน), `components/screens/NightScreen.tsx` → `TargetGrid` (ปุ่มเลือก)

---

## 7. การตัดสินใจที่ผ่านมา — อย่ารื้อโดยไม่ถาม

### การตีความกติกาที่คลุมเครือ

| จุด | ตีความว่า | ปรับได้ที่ |
|---|---|---|
| Big Bad Wolf | เหยื่อคนที่สองต้องนั่งติดเหยื่อคนแรก และให้เฉพาะเมื่อไม่มีโบนัส Wolf Cub ซ้อน | `requireAdjacentSecond` |
| Hunter | ยิงหลังคิวการตายว่างแล้ว (สถานะ `DEATH_TRIGGER`) ไม่ใช่ยิงกลางคิว **เพื่อกันลูปไม่สิ้นสุด** | `pendingPrompts` |
| Village Idiot | ค่าเริ่มต้นรอดจากการแขวน เปิดเผยตัว แล้วโหวตไม่ได้อีก | `villageIdiotMode` |
| Tanner (คนบ้า) | ชนะเมื่อ**ถูกโหวตแขวนคอ**เท่านั้น และ**เกมจบทันที** | `tannerMode`, `tannerEndsGame` |

### ตัวเลือกที่จงใจถอดออก

- **`minionMode`** — เป็นการตัดสินใจตอนจัดสำรับ ไม่ใช่ตรรกะในเกม
- **`cupidMode: TAKES_LEFTOVER_ROLE`** — ระบบไม่ได้เก็บข้อมูลการ์ดที่เหลือในกล่อง

**หลักการ**: ถ้าจะเพิ่มตัวเลือกกติกาใหม่ ต้องเขียนโค้ดรองรับ**และ**เทสต์คุมพร้อมกัน
โปรเจกต์นี้เคยมีปุ่ม 8 ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น อย่าให้เกิดซ้ำ

### ค่า Village Impact ยังไม่ยืนยัน ⚠️

ค่า `villageImpact` ทั้ง 46 บทบาท **เป็นค่าประมาณ ไม่ได้ถอดจากการ์ดจริง**
`VILLAGE_IMPACT_VERIFIED = false` ใน `RoleCatalog.gs` และหน้าเว็บขึ้นคำเตือนกำกับตัวเลขสมดุลเสมอ

ผู้ใช้แก้เองได้ที่ `/admin` เมื่อแก้ครบแล้วให้ตั้ง env `VILLAGE_IMPACT_VERIFIED=true`
(ทำแบบนี้เพื่อไม่ต้องแตะไฟล์ตรรกะ) — **อย่าลบคำเตือนนี้ด้วยวิธีอื่น**

### กติกาที่ชั้นคำสั่งบังคับเพิ่มจาก engine (แก้จากผลตรวจความพร้อม)

engine ตัดสินจากคะแนนเท่าที่มีในมือ และไม่รู้จักคำว่า "ยังลงไม่ครบ" กติกาสี่ข้อนี้จึงอยู่ใน
ชั้นคำสั่ง (`lib/`) ทำงานใน transaction เดียวกับคำสั่ง **โดยไม่แตะไฟล์ตรรกะ**

| กติกา | อยู่ที่ | ทำไม |
|---|---|---|
| ปิดโหวตไม่ได้จนกว่าผู้มีสิทธิ์จะลงครบทุกคน | `lib/voting.ts` | เดิมลง 2 จาก 8 คนแล้วกดสรุป ก็แขวนคอได้ |
| ผู้ดำเนินเกมเลือกได้เฉพาะคนที่คะแนนเสมอจริง | `lib/voting.ts` | เดิมส่ง playerId ใดก็ได้ให้ตาย |
| พักเกมแล้วเลื่อนเส้นตายของนาฬิกาออกไปเท่าเวลาที่พัก | `lib/pause.ts` | เดิมพัก 5 นาที กินเวลาอภิปราย 5 นาที |
| กลับไปแก้การแจกบทบาทหลังเริ่มเกม = กู้ snapshot ก่อนคืนแรก | `lib/storage.ts` | เดิมแค่ปลดล็อก ทั้งที่ข้อความบอกว่าล้างทุกอย่าง |

**เพิ่มกฎใน `Validation.gs` หรือ `RuleEngine.gs` เมื่อไหร่ ต้องดูด้วยว่าสี่ไฟล์นี้ต้องตามหรือไม่**

### สิ่งที่ผู้ดำเนินเกมต้องได้เห็นแบบขัดจังหวะ (`lib/client/announce.ts`)

ครูมองโต๊ะ ไม่ได้จ้องมือถือ ข้อมูลสี่อย่างนี้จึงต้องเด้งเป็นกล่องที่ต้องกดรับทราบ
ไม่ใช่แค่ขึ้นอยู่ในหน้าจอเฉย ๆ

| จังหวะ | เด้งอะไร |
|---|---|
| บันทึกการกระทำกลางคืน | คำตอบของบทบาทนั้น เช่น ผู้หยั่งรู้ให้พยักหน้า/ส่ายหน้า (ใช้ข้อความจาก engine ตรง ๆ) |
| สรุปผลกลางคืน | รายชื่อผู้เสียชีวิตพร้อมสาเหตุ |
| สรุปผลการลงคะแนน | ใครถูกแขวนคอ หรือทำไมไม่มีใครถูกแขวน |

**ข้อความทั้งหมดมาจาก engine** ไฟล์นี้เลือกว่าจะพูดอันไหนเท่านั้น ไม่ตัดสินเองว่าเกิดอะไรขึ้น
และการเปิดเผยบทบาทของผู้ตายเคารพ `roleRevealMode` เหมือนหน้าจออื่น

### ด้านความปลอดภัยที่ต้องคงไว้

- **รหัสเกมและ PIN มาจาก `lib/ids.ts` (CSPRNG)** ไม่ใช่ `uwRandomId()` ของ engine ที่ใช้ `Math.random()`
  storage เขียนทับค่าที่ engine สุ่มไว้ทันทีที่สร้างเกม พร้อมแก้ event/timeline ให้อ้างรหัสใหม่
- **`/api/bootstrap` ห้ามส่งรายการเกมที่ยังเล่นอยู่** เด็ดขาด — เดิมแจกรหัสเกมทุกเกมให้ทุกคนที่เปิดเว็บ
  ตอนนี้อุปกรณ์จำเกมของตัวเองใน localStorage และแอดมินดูรายการเต็มได้ที่ `/api/admin/games`
- **ล็อกอินตอบข้อความเดียวกันทั้งกรณีไม่พบเกมและ PIN ผิด** ไม่งั้นฟอร์มล็อกอินกลายเป็นเครื่องมือหารหัสเกม
- **rate limit อยู่ในฐานข้อมูล ไม่ใช่หน่วยความจำ** เพราะ instance ของ Vercel ไม่แชร์ค่ากัน

### สิ่งที่ระบบไม่มีอีกแล้วหลังย้าย

- การแตก state JSON เป็นชิ้น (`_chunk`) — `jsonb` ไม่มีขีดจำกัด 50,000 ตัวอักษร
- ตาราง `Players` ใน Google Sheets — แทนด้วยดาวน์โหลด CSV
- แคชเลขแถวของเกม — Postgres มี primary key อยู่แล้ว
- `LockService` ระดับทั้งสคริปต์ — แทนด้วย `SELECT ... FOR UPDATE` ต่อเกม
  (แก้ปัญหา "สองโต๊ะบล็อกกันเอง" ที่ค้างมาจากยุค Apps Script)

---

## 8. เรื่องประสิทธิภาพ

Vercel + Neon ตอบสนองราว 50–300 ms ต่อคำสั่ง (เทียบกับ 0.6–2 วินาทีบน Apps Script)
คอขวดที่เหลือมีสองจุดเท่านั้น

### 1. cold start / auto-suspend

Neon free tier พักการทำงานเมื่อไม่มีคนใช้ คำสั่งแรกหลังพักช้าได้ 1–2 วินาที
**ยอมรับได้** อย่าแก้ด้วยการ ping ถี่ ๆ เพราะจะกินโควตาเปล่า ๆ

### 2. จำนวน round trip ต่อคำสั่ง

`runCommand()` ใช้ transaction เดียวจบ: idempotency → `SELECT ... FOR UPDATE` →
snapshot (เฉพาะคำสั่งสำคัญ) → `UPDATE` → `INSERT events` → `INSERT idempotency`
**อย่าแยกเป็นหลาย transaction** เพราะจะเสียการรับประกันเรื่องคำสั่งชนกัน

### กติกาที่ต้องรักษาไว้

1. **แคตตาล็อกบทบาทแคชในหน่วยความจำ 6 ชั่วโมงต่อ instance** (`lib/catalog.ts`)
   Vercel เป็น serverless — ตัวแปรระดับโมดูลอยู่ได้แค่ช่วงที่ instance ยังอุ่น
   **ห้ามใช้เป็นแหล่งความจริง** ใช้เป็นแค่ชั้นแคช
2. `applyCatalogOverrides()` เขียนทับ role definition ในหน่วยความจำโดยตรง
   `lib/catalog.ts` จึงเก็บค่าเริ่มต้นไว้ตั้งแต่โหลดแล้วคืนค่าก่อน apply ชุดใหม่เสมอ
   **ห้ามตัดขั้นตอนนี้ออก** ไม่งั้น instance ที่อุ่นอยู่จะจำค่าที่แอดมินลบไปแล้ว
3. **snapshot เก็บ 25 จุดต่อเกม** ตัดด้วย `DELETE ... NOT IN (... LIMIT 25)` คำสั่งเดียว
4. pool ของ `pg` เก็บไว้บน `globalThis` — ห้ามสร้าง pool ใหม่ต่อ request
5. SSE ส่งเฉพาะเลขเวอร์ชัน ไคลเอนต์ค่อยดึง view model ที่ตัวเองมีสิทธิ์
   **ห้ามส่ง view model ผ่านสตรีม** เพราะ route เดียวกันถูกใช้ทั้งจอสาธารณะและจอผู้ดำเนินเกม

---

## 9. ชุดทดสอบ

```bash
npm test              # ต้องได้ ผ่าน 118 / ล้มเหลว 0
npm run test:engine   # เฉพาะตรรกะเกม ไม่ต้องมีฐานข้อมูล
```

| ไฟล์ | จำนวน | คุมอะไร |
|---|---|---|
| `tests/engine.test.js` | 69 | ตรรกะเกมทั้งหมด ยกมาจากยุค Apps Script ไม่แก้แม้แต่ข้อเดียว |
| `tests/storage.test.js` | 8 | idempotency, เวอร์ชันซ้อนทับ, snapshot/undo, trim 25, สองเกมไม่ปนกัน, **คำสั่งพร้อมกันต้องมีตัวหนึ่งแพ้** |
| `tests/publicview.test.js` | 3 | จอสาธารณะห้ามรั่วบทบาทของคนเป็น ทุกช่วงของเกม |
| `tests/nighthints.test.js` | 4 | ปุ่มที่หน้าจอปิดไว้ ต้องตรงกับที่ `validateTargets()` ปฏิเสธจริง ไม่ขาดไม่เกิน |
| `tests/stats.test.js` | 5 | การรวมสถิติ และกฎที่ว่าสถิตินับเฉพาะเกมที่จบแล้ว |
| `tests/voting.test.js` | 6 | ลงคะแนนไม่ครบต้องปิดไม่ได้ และ tie choice ต้องอยู่ในกลุ่มที่เสมอ |
| `tests/pause.test.js` | 3 | พักแล้วนาฬิกาหยุดจริง และเวลาที่หมดไปแล้วไม่ถูกคืน |
| `tests/ids.test.js` | 3 | รหัสเกม/PIN จาก CSPRNG กระจายทั่วและไม่ซ้ำ |
| `tests/ratelimit.test.js` | 6 | โควตาต่อ key, หน้าต่างหมดอายุ, ฐานข้อมูลล่มต้องไม่ล็อกผู้ใช้ |
| `tests/announce.test.js` | 9 | ข้อความที่เด้งให้ผู้ดำเนินเกมอ่าน และการเคารพกติกาเปิดเผยบทบาท |

เทสต์ชั้นจัดเก็บข้อมูลรันบน **Postgres จริง** ไม่ใช่ของจำลอง เพราะของจำลองไม่รู้จัก
`SELECT ... FOR UPDATE` ซึ่งเป็นสิ่งที่เทสต์กลุ่มนี้ตั้งใจพิสูจน์
`scripts/run-tests.mjs` จะเปิดคลัสเตอร์ในเครื่องให้เองถ้าไม่ได้ตั้ง `DATABASE_URL`

### สคริปต์เดินเกมจริง (ต้องมีเซิร์ฟเวอร์รันอยู่)

```bash
npm run build && npm start &
npm run smoke      # ยิง API ครบทุกคำสั่ง 22 ตัว + SSE + แอดมิน + สถิติ (42 ข้อ)
npm run smoke:ui   # Chromium 360px เดินเกม 8 คนจนประกาศผู้ชนะ + พัก + แอดมิน + สถิติ (37 ข้อ)
```

`smoke-ui` ต้องมี Chromium ถ้าเครื่องมี build ที่ไม่ตรงกับแพ็กเกจ ให้ชี้ด้วย
`PW_CHROMIUM=/path/to/chrome`

### ตรวจก่อน commit ทุกครั้ง

```bash
npm run build:engine     # การ์ดกัน Apps Script API + ตรวจรายชื่อ export
npx tsc --noEmit         # type ทั้งโปรเจกต์
npm test                 # 118/118
```

---

## 10. งานที่ยังไม่ได้ทำ

### ต้องยืนยันกับเจ้าของกล่องเกม (ไม่ใช่งานของ Claude Code)

1. ค่า Village Impact จริงของทั้ง 46 บทบาท (สำคัญที่สุด)
2. Wolfpack และ Hunting Party ในกล่องมีบทบาทใดบ้าง (ปิดตัวที่ไม่มีที่ `/admin`)
3. Vampire เล่นร่วมกับหมาป่า หรือเล่นแทน (ตอนนี้ `vampireEnabled: false`)
4. การเปิดเผยบทบาทเมื่อตาย ใช้แบบไหน
5. กติกาเมื่อคะแนนเสมอ ใช้แบบไหน
6. แม่มดมีขวดยากี่ขวด ใช้ได้กี่ครั้ง
7. สมุนหมาป่าแจกเป็นการ์ดหรือให้หมาป่าเลือกภายหลัง

### จากรายงานตรวจความพร้อม (18 ส.ค. 2026) — P1 ที่ยังไม่ทำ

1. แสดง warnings ตอนเลือกชุดบทบาทแล้วให้ยืนยัน (ตอนนี้ engine คำนวณไว้แต่หน้าจอไม่แสดง)
2. ตรวจชื่อผู้เล่นซ้ำ/ว่างฝั่งเซิร์ฟเวอร์ (สถิติจับคู่ตามชื่อ จึงรวมคนผิดได้)
3. CSP และ security headers ใน `next.config.mjs`
4. retention/ลบข้อมูล: `idempotency`, `events`, `snapshots` และเกมค้าง ยังไม่มีงานล้าง
5. health check, structured log, error alert
6. undo ยังไม่ผูก `expectedVersion`/idempotency key
7. แยกผลเกมเป็น `completed` / `abandoned` เพื่อไม่ให้เกมที่สั่งจบมือบิดสถิติ

### ไอเดียที่ยังไม่ทำ (ไม่เร่ง)

- `LISTEN`/`NOTIFY` แทนการ poll เวอร์ชันในสตรีม — ตอนนี้ poll ทุก 1.2 วินาที
  ซึ่งเบามากสำหรับผู้ใช้หลักสิบ และทนการที่ instance หายไปได้ดีกว่า **จงใจไม่ทำ**
- ผูกผู้เล่นข้ามเกมด้วยรหัสนักเรียนแทนการจับคู่ตามชื่อในหน้าสถิติ

---

## 11. คำสั่งที่ใช้บ่อย

```bash
npm run dev            # http://localhost:3000
npm test               # 80/80
npm run db:migrate     # ใช้ migration ที่ยังไม่ได้รัน
npm run smoke          # เดินเกมผ่าน HTTP (ต้องมีเซิร์ฟเวอร์)
npm run smoke:ui       # เดินเกมบนเบราว์เซอร์ (ต้องมีเซิร์ฟเวอร์)
```

### URL

- จอผู้ดำเนินเกม: `/` (ใส่ PIN ครั้งเดียวต่ออุปกรณ์ แล้วจำด้วย cookie 12 ชั่วโมง)
- จอสาธารณะ: `/public/<GAME_ID>`
- หน้าผู้ดูแลบทบาท: `/admin`

### ตารางในฐานข้อมูล

`games` (state เป็น jsonb) `events` (append-only) `snapshots` (25 จุดต่อเกม สำหรับ undo)
`role_overrides` (**ผู้ดูแลแก้เองได้ที่ /admin**) `idempotency` `schema_migrations`

---

## 12. สิ่งที่ทำให้โปรเจกต์นี้พังได้ง่ายที่สุด

1. แก้ไฟล์ใน `lib/engine/` → เสียการรับประกันจากเทสต์ 69 ข้อที่สะสมมา
2. ใส่ service ของ Apps Script กลับเข้าไฟล์ตรรกะ → `npm run build:engine` พังทันที (ตั้งใจให้พัง)
3. ลืมใส่นามสกุล `.ts` ในการ import ภายใน `lib/` → เทสต์รันไม่ได้ (แต่ Next build ผ่าน)
4. เพิ่มตัวเลือกกติกาแต่ไม่เขียนโค้ดรองรับ → ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น (เคยมี 8 ปุ่ม)
5. ทำให้จอสาธารณะเห็นบทบาทของคนที่ยังมีชีวิต → ทำลายเกมทั้งกระดาน
6. ลบ guard 300 รอบในคิวการตาย → ลูปไม่สิ้นสุด ฟังก์ชัน timeout
7. แก้ลำดับการปลุกด้วยการ hard-code แทนการแก้ `wakePriority`
8. แยก `runCommand()` ออกเป็นหลาย transaction → คำสั่งสองคำสั่งพร้อมกันเขียนทับกันได้
9. พึ่งตัวแปรระดับโมดูลเป็นแหล่งความจริงบน Vercel → ค่าหายเมื่อ instance ถูกรีไซเคิล
10. เพิ่มกฎใน `validateTargets()` แล้วลืมสะท้อนใน `lib/nightHints.ts` →
    หน้าจอเปิดปุ่มที่เซิร์ฟเวอร์จะปฏิเสธ (มีเทสต์จับให้แล้วใน `tests/nighthints.test.js`)
11. เอาเกมที่ยังเล่นค้างอยู่ไปคิดสถิติ → รั่วบทบาทของคนที่ยังมีชีวิตทันที
12. ยิงสองคำสั่งติดกันจากหน้าเว็บโดยอ่าน `version` จาก state ของ render เดิม →
    คำสั่งที่สองถูกปฏิเสธเป็น 409 (ใช้ `vmRef` ใน `app/page.tsx` เสมอ)
13. เอารายการเกมกลับเข้า `/api/bootstrap` → แจกรหัสเกมให้ทุกคนอีกครั้ง
