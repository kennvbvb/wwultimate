# CLAUDE.md — Ultimate Werewolf: Deluxe Moderator Web App

เอกสารบริบทสำหรับ Claude Code วางไฟล์นี้ไว้ที่รากโปรเจกต์
อ่านไฟล์นี้ก่อนแตะโค้ดใด ๆ เพื่อไม่ให้ทำงานซ้ำหรือรื้อการตัดสินใจที่ผ่านการทดสอบแล้ว

---

## 1. โปรเจกต์นี้คืออะไร

เว็บแอปบน **Google Apps Script** ช่วย *ผู้ดำเนินเกม (Moderator)* ดำเนินเกมกระดาน
**Ultimate Werewolf: Deluxe Edition** สำหรับการเล่นแบบเจอหน้ากันโดยใช้การ์ดจริง

แอปทำหน้าที่เป็น "สมองและสมุดจด" ของผู้ดำเนินเกม — จำว่าใครเป็นอะไร คำนวณผลกลางคืน
จัดลำดับการปลุก นับคะแนน ตัดสินผู้ชนะ **ไม่ได้แทนการ์ด และไม่แสดงภาพหรือข้อความจากการ์ดจริง**

**ผู้ใช้จริง**: ครูโรงเรียนประถม ใช้กับนักเรียน เปิดบนมือถือเป็นหลัก
ภาษาในอินเทอร์เฟซและข้อความทั้งหมด **เป็นภาษาไทย**

### ขอบเขตที่ห้ามข้าม

- ห้ามปนกติกาของ **One Night Ultimate Werewolf** (คนละเกม คนละกติกา)
- ห้ามคัดลอกข้อความหรือภาพจากการ์ดจริง — บทพูดผู้ดำเนินเกมต้องเขียนขึ้นใหม่
- จอสาธารณะ **ห้ามรั่วบทบาทของผู้เล่นที่ยังมีชีวิตอยู่** เด็ดขาด (มีเทสต์คุมไว้)

---

## 2. สถานะปัจจุบัน

| หัวข้อ | สถานะ |
|---|---|
| เวอร์ชัน | 1.0.0 |
| ชุดทดสอบ | **ผ่าน 77 / ล้มเหลว 0** (`node tests/run.js`) |
| บทบาท | ครบ 46 (Core 34 / Wolfpack 6 / Hunting Party 6) |
| API สาธารณะ | 31 ฟังก์ชัน ทุกตัวมีปุ่มเรียกจากหน้าจอแล้ว |
| ตัวเลือกกติกา | 18 ตัว ทุกตัวมีโค้ดรองรับจริงและมีเทสต์คุม |
| ประสิทธิภาพ | ทำระยะที่ 1 แล้ว (ระยะ 2–3 ยังไม่ทำ ดูข้อ 9) |
| โค้ดรวม | 7,236 บรรทัด |

---

## 3. แผนผังไฟล์

```
src/
  Config.gs               144  ค่าคงที่ สถานะ ทีม สาเหตุการตาย defaultRuleVariants()
  RoleCatalog.gs          397  ฐานข้อมูลบทบาท 46 ตัว + applyCatalogOverrides()
  Utils.gs                166  helper ผู้เล่น ที่นั่ง สถานะ ทีม assertVersion()
  Validation.gs           184  ตรวจเป้าหมาย/การเลือกบทบาท/การโหวต พร้อมเหตุผลไทย
  WinConditionService.gs  206  เงื่อนไขชนะแยกทีม + ผู้ชนะเดี่ยว
  EffectResolver.gs       443  attemptKill() คิวการตายลูกโซ่ resolveNight() 11 ขั้น
  RuleEngine.gs          1002  state machine ทั้งหมด (แกนกลางของระบบ)
  GameService.gs          228  สร้าง view model แยกจอผู้ดำเนินเกม/จอสาธารณะ
  Storage.gs              356  บันทึกลง Sheets, snapshot, lock, idempotency, แคช
  Auth.gs                  15  ตรวจ PIN ต่อเกม
  SheetInitializer.gs     119  สร้างชีต ซิงก์แคตตาล็อก โหลดค่าแก้ไข
  Api.gs                  279  API 31 ตัวที่หน้าเว็บเรียกผ่าน google.script.run
  Code.gs                  34  doGet() include() เมนูในสเปรดชีต
  Index.html              229  โครงหน้าจอทั้งหมด
  CSS.html                268  ธีมกลางคืน มือถือ 360px เป็นหลัก
  JavaScript.html        1638  ตรรกะฝั่งหน้าเว็บทั้งหมด
  appsscript.json          15  manifest (V8, Asia/Bangkok)

tests/
  harness.js              160  โหลดโค้ดเข้า vm sandbox + helper เขียนเทสต์
  mock-sheets.js          149  Google Sheets จำลอง นับทุกการเรียก API
  run.js                  968  เทสต์ 77 ข้อ

README.md                 236  คู่มือติดตั้ง deploy และใช้งาน (สำหรับผู้ใช้)
CLAUDE.md                      ไฟล์นี้ (สำหรับ Claude Code)
```

### ชั้นของสถาปัตยกรรม

```
Index/CSS/JavaScript.html   ← หน้าเว็บ (ES5 เท่านั้น)
        ↓ google.script.run
Api.gs                      ← ชั้นเดียวที่หน้าเว็บเรียกได้
        ↓ runCommand()
Storage.gs                  ← lock → idempotency → load → version → mutate → persist
        ↓
RuleEngine / EffectResolver / WinCondition / Validation / RoleCatalog / Utils
        ↑ ตรรกะบริสุทธิ์ ไม่แตะ Apps Script API เลย ← จุดนี้สำคัญมาก
        ↓
GameService.gs              ← แปลง state เป็น view model
```

**ไฟล์ 8 ตัวในกรอบ "ตรรกะบริสุทธิ์" ห้ามเรียก `SpreadsheetApp` / `CacheService` /
`PropertiesService` / `LockService` เด็ดขาด** เพราะชุดทดสอบโหลดไฟล์เหล่านี้เข้า
Node sandbox โดยตรง ถ้าใส่เข้าไปเทสต์จะพังทันที และจะเสียความสามารถในการทดสอบเร็ว

---

## 4. ข้อตกลงในการเขียนโค้ด

### ฝั่งเซิร์ฟเวอร์ (`.gs`)

- ใช้ `var` ล้วน ไม่ใช้ `const` / `let` / arrow function / template literal
- โยน `Error` พร้อมข้อความภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง
- ฟังก์ชันลงท้ายด้วย `_` = ภายในไฟล์ ไม่ใช่ API สาธารณะ
- ทุก mutation ต้องผ่าน `runCommand()` ใน `Storage.gs` ห้ามเขียนชีตตรง ๆ
- คอมเมนต์อธิบาย **"ทำไม"** ไม่ใช่ "ทำอะไร" และเขียนเป็นภาษาอังกฤษ

### ฝั่งหน้าเว็บ

- **ES5 เท่านั้น** — `var` ล้วน ไม่มี arrow function, template literal, `const`, `let`
  (มีสคริปต์ตรวจในข้อ 8 ใช้ตรวจก่อน commit ทุกครั้ง)
- ห้ามใช้ `localStorage` เก็บข้อมูลสำคัญโดยไม่ครอบ `try/catch`
- ห้ามใส่ Game ID หรือ PIN ลงใน URL
- เรียกเซิร์ฟเวอร์ผ่าน `call()` หรือ `google.script.run` พร้อม `withFailureHandler` เสมอ
- ทุกคำสั่งต้องแนบ `expectedVersion` และ `idempotencyKey` ผ่าน helper `cmd()`

### CDN ที่ใช้

Bootstrap 5.3, Bootstrap Icons, SweetAlert2, ฟอนต์ Sarabun + Prompt

---

## 5. แนวคิดหลักของ engine

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
`RuleEngine.buildNightSteps()` (สร้างขั้นตอน), `JavaScript.html` → `targetsUi()` (ปุ่มเลือก)

---

## 6. การตัดสินใจที่ผ่านมา — อย่ารื้อโดยไม่ถาม

### การตีความกติกาที่คลุมเครือ

| จุด | ตีความว่า | ปรับได้ที่ |
|---|---|---|
| Big Bad Wolf | เหยื่อคนที่สองต้องนั่งติดเหยื่อคนแรก และให้เฉพาะเมื่อไม่มีโบนัส Wolf Cub ซ้อน | `requireAdjacentSecond` |
| Hunter | ยิงหลังคิวการตายว่างแล้ว (สถานะ `DEATH_TRIGGER`) ไม่ใช่ยิงกลางคิว **เพื่อกันลูปไม่สิ้นสุด** | `pendingPrompts` |
| Village Idiot | ค่าเริ่มต้นรอดจากการแขวน เปิดเผยตัว แล้วโหวตไม่ได้อีก | `villageIdiotMode` |
| Tanner (คนบ้า) | ชนะเมื่อ**ถูกโหวตแขวนคอ**เท่านั้น และ**เกมจบทันที** | `tannerMode`, `tannerEndsGame` |

### ตัวเลือกที่จงใจถอดออก

- **`minionMode`** — เป็นการตัดสินใจตอนจัดสำรับ ไม่ใช่ตรรกะในเกม
  ถ้าเล่นกติกาให้หมาป่าเลือกสมุนภายหลัง ให้เอาการ์ดออกจากสำรับแล้วแตะไหล่แทน
- **`cupidMode: TAKES_LEFTOVER_ROLE`** — ระบบไม่ได้เก็บข้อมูลการ์ดที่เหลือในกล่อง

**หลักการ**: ถ้าจะเพิ่มตัวเลือกกติกาใหม่ ต้องเขียนโค้ดรองรับ**และ**เทสต์คุมพร้อมกัน
โปรเจกต์นี้เคยมีปุ่ม 8 ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น อย่าให้เกิดซ้ำ

### ค่า Village Impact ยังไม่ยืนยัน ⚠️

ค่า `villageImpact` ทั้ง 46 บทบาท **เป็นค่าประมาณ ไม่ได้ถอดจากการ์ดจริง**
`VILLAGE_IMPACT_VERIFIED = false` และหน้าเว็บขึ้นคำเตือนกำกับตัวเลขสมดุลเสมอ
ผู้ใช้แก้เองได้ที่ชีต `RoleCatalog` แล้วกดปุ่มโหลดใหม่ — **อย่าลบคำเตือนนี้จนกว่าจะได้รับการยืนยัน**

---

## 7. เรื่องประสิทธิภาพ (สำคัญ อ่านก่อนแก้ Storage.gs)

Apps Script ตอบสนองต่อการเรียกหนึ่งครั้งราว 0.6–2 วินาทีเสมอ แก้ที่โค้ดไม่ได้
สิ่งเดียวที่ทำได้คือ **ลดจำนวนครั้งที่แตะ Google Sheets**

### ผลที่วัดได้จริง (คำสั่งธรรมดา 1 ครั้ง โต๊ะ 12 คน)

| ปฏิบัติการ | เดิม | ปัจจุบัน |
|---|---|---|
| `openById()` | 3 | **1** |
| `deleteRow()` ทีละแถว | 12 | **0** |
| อ่านคอลัมน์ทั้งคอลัมน์ | 4 | **1** |
| **รวม** | **28** | **8** |

จอสาธารณะ 1 รอบ poll: 9 → 5

### กติกาที่ต้องรักษาไว้

1. **ห้ามใช้ `deleteRow()` ในลูป** — ใช้ `deleteRows(start, count)` ครั้งเดียว
   (`deleteRow` เป็นการเปลี่ยนโครงสร้างชีต ช้าที่สุดในบรรดาปฏิบัติการทั้งหมด)
2. **ห้ามเรียก `getSpreadsheet()` แล้วคาดว่าจะถูก** — มัน memoize ไว้แล้วใน `_ssHandle`
   ถ้าเปลี่ยน `SPREADSHEET_ID` ต้องเรียก `resetStorageHandles_()`
3. **ตาราง `Players` ไม่ถูกเขียนระหว่างเล่น** — เขียนเฉพาะตอนจบเกมกับตอน
   `apiExportPlayerTable()` เพราะไม่มีโค้ดส่วนไหนอ่านมันเลย
   ถ้าจะเขียนโค้ดที่ **อ่าน** ตารางนี้ ต้องรื้อการตัดสินใจนี้ก่อน
4. **แคตตาล็อกบทบาทแคช 6 ชั่วโมง** ผ่าน `ensureCatalogLoaded_()`
   ใช้ `loadCatalogOverrides()` เมื่อต้องการบังคับอ่านชีตใหม่เท่านั้น
5. **เลขแถวของเกมแคชไว้ใน CacheService** แต่ `_findGameRow()` ตรวจกับชีตก่อนใช้เสมอ
   ถ้าไม่ตรงจะกลับไปสแกนเต็ม — **ห้ามตัดขั้นตอนตรวจสอบนี้ออก** เสี่ยงเขียนทับเกมอื่น

### วิธีวัดผล

`tests/mock-sheets.js` นับทุกการเรียก API ใช้เทียบก่อน/หลังได้จริง
ตัวเลขในตารางข้างบนถูกล็อกเป็นเทสต์แล้ว ถ้าใครเผลอใส่ `deleteRow` กลับเข้าไปเทสต์จะแดงทันที

---

## 8. ชุดทดสอบ

```bash
node tests/run.js        # ต้องได้ ผ่าน 77 / ล้มเหลว 0
```

### หมวดของเทสต์

| หมวด | จำนวน | คุมอะไร |
|---|---|---|
| `unit` | 13 | ฟังก์ชันย่อย ลำดับปลุก การตรวจเป้าหมาย |
| `scenario` | 33 | สถานการณ์เต็มเกมตามสเปกข้อ 15.2 (ข้อ 23 แตกเป็น 3 กรณี) |
| `extra` | 14 | บทบาทชุดขยาย view model กติกาคะแนนเสมอ |
| ตัวเลือกกติกา | 9 | ตัวเลือกทุกตัวที่ปรับได้ต้องมีผลจริง |
| ชั้นจัดเก็บข้อมูล | 8 | บันทึก/อ่าน แคช เวอร์ชัน idempotency **และตัวเลขประสิทธิภาพ** |

### สองโหมดของ harness

```js
const E = H.loadEngine();  // ตรรกะบริสุทธิ์ 8 ไฟล์ เร็วมาก ไม่ต้อง mock
const F = H.loadFull();    // + Auth/Storage/SheetInitializer/Api พร้อม Sheets จำลอง
```

`loadFull()` แถม `F.__env.counts` (นับการเรียก API) และ `F.__env.sheets` (ดูข้อมูลในชีต)

### ตรวจก่อน commit ทุกครั้ง

```bash
# ไวยากรณ์ .gs (node ไม่รู้จักนามสกุล .gs จึงต้องคัดลอกเป็น .js ก่อน)
mkdir -p /tmp/chk && for f in src/*.gs; do cp "$f" "/tmp/chk/$(basename ${f%.gs}).js"; done
for f in /tmp/chk/*.js; do node --check "$f" || echo "ERROR $f"; done

# ไวยากรณ์ + ES5 ฝั่งหน้าเว็บ (ต้องไม่มีผลลัพธ์ออกมา)
sed 's/<script>//;s|</script>||' src/JavaScript.html > /tmp/c.js
node --check /tmp/c.js && grep -nE "=>|\`|\b(const|let) " /tmp/c.js

# การอ้างอิงข้ามไฟล์ (ต้องไม่มีผลลัพธ์ออกมา)
cd src
for f in $(grep -oE 'on(click|input|change)="[a-zA-Z_]+\(' Index.html | sed 's/.*"//;s/(//' | sort -u); do
  grep -q "function $f" JavaScript.html || echo "MISSING FN: $f"; done
for a in $(grep -oE "'api[A-Za-z]+'" JavaScript.html | tr -d "'" | sort -u); do
  grep -q "function $a" Api.gs || echo "MISSING API: $a"; done
for f in $(grep -o "^function api[A-Za-z]*" Api.gs | sed 's/function //'); do
  grep -q "$f" JavaScript.html || echo "UNUSED API: $f"; done
```

---

## 9. งานที่ยังไม่ได้ทำ

### ระยะที่ 2 — ประสิทธิภาพ (ตกลงกันไว้แล้ว ยังไม่ลงมือ)

1. `takeSnapshot()` แปลง state เป็น JSON ซ้ำอีกรอบทั้งที่ `persistGame()` เพิ่งทำไป — ใช้ผลเดิมซ้ำ
2. `trimSnapshots_()` ยังลบทีละแถว → เปลี่ยนเป็น `deleteRows` ช่วงเดียว และตัดแต่งทุก 10 ครั้งพอ
3. เก็บ snapshot ล่าสุดใน CacheService ให้ปุ่มย้อนกลับเร็วขึ้น (ชีตเป็นตัวสำรอง)

### ระยะที่ 3 — ต้องตัดสินใจก่อน

4. `withGameLock()` ใช้ `LockService.getScriptLock()` ซึ่งเป็นล็อกระดับทั้งสคริปต์
   **เปิดเล่นพร้อมกันสองโต๊ะจะบล็อกกันเองแม้เป็นคนละเกม**
   แก้ได้แต่ต้องเขียน mutex ต่อเกมเอง ซึ่งเสี่ยงกว่าเดิม — เจ้าของโปรเจกต์เลือกคงไว้แบบปลอดภัยก่อน

### คำถามที่ต้องยืนยันกับเจ้าของกล่องเกม

1. ค่า Village Impact จริงของทั้ง 46 บทบาท (สำคัญที่สุด)
2. Wolfpack และ Hunting Party ในกล่องมีบทบาทใดบ้าง (ปิดตัวที่ไม่มีด้วยคอลัมน์ `enabled`)
3. Vampire เล่นร่วมกับหมาป่า หรือเล่นแทน (ตอนนี้ `vampireEnabled: false`)
4. การเปิดเผยบทบาทเมื่อตาย ใช้แบบไหน
5. กติกาเมื่อคะแนนเสมอ ใช้แบบไหน
6. แม่มดมีขวดยากี่ขวด ใช้ได้กี่ครั้ง
7. สมุนหมาป่าแจกเป็นการ์ดหรือให้หมาป่าเลือกภายหลัง

---

## 10. คำสั่งที่ใช้บ่อย

```bash
node tests/run.js                 # รันเทสต์ทั้งหมด
```

### ติดตั้งบน Apps Script

1. สร้างโปรเจกต์ที่ script.google.com วางไฟล์ `.gs` 13 ไฟล์
   + HTML 3 ไฟล์ (ตั้งชื่อ `Index`, `CSS`, `JavaScript` — ห้ามใส่นามสกุล)
   + เปิด manifest ใน Project Settings แล้ววาง `appsscript.json`
2. รันฟังก์ชัน `createSpreadsheetAndBind` หนึ่งครั้ง
   (สร้างสเปรดชีต ตั้ง `SPREADSHEET_ID` สร้างแท็บทั้ง 6 ให้เอง)
3. Deploy → New deployment → Web app → Execute as **Me** / Access **Anyone**

**ระหว่างพัฒนา** ใช้ Deploy → Test deployments (สะท้อนโค้ดล่าสุดทันที)
**rollback**: Manage deployments → ดินสอ → เลือก Version เดิม → Deploy

### แท็บในสเปรดชีต

`Games` (state JSON แตกเป็นชิ้นกัน limit 50,000 ตัวอักษร/ช่อง) `Players` (อ่านอย่างเดียว
เขียนตอนจบเกม) `Events` (append-only) `Snapshots` (เก็บ 25 จุดสำหรับ undo)
`RoleCatalog` (**ผู้ใช้แก้เองได้**) `Settings`

### URL

- จอผู้ดำเนินเกม: Web app URL ตรง ๆ (มี PIN 4 หลักต่อเกม)
- จอสาธารณะ: `<URL>?mode=public&g=<GAME_ID>`

---

## 11. สิ่งที่ทำให้โปรเจกต์นี้พังได้ง่ายที่สุด

1. ใส่ `SpreadsheetApp` หรือ service อื่นของ Apps Script ลงในไฟล์ตรรกะบริสุทธิ์ 8 ไฟล์ → เทสต์พังทันที
2. ใช้ arrow function หรือ template literal ในไฟล์ฝั่งหน้าเว็บ → รันบนมือถือบางรุ่นไม่ได้
3. ใส่ `deleteRow()` ในลูปกลับเข้าไป → ช้าลง 2–4 วินาทีต่อคำสั่ง
4. เพิ่มตัวเลือกกติกาแต่ไม่เขียนโค้ดรองรับ → ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น (เคยมี 8 ปุ่ม)
5. ทำให้จอสาธารณะเห็นบทบาทของคนที่ยังมีชีวิต → ทำลายเกมทั้งกระดาน
6. ลบ guard 300 รอบในคิวการตาย → ลูปไม่สิ้นสุด สคริปต์ timeout
7. แก้ลำดับการปลุกด้วยการ hard-code แทนการแก้ `wakePriority`
