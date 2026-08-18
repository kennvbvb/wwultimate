/**
 * Code.gs — entry point. doGet only serves the HTML shell (spec 10).
 */

function doGet(e) {
  var mode = (e && e.parameter && e.parameter.mode) === 'public' ? 'public' : 'moderator';
  var t = HtmlService.createTemplateFromFile('Index');
  t.viewMode = mode;
  t.publicGameId = (e && e.parameter && e.parameter.g) ? String(e.parameter.g) : '';
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/** Menu helper when the script is bound to a spreadsheet. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Werewolf')
      .addItem('สร้าง/ตรวจสอบชีตทั้งหมด', 'setupSpreadsheet')
      .addItem('ซิงก์ RoleCatalog (ไม่ทับของเดิม)', 'menuSyncCatalog_')
      .addToUi();
  } catch (err) { /* not bound to a spreadsheet */ }
}

function menuSyncCatalog_() {
  var msg = syncRoleCatalogToSheet(false);
  SpreadsheetApp.getUi().alert(msg);
}
