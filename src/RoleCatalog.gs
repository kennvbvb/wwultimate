/**
 * RoleCatalog.gs
 * Single source of truth for all 46 roles (Core 34 + Wolfpack 6 + Hunting Party 6).
 *
 * IMPORTANT: villageImpact values below are BALANCE ESTIMATES, not transcriptions of
 * the printed cards. They are mirrored into the RoleCatalog sheet so the moderator can
 * correct them from the physical deck without touching code (spec 1 and 18.2).
 *
 * wakePolicy : NEVER | FIRST_NIGHT_ONLY | EVERY_NIGHT | ONCE_PER_GAME | CONDITIONAL
 * targetRule : NONE | ANY_ALIVE | OTHER_ALIVE | OTHER_ALIVE_NO_REPEAT_CONSECUTIVE |
 *              OTHER_ALIVE_NEVER_REPEATED | TWO_OTHER_ALIVE | TWO_ALIVE |
 *              WOLF_VICTIM | OPTIONAL_OTHER_ALIVE
 */

var VILLAGE_IMPACT_VERIFIED = false;

var ROLE_LIST = [];
var ROLE_INDEX = null;

function defRole_(roleId, pack, th, en, team, impact, o) {
  o = o || {};
  ROLE_LIST.push({
    roleId: roleId,
    pack: pack,
    displayNameTh: th,
    displayNameEn: en,
    baseTeam: team,
    villageImpact: impact,
    wakePriority: o.prio || 999,
    wakePolicy: o.wake || 'NEVER',
    targetRule: o.target || 'NONE',
    activationCondition: o.cond || 'ALIVE',
    charges: o.charges || null,
    effectHandler: o.effect || null,
    winPredicate: o.win || 'VILLAGE_STANDARD',
    maxCopies: o.max === undefined ? 1 : o.max,
    complexity: o.cx || 1,
    isWolfPack: !!o.pack_,           // wakes together with the wolf pack
    seerAppears: o.seer || null,     // what Seer / P.I. reads: WEREWOLF | VILLAGE | null (= use team)
    auraSpecial: o.aura === undefined ? true : o.aura,
    deathTrigger: o.onDeath || null,
    scriptTh: o.script || '',
    noteTh: o.note || '',
    enabled: true
  });
}

/* ------------------------------------------------------------------ *
 * 3.1 CORE DELUXE — 34 roles
 * ------------------------------------------------------------------ */

defRole_('villager', 'CORE', 'ชาวบ้าน', 'Villager', TEAM.VILLAGE, 1, {
  wake: 'NEVER', max: 30, aura: false,
  note: 'ไม่มีพลังพิเศษ ใช้การพูดคุยและการโหวตเท่านั้น'
});

defRole_('seer', 'CORE', 'ผู้หยั่งรู้', 'Seer', TEAM.VILLAGE, 6, {
  wake: 'EVERY_NIGHT', prio: 50, target: 'OTHER_ALIVE', effect: 'seer', cx: 1,
  script: 'ผู้หยั่งรู้ ลืมตา ชี้ผู้เล่นหนึ่งคนที่ต้องการตรวจสอบ',
  note: 'ตอบด้วยการพยักหน้า (เป็นภัยฝ่ายหมาป่า) หรือส่ายหน้า (ไม่เป็นภัย)'
});

defRole_('apprentice_seer', 'CORE', 'ผู้หยั่งรู้ฝึกหัด', 'Apprentice Seer', TEAM.VILLAGE, 4, {
  wake: 'CONDITIONAL', prio: 51, target: 'OTHER_ALIVE', effect: 'seer', cx: 2,
  script: 'ผู้หยั่งรู้ฝึกหัด ลืมตา ตอนนี้ท่านคือผู้หยั่งรู้คนใหม่ ชี้ผู้เล่นที่ต้องการตรวจสอบ',
  note: 'จะตื่นก็ต่อเมื่อผู้หยั่งรู้คนเดิมเสียชีวิตแล้ว ต้องแจ้งอย่างลับในคืนที่รับช่วง'
});

defRole_('aura_seer', 'CORE', 'ผู้มองเห็นออร่า', 'Aura Seer', TEAM.VILLAGE, 4, {
  wake: 'EVERY_NIGHT', prio: 56, target: 'OTHER_ALIVE', effect: 'auraSeer', cx: 2,
  script: 'ผู้มองเห็นออร่า ลืมตา ชี้ผู้เล่นหนึ่งคนเพื่อดูออร่า',
  note: 'ตอบว่าเป้าหมายมีบทบาทพิเศษหรือเป็นเพียงชาวบ้าน/หมาป่าธรรมดา'
});

defRole_('bodyguard', 'CORE', 'ผู้คุ้มกัน', 'Bodyguard', TEAM.VILLAGE, 3, {
  wake: 'EVERY_NIGHT', prio: 22, target: 'OTHER_ALIVE_NO_REPEAT_CONSECUTIVE',
  effect: 'bodyguard', cx: 2,
  script: 'ผู้คุ้มกัน ลืมตา ชี้ผู้เล่นที่ท่านจะคุ้มกันในคืนนี้',
  note: 'ป้องกันตนเองไม่ได้ และห้ามคุ้มกันคนเดิมสองคืนติดกัน'
});

defRole_('cupid', 'CORE', 'กามเทพ', 'Cupid', TEAM.VILLAGE, 2, {
  wake: 'FIRST_NIGHT_ONLY', prio: 4, target: 'TWO_ALIVE', effect: 'cupid', cx: 3,
  script: 'กามเทพ ลืมตา ชี้ผู้เล่นสองคนให้เป็นคู่แท้',
  note: 'คู่แท้ต้องตื่นมารู้จักกัน หากฝ่ายหนึ่งตาย อีกฝ่ายตรอมใจตายตาม'
});

defRole_('diseased', 'CORE', 'ผู้ติดโรค', 'Diseased', TEAM.VILLAGE, 2, {
  wake: 'NEVER', effect: 'diseased', onDeath: 'diseased', cx: 2,
  note: 'ถ้าถูกหมาป่ากิน ฝูงหมาป่าจะกินใครไม่ได้ในคืนถัดไป'
});

defRole_('ghost', 'CORE', 'วิญญาณ', 'Ghost', TEAM.VILLAGE, 2, {
  wake: 'FIRST_NIGHT_ONLY', prio: 80, target: 'NONE', effect: 'ghost', cx: 3,
  script: 'วิญญาณสิ้นใจในคืนแรก',
  note: 'ตายในคืนแรกเสมอ จากนั้นเขียนคำใบ้ได้วันละหนึ่งตัวอักษร'
});

defRole_('hunter', 'CORE', 'นายพราน', 'Hunter', TEAM.VILLAGE, 5, {
  wake: 'NEVER', onDeath: 'hunter', cx: 2,
  note: 'เมื่อเสียชีวิตต้องชี้เป้าทันทีโดยห้ามอภิปราย จะยิงขึ้นฟ้าก็ได้'
});

defRole_('village_idiot', 'CORE', 'คนโง่ประจำหมู่บ้าน', 'Village Idiot', TEAM.VILLAGE, 1, {
  wake: 'NEVER', effect: 'villageIdiot', cx: 2,
  note: 'คะแนนของตนต้องอยู่ฝั่ง "กำจัด" เสมอ และรอดจากการแขวนคอ (ตามตัวเลือกกติกา)'
});

defRole_('lycan', 'CORE', 'ไลแคน', 'Lycan', TEAM.VILLAGE, -1, {
  wake: 'NEVER', seer: 'WEREWOLF', cx: 2,
  note: 'อยู่ฝ่ายหมู่บ้าน แต่เครื่องมือตรวจสอบจะอ่านว่าเป็นหมาป่า'
});

defRole_('mason', 'CORE', 'สมาชิกสมาคมลับ', 'Mason', TEAM.VILLAGE, 2, {
  wake: 'FIRST_NIGHT_ONLY', prio: 3, target: 'NONE', effect: 'mason', max: 4, cx: 1,
  script: 'สมาชิกสมาคมลับ ลืมตา ทำความรู้จักกัน',
  note: 'ควรใช้อย่างน้อยสองใบ Mason ที่ยังมีชีวิตเปิดตาพร้อมกัน'
});

defRole_('mayor', 'CORE', 'นายกเทศมนตรี', 'Mayor', TEAM.VILLAGE, 3, {
  wake: 'NEVER', effect: 'mayor', cx: 1,
  note: 'คะแนนเสียงมีน้ำหนักสองเท่า'
});

defRole_('old_hag', 'CORE', 'หญิงชรา', 'Old Hag', TEAM.VILLAGE, 2, {
  wake: 'EVERY_NIGHT', prio: 72, target: 'OTHER_ALIVE', effect: 'oldHag', cx: 3,
  script: 'หญิงชรา ลืมตา ชี้ผู้เล่นที่จะถูกส่งออกจากหมู่บ้านในวันพรุ่งนี้',
  note: 'ผู้ถูกส่งออกจะพูด โหวต หรือถูกกระทำในตอนกลางวันไม่ได้ แต่ยังมีชีวิต'
});

defRole_('pacifist', 'CORE', 'ผู้รักสันติ', 'Pacifist', TEAM.VILLAGE, 1, {
  wake: 'NEVER', effect: 'pacifist', cx: 1,
  note: 'คะแนนของตนต้องอยู่ฝั่ง "ไว้ชีวิต" เสมอ'
});

defRole_('paranormal_investigator', 'CORE', 'นักสืบเหนือธรรมชาติ', 'Paranormal Investigator', TEAM.VILLAGE, 4, {
  wake: 'ONCE_PER_GAME', prio: 54, target: 'OTHER_ALIVE', effect: 'pi',
  charges: { use: 1 }, cx: 3,
  script: 'นักสืบเหนือธรรมชาติ ลืมตา ชี้ผู้เล่นหนึ่งคน ท่านจะตรวจคนนั้นพร้อมเพื่อนบ้านสองข้าง',
  note: 'ใช้ได้ครั้งเดียวทั้งเกม ตรวจสามคนพร้อมกัน'
});

defRole_('priest', 'CORE', 'นักบวช', 'Priest', TEAM.VILLAGE, 3, {
  wake: 'ONCE_PER_GAME', prio: 20, target: 'OTHER_ALIVE', effect: 'priest',
  charges: { use: 1 }, cx: 2,
  script: 'นักบวช ลืมตา ชี้ผู้เล่นหนึ่งคนที่ท่านจะประทานพร',
  note: 'ผู้ได้รับพรจะรอดจากการพยายามฆ่าครั้งถัดไปหนึ่งครั้ง'
});

defRole_('prince', 'CORE', 'เจ้าชาย', 'Prince', TEAM.VILLAGE, 3, {
  wake: 'NEVER', effect: 'prince', cx: 1,
  note: 'ถูกโหวตแขวนคอครั้งแรกแล้วรอด เปิดเผยตัว และวันนั้นจบทันที'
});

defRole_('spellcaster', 'CORE', 'ผู้ร่ายมนตร์', 'Spellcaster', TEAM.VILLAGE, 2, {
  wake: 'EVERY_NIGHT', prio: 70, target: 'OTHER_ALIVE_NEVER_REPEATED', effect: 'spellcaster', cx: 2,
  script: 'ผู้ร่ายมนตร์ ลืมตา ชี้ผู้เล่นที่จะพูดไม่ได้ในวันพรุ่งนี้',
  note: 'ห้ามสาปคนเดิมซ้ำตลอดทั้งเกม'
});

defRole_('tough_guy', 'CORE', 'คนแกร่ง', 'Tough Guy', TEAM.VILLAGE, 3, {
  wake: 'NEVER', effect: 'toughGuy', cx: 2,
  note: 'ถูกหมาป่าโจมตีแล้วยังไม่ตายทันที แต่จะตายในคืนถัดไป'
});

defRole_('troublemaker', 'CORE', 'ตัวป่วน', 'Troublemaker', TEAM.VILLAGE, 2, {
  wake: 'ONCE_PER_GAME', prio: 76, target: 'NONE', effect: 'troublemaker',
  charges: { use: 1 }, cx: 2,
  script: 'ตัวป่วน ลืมตา ต้องการให้พรุ่งนี้มีการแขวนคอสองครั้งหรือไม่',
  note: 'กติกา Ultimate Werewolf (ไม่ใช่ One Night) — ทำให้วันถัดไปแขวนคอได้สองครั้ง'
});

defRole_('witch', 'CORE', 'แม่มด', 'Witch', TEAM.VILLAGE, 5, {
  wake: 'EVERY_NIGHT', prio: 40, target: 'OPTIONAL_OTHER_ALIVE', effect: 'witch',
  charges: { heal: 1, kill: 1 }, cx: 3,
  script: 'แม่มด ลืมตา นี่คือผู้ที่กำลังจะตาย ท่านจะใช้ยาชุบชีวิตหรือยาพิษหรือไม่',
  note: 'ยาชุบชีวิตหนึ่งครั้ง ยาพิษหนึ่งครั้ง ใช้พร้อมกันในคืนเดียวได้'
});

defRole_('werewolf', 'CORE', 'มนุษย์หมาป่า', 'Werewolf', TEAM.WEREWOLF, -6, {
  wake: 'EVERY_NIGHT', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'WEREWOLF_STANDARD', max: 10, pack_: true, seer: 'WEREWOLF', aura: false, cx: 1,
  script: 'ฝูงหมาป่า ลืมตา ทำความรู้จักกัน แล้วตกลงเลือกเหยื่อหนึ่งคน',
  note: 'ตื่นพร้อมกันทุกคืนและเลือกเหยื่อร่วมกัน'
});

defRole_('wolf_cub', 'CORE', 'ลูกหมาป่า', 'Wolf Cub', TEAM.WEREWOLF, -8, {
  wake: 'EVERY_NIGHT', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF', onDeath: 'wolfCub', cx: 2,
  script: '', note: 'หากลูกหมาป่าตาย ฝูงหมาป่าจะฆ่าได้สองเป้าหมายในคืนถัดไป'
});

defRole_('sorceress', 'CORE', 'แม่มดฝ่ายหมาป่า', 'Sorceress', TEAM.WEREWOLF, -4, {
  wake: 'EVERY_NIGHT', prio: 58, target: 'OTHER_ALIVE', effect: 'sorceress',
  win: 'WEREWOLF_STANDARD', seer: 'VILLAGE', cx: 3,
  script: 'แม่มดฝ่ายหมาป่า ลืมตา ชี้ผู้เล่นที่ท่านสงสัยว่าเป็นผู้หยั่งรู้',
  note: 'อยู่ฝ่ายหมาป่าแต่เครื่องมือตรวจสอบอ่านว่าเป็นฝ่ายหมู่บ้าน ไม่ตื่นกับฝูง'
});

defRole_('minion', 'CORE', 'สมุนหมาป่า', 'Minion', TEAM.WEREWOLF, -3, {
  wake: 'FIRST_NIGHT_ONLY', prio: 9, target: 'NONE', effect: 'minion',
  win: 'WEREWOLF_STANDARD', seer: 'WEREWOLF', cx: 2,
  script: 'สมุนหมาป่า ลืมตา ฝูงหมาป่าจงยกนิ้วให้สมุนได้เห็น',
  note: 'รู้ว่าใครเป็นหมาป่า แต่หมาป่าไม่รู้จักสมุน — ถ้ากติกาบ้านให้หมาป่าเลือกสมุนภายหลัง ให้เอาการ์ดนี้ออกจากสำรับแล้วผู้ดำเนินเกมแตะไหล่แทน'
});

defRole_('lone_wolf', 'CORE', 'หมาป่าเดียวดาย', 'Lone Wolf', TEAM.WEREWOLF, -5, {
  wake: 'EVERY_NIGHT', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'LONE_WOLF', pack_: true, seer: 'WEREWOLF', cx: 3,
  script: '', note: 'ตื่นกับฝูง แต่ชนะเฉพาะเมื่อเป็นผู้รอดชีวิตคนสุดท้ายหรือถึง parity เพียงลำพัง'
});

defRole_('cursed', 'CORE', 'ผู้ถูกสาป', 'Cursed', TEAM.VILLAGE, -2, {
  wake: 'NEVER', effect: 'cursed', cx: 2,
  note: 'เริ่มเป็นฝ่ายหมู่บ้าน เมื่อถูกหมาป่าโจมตีครั้งแรกจะกลายเป็นหมาป่าแทนการตาย'
});

defRole_('doppelganger', 'CORE', 'ดอพเพลแกงเกอร์', 'Doppelgänger', TEAM.VILLAGE, 0, {
  wake: 'FIRST_NIGHT_ONLY', prio: 2, target: 'OTHER_ALIVE', effect: 'doppelganger', cx: 3,
  script: 'ดอพเพลแกงเกอร์ ลืมตา ชี้ผู้เล่นหนึ่งคนเป็นต้นแบบ',
  note: 'กติกา Ultimate Werewolf — รับบทบาทและฝ่ายของต้นแบบในคืนที่ต้นแบบเสียชีวิต'
});

defRole_('drunk', 'CORE', 'คนเมา', 'Drunk', TEAM.VILLAGE, 0, {
  wake: 'CONDITIONAL', prio: 10, target: 'NONE', effect: 'drunk', cx: 3,
  script: 'คนเมา ลืมตา บัดนี้ท่านสร่างเมาแล้ว นี่คือบทบาทที่แท้จริงของท่าน',
  note: 'กติกา Ultimate Werewolf — มีบทจริงซ่อนไว้ ใช้พลังไม่ได้จนถึงคืนที่กำหนด (ค่าเริ่มต้นคืนที่ 3)'
});

defRole_('cult_leader', 'CORE', 'ผู้นำลัทธิ', 'Cult Leader', TEAM.CULT, -3, {
  wake: 'EVERY_NIGHT', prio: 74, target: 'OTHER_ALIVE', effect: 'cultLeader',
  win: 'CULT', cx: 3,
  script: 'ผู้นำลัทธิ ลืมตา ชี้ผู้เล่นที่ท่านต้องการชักชวนเข้าลัทธิ',
  note: 'ชนะเมื่อผู้รอดชีวิตทุกคนเป็นสมาชิกลัทธิ สมาชิกรู้ว่าตนอยู่ในลัทธิแต่ไม่รู้ว่าใครเป็นผู้นำ'
});

defRole_('hoodlum', 'CORE', 'อันธพาล', 'Hoodlum', TEAM.INDEPENDENT, -2, {
  wake: 'FIRST_NIGHT_ONLY', prio: 6, target: 'TWO_OTHER_ALIVE', effect: 'hoodlum',
  win: 'HOODLUM', cx: 3,
  script: 'อันธพาล ลืมตา ชี้ผู้เล่นสองคนที่ท่านต้องการให้ตาย',
  note: 'ชนะเมื่อเกมจบโดยตนยังมีชีวิตและเป้าหมายทั้งสองตายแล้ว'
});

defRole_('tanner', 'CORE', 'คนบ้า', 'Tanner', TEAM.INDEPENDENT, -1, {
  wake: 'NEVER', effect: 'tanner', win: 'TANNER', onDeath: 'tanner', cx: 2,
  note: 'ชนะทันทีเมื่อถูกโหวตแขวนคอ และเกมจบทันที (ปรับได้ที่ตัวเลือกกติกา)'
});

defRole_('vampire', 'CORE', 'แวมไพร์', 'Vampire', TEAM.VAMPIRE, -5, {
  wake: 'EVERY_NIGHT', prio: 34, target: 'OTHER_ALIVE', effect: 'vampire',
  win: 'VAMPIRE', max: 4, cx: 3,
  script: 'แวมไพร์ ลืมตา ชี้เหยื่อของท่าน',
  note: 'เหยื่อจะตายเมื่อมีการเสนอชื่อในวันถัดไป ไม่ใช่ตอนรุ่งเช้า และหมาป่าฆ่าแวมไพร์ไม่ได้'
});

/* ------------------------------------------------------------------ *
 * 3.2 WOLFPACK — 6 roles
 * ------------------------------------------------------------------ */

defRole_('big_bad_wolf', 'WOLFPACK', 'จ่าฝูงหมาป่า', 'Big Bad Wolf', TEAM.WEREWOLF, -8, {
  wake: 'EVERY_NIGHT', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF', cx: 3,
  script: '', note: 'ขณะยังมีชีวิต ฝูงหมาป่าฆ่าเป้าหมายที่นั่งติดกันได้เพิ่มอีกหนึ่งคนตามข้อความบนการ์ด'
});

defRole_('dire_wolf', 'WOLFPACK', 'หมาป่าไดร์', 'Dire Wolf', TEAM.WEREWOLF, -6, {
  wake: 'FIRST_NIGHT_ONLY', prio: 7, target: 'OTHER_ALIVE', effect: 'direWolf',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF', cx: 3,
  script: 'หมาป่าไดร์ ลืมตา ชี้ผู้เล่นหนึ่งคนเป็นคู่หูของท่าน',
  note: 'หากคู่หูตาย หมาป่าไดร์ตายตาม แต่ไม่ย้อนกลับ'
});

defRole_('fruit_brute', 'WOLFPACK', 'หมาป่ามังสวิรัติ', 'Fruit Brute', TEAM.WEREWOLF, -4, {
  wake: 'EVERY_NIGHT', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF', cx: 3,
  script: '', note: 'หากเป็นหมาป่าตัวสุดท้าย ฝูงจะเลือกเหยื่อกลางคืนไม่ได้ ต้องชนะด้วยการโหวต'
});

defRole_('fang_face', 'WOLFPACK', 'หมาป่าเขี้ยวโง้ง', 'Fang Face', TEAM.WEREWOLF, -5, {
  wake: 'CONDITIONAL', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF', cx: 3,
  script: '', note: 'รู้จักฝูงในคืนแรก จากนั้นไม่ตื่นอีกจนกว่าจะเป็นหมาป่าตัวสุดท้าย'
});

defRole_('wolverine', 'WOLFPACK', 'วูลเวอรีน', 'Wolverine', TEAM.WEREWOLF, -6, {
  wake: 'EVERY_NIGHT', prio: 30, target: 'WOLF_VICTIM', effect: 'wolfPack',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF', cx: 3,
  script: '', note: 'หากเป็นหมาป่าที่นั่งใกล้เหยื่อที่สุด ผู้ดำเนินเกมต้องส่งเสียงโลหะเป็นสัญญาณ'
});

defRole_('virginia_woolf', 'WOLFPACK', 'เวอร์จิเนีย วูล์ฟ', 'Virginia Woolf', TEAM.VILLAGE, 0, {
  wake: 'FIRST_NIGHT_ONLY', prio: 8, target: 'OTHER_ALIVE', effect: 'virginiaWoolf',
  onDeath: 'virginiaWoolf', cx: 3,
  script: 'เวอร์จิเนีย วูล์ฟ ลืมตา ชี้ผู้เล่นที่หวาดกลัวท่าน',
  note: 'เมื่อเวอร์จิเนีย วูล์ฟ ตาย ผู้ที่หวาดกลัวเธอจะตายตาม ตรวจฝ่ายจากการ์ดจริงในกล่องของท่าน'
});

/* ------------------------------------------------------------------ *
 * 3.3 HUNTING PARTY — 6 roles
 * ------------------------------------------------------------------ */

defRole_('alpha_wolf', 'HUNTING_PARTY', 'หมาป่าอัลฟา', 'Alpha Wolf', TEAM.WEREWOLF, -7, {
  wake: 'CONDITIONAL', prio: 32, target: 'NONE', effect: 'alphaWolf',
  win: 'WEREWOLF_STANDARD', pack_: true, seer: 'WEREWOLF',
  charges: { use: 1 }, cx: 3,
  script: 'หมาป่าอัลฟา ท่านต้องการเปลี่ยนเหยื่อคืนนี้ให้กลายเป็นหมาป่าแทนการฆ่าหรือไม่',
  note: 'ใช้ได้หนึ่งครั้ง หลังจากมีหมาป่าตัวอื่นตายในตอนกลางวันแล้วเท่านั้น'
});

defRole_('mystic_seer', 'HUNTING_PARTY', 'ผู้หยั่งรู้ลึกลับ', 'Mystic Seer', TEAM.VILLAGE, 7, {
  wake: 'EVERY_NIGHT', prio: 52, target: 'OTHER_ALIVE', effect: 'mysticSeer', cx: 2,
  script: 'ผู้หยั่งรู้ลึกลับ ลืมตา ชี้ผู้เล่นหนึ่งคนเพื่อดูบทบาทที่แท้จริง',
  note: 'เห็นชื่อบทบาทจริง ไม่ใช่แค่ฝ่าย'
});

defRole_('mad_bomber', 'HUNTING_PARTY', 'มือระเบิดคลั่ง', 'Mad Bomber', TEAM.VILLAGE, 3, {
  wake: 'NEVER', onDeath: 'madBomber', cx: 2,
  note: 'เมื่อตาย ผู้เล่นที่ยังมีชีวิตซึ่งนั่งใกล้ที่สุดทั้งซ้ายและขวาจะตายตาม'
});

defRole_('revealer', 'HUNTING_PARTY', 'ผู้เปิดโปง', 'Revealer', TEAM.VILLAGE, 4, {
  wake: 'EVERY_NIGHT', prio: 62, target: 'OPTIONAL_OTHER_ALIVE', effect: 'revealer', cx: 3,
  script: 'ผู้เปิดโปง ลืมตา ชี้ผู้เล่นที่ท่านต้องการเปิดโปง หรือส่ายหน้าเพื่อข้าม',
  note: 'ถ้าเป้าหมายเป็นหมาป่า เป้าหมายตาย ถ้าไม่ใช่ ผู้เปิดโปงตายเอง'
});

defRole_('huntress', 'HUNTING_PARTY', 'นักล่าหญิง', 'Huntress', TEAM.VILLAGE, 4, {
  wake: 'EVERY_NIGHT', prio: 60, target: 'OPTIONAL_OTHER_ALIVE', effect: 'huntress',
  charges: { kill: 1 }, cx: 2,
  script: 'นักล่าหญิง ลืมตา ท่านต้องการสังหารใครในคืนนี้หรือไม่',
  note: 'สังหารได้หนึ่งครั้งต่อเกม'
});

defRole_('mentalist', 'HUNTING_PARTY', 'นักอ่านใจ', 'Mentalist', TEAM.VILLAGE, 4, {
  wake: 'EVERY_NIGHT', prio: 64, target: 'TWO_OTHER_ALIVE', effect: 'mentalist', cx: 2,
  script: 'นักอ่านใจ ลืมตา ชี้ผู้เล่นสองคน',
  note: 'ตอบว่าทั้งสองคนอยู่ทีมเดียวกันหรือไม่'
});

/* ------------------------------------------------------------------ *
 * Catalog accessors
 * ------------------------------------------------------------------ */

function buildRoleIndex_() {
  var idx = {};
  for (var i = 0; i < ROLE_LIST.length; i++) idx[ROLE_LIST[i].roleId] = ROLE_LIST[i];
  return idx;
}

/** Returns the role definition or throws. */
function getRole(roleId) {
  if (!ROLE_INDEX) ROLE_INDEX = buildRoleIndex_();
  var r = ROLE_INDEX[roleId];
  if (!r) throw new Error('ไม่พบบทบาท: ' + roleId);
  return r;
}

function hasRoleDef(roleId) {
  if (!ROLE_INDEX) ROLE_INDEX = buildRoleIndex_();
  return !!ROLE_INDEX[roleId];
}

/** All roles, optionally filtered by pack. */
function listRoles(pack) {
  if (!pack) return ROLE_LIST.slice();
  var out = [];
  for (var i = 0; i < ROLE_LIST.length; i++) if (ROLE_LIST[i].pack === pack) out.push(ROLE_LIST[i]);
  return out;
}

function roleDisplay(roleId) {
  return hasRoleDef(roleId) ? getRole(roleId).displayNameTh : roleId;
}

/** Overlay moderator corrections coming from the RoleCatalog sheet. */
function applyCatalogOverrides(rows) {
  if (!rows || !rows.length) return 0;
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || !row.roleId || !hasRoleDef(row.roleId)) continue;
    var def = getRole(row.roleId);
    if (row.displayNameTh) { def.displayNameTh = String(row.displayNameTh); n++; }
    if (row.villageImpact !== '' && row.villageImpact !== null && row.villageImpact !== undefined) {
      def.villageImpact = Number(row.villageImpact); n++;
    }
    if (row.maxCopies !== '' && row.maxCopies !== null && row.maxCopies !== undefined) {
      def.maxCopies = Number(row.maxCopies); n++;
    }
    if (row.enabled !== '' && row.enabled !== null && row.enabled !== undefined) {
      def.enabled = (row.enabled === true || String(row.enabled).toUpperCase() === 'TRUE');
      n++;
    }
    if (row.noteTh) { def.noteTh = String(row.noteTh); n++; }
  }
  return n;
}
