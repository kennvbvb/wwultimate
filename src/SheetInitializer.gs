/**
 * SheetInitializer.gs
 * Run setupSpreadsheet() once from the Apps Script editor after setting SPREADSHEET_ID.
 */

function setupSpreadsheet() {
  _gamesSheet(); _playersSheet(); _eventsSheet(); _snapshotsSheet();
  _catalogSheet(); _settingsSheet();
  syncRoleCatalogToSheet(false);
  seedSettings_();
  return 'สร้างชีตครบทุกแท็บแล้ว';
}

/**
 * Write the built-in catalog into the RoleCatalog tab.
 * overwrite = true replaces moderator edits; false only adds missing rows.
 */
function syncRoleCatalogToSheet(overwrite) {
  var sh = _catalogSheet();
  var last = sh.getLastRow();
  var existing = {};
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) existing[String(vals[i][0])] = i + 2;
  }
  var list = listRoles();
  var added = 0, updated = 0;
  var newRows = [];
  for (var j = 0; j < list.length; j++) {
    var d = list[j];
    var row = [d.roleId, d.pack, d.displayNameTh, d.displayNameEn, d.baseTeam,
      d.villageImpact, d.maxCopies, d.wakePolicy, d.complexity, true, d.noteTh];
    if (existing[d.roleId]) {
      if (overwrite) { sh.getRange(existing[d.roleId], 1, 1, row.length).setValues([row]); updated++; }
    } else {
      newRows.push(row); added++;
    }
  }
  if (newRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
  return 'เพิ่ม ' + added + ' บทบาท / อัปเดต ' + updated + ' บทบาท (รวมทั้งหมด ' + list.length + ')';
}

/** Read the moderator's corrections straight from the sheet. */
function readCatalogOverrideRows_() {
  var sh = _catalogSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 11).getValues();
  var rows = [];
  for (var i = 0; i < vals.length; i++) {
    rows.push({
      roleId: String(vals[i][0]),
      displayNameTh: vals[i][2],
      villageImpact: vals[i][5],
      maxCopies: vals[i][6],
      enabled: vals[i][9],
      noteTh: vals[i][10]
    });
  }
  return rows;
}

var CATALOG_OVERRIDE_KEY = 'CATOVR:' + APP_VERSION;
var _catalogLoadedThisRun = false;

/**
 * Apply catalog corrections, reading the sheet at most once every six hours.
 * The public display polls every five seconds and used to trigger a full
 * 46-row sheet read each time (perf phase 1, item 3).
 */
function ensureCatalogLoaded_() {
  if (_catalogLoadedThisRun) return 0;
  _catalogLoadedThisRun = true;

  var cache = CacheService.getScriptCache();
  try {
    var hit = cache.get(CATALOG_OVERRIDE_KEY);
    if (hit) return applyCatalogOverrides(JSON.parse(hit));
  } catch (e) { /* fall through to a real read */ }

  var rows = readCatalogOverrideRows_();
  try { cache.put(CATALOG_OVERRIDE_KEY, JSON.stringify(rows), 21600); } catch (e2) {}
  return applyCatalogOverrides(rows);
}

/** Force a re-read of the sheet — used after the moderator edits RoleCatalog. */
function loadCatalogOverrides() {
  try { CacheService.getScriptCache().remove(CATALOG_OVERRIDE_KEY); } catch (e) {}
  var rows = readCatalogOverrideRows_();
  try { CacheService.getScriptCache().put(CATALOG_OVERRIDE_KEY, JSON.stringify(rows), 21600); } catch (e2) {}
  _catalogLoadedThisRun = true;
  return applyCatalogOverrides(rows);
}

function seedSettings_() {
  var sh = _settingsSheet();
  if (sh.getLastRow() >= 2) return;
  sh.getRange(2, 1, 3, 3).setValues([
    ['appVersion', APP_VERSION, 'เวอร์ชันของเว็บแอป'],
    ['villageImpactVerified', 'FALSE', 'ตั้งเป็น TRUE เมื่อแก้ค่า Village Impact ให้ตรงการ์ดจริงแล้ว'],
    ['defaultDeckPacks', 'CORE,WOLFPACK,HUNTING_PARTY', 'ชุดการ์ดที่มีอยู่จริงในกล่อง']
  ]);
}

/** Convenience for a fresh install: creates a spreadsheet and stores its id. */
function createSpreadsheetAndBind() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP.SPREADSHEET_ID)) {
    return 'มี SPREADSHEET_ID อยู่แล้ว: ' + props.getProperty(PROP.SPREADSHEET_ID);
  }
  var ss = SpreadsheetApp.create('Ultimate Werewolf — Moderator Data');
  props.setProperty(PROP.SPREADSHEET_ID, ss.getId());
  props.setProperty(PROP.APP_SECRET, uwRandomId(16));
  resetStorageHandles_();
  setupSpreadsheet();
  return 'สร้างสเปรดชีตแล้ว: ' + ss.getUrl();
}
