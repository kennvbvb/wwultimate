/**
 * Validation.gs — pure validators. Every rejection returns a Thai reason
 * so the console can explain why a target cannot be tapped (spec 11.5).
 */

function vFail_(msg) { return { ok: false, reason: msg }; }
var V_OK = { ok: true, reason: '' };

/**
 * Validate a set of target ids for one night step.
 * Returns {ok, reason}.
 */
function validateTargets(state, step, targetIds) {
  targetIds = targetIds || [];
  var min = step.minTargets === undefined ? 1 : step.minTargets;
  var max = step.maxTargets === undefined ? 1 : step.maxTargets;

  if (targetIds.length < min) return vFail_('ต้องเลือกเป้าหมายอย่างน้อย ' + min + ' คน');
  if (targetIds.length > max) return vFail_('เลือกเป้าหมายได้ไม่เกิน ' + max + ' คน');

  var seen = {};
  for (var i = 0; i < targetIds.length; i++) {
    var id = targetIds[i];
    if (seen[id]) return vFail_('เลือกผู้เล่นคนเดิมซ้ำไม่ได้');
    seen[id] = true;
    var p = findPlayer(state, id);
    if (!p) return vFail_('ไม่พบผู้เล่นรหัส ' + id);
    /* DEAD_PLAYER is the only rule that deliberately targets the dead. */
    if (step.targetRule === 'DEAD_PLAYER') {
      if (p.alive) return vFail_(p.name + ' ยังมีชีวิตอยู่ บทบาทนี้ตรวจได้เฉพาะผู้ที่เสียชีวิตแล้ว');
    } else if (!p.alive) {
      return vFail_(p.name + ' เสียชีวิตแล้ว');
    }
  }

  var actor = step.actorIds && step.actorIds.length === 1 ? findPlayer(state, step.actorIds[0]) : null;

  switch (step.targetRule) {
    case 'NONE':
      return V_OK;

    case 'OTHER_ALIVE':
    case 'OPTIONAL_OTHER_ALIVE':
    case 'TWO_OTHER_ALIVE':
      if (actor && uwContains(targetIds, actor.playerId)) {
        return vFail_('บทบาทนี้เลือกตนเองไม่ได้');
      }
      return V_OK;

    case 'OTHER_ALIVE_NO_REPEAT_CONSECUTIVE':
      if (actor && uwContains(targetIds, actor.playerId)) return vFail_('ผู้คุ้มกันป้องกันตนเองไม่ได้');
      if (actor && actor.lastTargetId && uwContains(targetIds, actor.lastTargetId)) {
        var prev = findPlayer(state, actor.lastTargetId);
        return vFail_('คุ้มกัน ' + (prev ? prev.name : 'คนเดิม') + ' สองคืนติดกันไม่ได้');
      }
      return V_OK;

    case 'OTHER_ALIVE_NEVER_REPEATED':
      if (actor && uwContains(targetIds, actor.playerId)) return vFail_('บทบาทนี้เลือกตนเองไม่ได้');
      if (actor) {
        for (var j = 0; j < targetIds.length; j++) {
          if (uwContains(actor.targetsHistory, targetIds[j])) {
            var q = findPlayer(state, targetIds[j]);
            return vFail_('เคยเลือก ' + (q ? q.name : 'คนนี้') + ' ไปแล้ว เลือกซ้ำทั้งเกมไม่ได้');
          }
        }
      }
      return V_OK;

    case 'TWO_ALIVE':
      return V_OK;

    case 'DEAD_PLAYER':
      return V_OK;

    case 'WOLF_VICTIM':
      for (var k = 0; k < targetIds.length; k++) {
        var t = findPlayer(state, targetIds[k]);
        if (isWolfTeam(t)) return vFail_(t.name + ' อยู่ฝ่ายหมาป่า เลือกเป็นเหยื่อไม่ได้');
        if (hasStatus(t, ST.EXILED)) {
          // exile only blocks daytime participation, night attacks still land
        }
      }
      if (targetIds.length === 2 && step.requireAdjacentSecond) {
        var nb = livingNeighbours(state, targetIds[0]);
        var okAdj = (nb.left && nb.left.playerId === targetIds[1]) ||
                    (nb.right && nb.right.playerId === targetIds[1]);
        if (!okAdj) return vFail_('เหยื่อคนที่สองต้องนั่งติดกับเหยื่อคนแรก (พลังจ่าฝูงหมาป่า)');
      }
      return V_OK;

    default:
      return V_OK;
  }
}

/** Setup-time check: role counts vs player count and per-role maxCopies. */
function validateRoleSelection(state) {
  var problems = [];
  var warnings = [];
  var total = 0;
  var counts = {};

  for (var i = 0; i < state.selectedRoles.length; i++) {
    var sel = state.selectedRoles[i];
    var def = getRole(sel.roleId);
    if (sel.count < 0) problems.push('จำนวนการ์ด ' + def.displayNameTh + ' ติดลบ');
    if (sel.count > def.maxCopies) {
      problems.push(def.displayNameTh + ' ใช้ได้ไม่เกิน ' + def.maxCopies + ' ใบ');
    }
    counts[sel.roleId] = sel.count;
    total += sel.count;
  }

  var np = state.players.length;
  if (total !== np) {
    problems.push('จำนวนการ์ด ' + total + ' ใบ ไม่ตรงกับผู้เล่น ' + np + ' คน');
  }

  var wolves = 0;
  for (var rid in counts) {
    if (!counts.hasOwnProperty(rid)) continue;
    if (getRole(rid).baseTeam === TEAM.WEREWOLF && getRole(rid).isWolfPack) wolves += counts[rid];
  }
  if (wolves === 0 && !(counts['vampire'] > 0) && !(counts['cult_leader'] > 0)) {
    problems.push('ต้องมีฝ่ายศัตรูอย่างน้อยหนึ่งฝ่าย (หมาป่า แวมไพร์ หรือลัทธิ)');
  }

  /* dependency / conflict checks (spec 11.3) */
  if (counts['cupid'] > 0 && np < 4) warnings.push('กามเทพควรใช้กับผู้เล่นอย่างน้อย 4 คน');
  if (counts['mason'] === 1) warnings.push('สมาชิกสมาคมลับควรใช้อย่างน้อย 2 ใบ');
  if (counts['apprentice_seer'] > 0 && !counts['seer']) {
    warnings.push('ผู้หยั่งรู้ฝึกหัดจะไม่มีวันได้รับช่วง เพราะไม่มีผู้หยั่งรู้ในเกม');
  }
  if (counts['sorceress'] > 0 && !counts['seer'] && !counts['mystic_seer']) {
    warnings.push('แม่มดฝ่ายหมาป่าไม่มีผู้หยั่งรู้ให้ตามหา');
  }
  if (counts['wolverine'] > 0 && wolves < 2) warnings.push('วูลเวอรีนจะมีความหมายเมื่อมีหมาป่าหลายตัว');
  if (counts['dire_wolf'] > 0 && np < 6) warnings.push('หมาป่าไดร์เหมาะกับผู้เล่นตั้งแต่ 6 คนขึ้นไป');
  if (counts['hoodlum'] > 0 && np < 6) warnings.push('อันธพาลเหมาะกับผู้เล่นตั้งแต่ 6 คนขึ้นไป');
  if (counts['vampire'] > 0 && !state.ruleVariants.vampireEnabled) {
    warnings.push('เลือกแวมไพร์แล้วแต่ยังไม่เปิด vampireEnabled ในตั้งค่ากติกา');
  }
  if (counts['alpha_wolf'] > 0 && wolves < 2) {
    warnings.push('หมาป่าอัลฟาต้องรอให้หมาป่าตัวอื่นตายกลางวันก่อนจึงใช้พลังได้');
  }
  if (counts['doppelganger'] > 0 && np < 5) warnings.push('ดอพเพลแกงเกอร์เหมาะกับผู้เล่นตั้งแต่ 5 คนขึ้นไป');

  return { problems: problems, warnings: warnings, totalCards: total, wolves: wolves };
}

/** Sum of village impact for the selected deck (spec 11.3). */
function villageImpactSummary(state) {
  var sum = 0;
  for (var i = 0; i < state.selectedRoles.length; i++) {
    var s = state.selectedRoles[i];
    sum += getRole(s.roleId).villageImpact * s.count;
  }
  var verdict, tone;
  if (sum > 4) { verdict = 'ฝ่ายหมู่บ้านได้เปรียบมาก'; tone = 'warn'; }
  else if (sum >= 1) { verdict = 'ค่อนข้างสมดุล เอียงมาทางหมู่บ้านเล็กน้อย'; tone = 'ok'; }
  else if (sum >= -4) { verdict = 'ค่อนข้างสมดุล เอียงมาทางหมาป่าเล็กน้อย'; tone = 'ok'; }
  else { verdict = 'ฝ่ายหมาป่าได้เปรียบมาก'; tone = 'warn'; }
  return {
    total: sum, verdict: verdict, tone: tone,
    verified: VILLAGE_IMPACT_VERIFIED,
    note: VILLAGE_IMPACT_VERIFIED ? '' : 'ค่า Village Impact เป็นค่าประมาณ กรุณาแก้ในชีต RoleCatalog ให้ตรงการ์ดจริง'
  };
}

/** Vote legality for constrained roles (Village Idiot / Pacifist). */
function validateVote(state, voterId, choice) {
  var v = mustPlayer(state, voterId);
  if (!v.alive) return vFail_(v.name + ' เสียชีวิตแล้ว โหวตไม่ได้');
  if (hasStatus(v, ST.EXILED)) return vFail_(v.name + ' ถูกส่งออกจากหมู่บ้าน โหวตไม่ได้');
  if (hasStatus(v, ST.CANNOT_VOTE)) return vFail_(v.name + ' เปิดเผยตัวเป็นคนโง่ประจำหมู่บ้านแล้ว โหวตไม่ได้');
  if (v.currentRoleId === 'pacifist' && choice !== 'SPARE') {
    return vFail_('ผู้รักสันติต้องโหวตฝั่ง "ไว้ชีวิต" เสมอ');
  }
  if (v.currentRoleId === 'village_idiot' && choice === 'SPARE') {
    return vFail_('คนโง่ประจำหมู่บ้านต้องโหวตฝั่ง "กำจัด" เสมอ');
  }
  return V_OK;
}
