/**
 * Auth.gs
 * Per-game moderator PIN. The PIN never appears in a URL or in the public view (spec 13).
 */

function requireModerator(state, pin) {
  if (!pin || String(pin).toUpperCase() !== String(state.moderatorPin).toUpperCase()) {
    throw new Error('PIN ผู้ดำเนินเกมไม่ถูกต้อง');
  }
  return true;
}

function isModerator(state, pin) {
  return !!pin && String(pin).toUpperCase() === String(state.moderatorPin).toUpperCase();
}
