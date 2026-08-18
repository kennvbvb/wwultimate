/**
 * mock-sheets.js — a small stand-in for the Apps Script services so Storage.gs can
 * be exercised in Node. It also COUNTS every API call, which is how the perf
 * claims in the README are verified rather than guessed at.
 */

function makeEnv(spreadsheetId) {
  const counts = {
    openById: 0, getSheetByName: 0, getLastRow: 0, getValues: 0,
    setValues: 0, appendRow: 0, deleteRow: 0, deleteRows: 0, getValue: 0
  };

  function makeSheet(name, headers) {
    const rows = [headers.slice()];

    function normalise(r) {
      while (rows.length < r) rows.push(new Array(headers.length).fill(''));
    }

    const sheet = {
      _name: name,
      _rows: rows,
      getName() { return name; },
      getLastRow() { counts.getLastRow++; return rows.length; },
      getLastColumn() { return headers.length; },
      appendRow(row) { counts.appendRow++; rows.push(row.slice()); return sheet; },
      deleteRow(r) {
        counts.deleteRow++;
        rows.splice(r - 1, 1);
        return sheet;
      },
      deleteRows(start, howMany) {
        counts.deleteRows++;
        rows.splice(start - 1, howMany);
        return sheet;
      },
      setFrozenRows() { return sheet; },
      clear() { rows.length = 1; return sheet; },
      getRange(r, c, nr, nc) {
        nr = nr === undefined ? 1 : nr;
        nc = nc === undefined ? 1 : nc;
        return {
          getValue() {
            counts.getValue++;
            const row = rows[r - 1];
            return row ? (row[c - 1] === undefined ? '' : row[c - 1]) : '';
          },
          getValues() {
            counts.getValues++;
            const out = [];
            for (let i = 0; i < nr; i++) {
              const src = rows[r - 1 + i] || [];
              const line = [];
              for (let j = 0; j < nc; j++) line.push(src[c - 1 + j] === undefined ? '' : src[c - 1 + j]);
              out.push(line);
            }
            return out;
          },
          setValues(vals) {
            counts.setValues++;
            normalise(r + vals.length - 1);
            for (let i = 0; i < vals.length; i++) {
              const target = rows[r - 1 + i];
              for (let j = 0; j < vals[i].length; j++) target[c - 1 + j] = vals[i][j];
            }
            return this;
          },
          setFontWeight() { return this; },
          setBackground() { return this; },
          setFontColor() { return this; },
          setNumberFormat() { return this; },
          setWrap() { return this; }
        };
      },
      autoResizeColumns() { return sheet; },
      setColumnWidth() { return sheet; }
    };
    return sheet;
  }

  const sheets = {};
  const spreadsheet = {
    getId() { return spreadsheetId; },
    getUrl() { return 'https://example.invalid/' + spreadsheetId; },
    getSheetByName(n) { counts.getSheetByName++; return sheets[n] || null; },
    insertSheet(n) { sheets[n] = makeSheet(n, []); return sheets[n]; },
    getSheets() { return Object.keys(sheets).map(k => sheets[k]); }
  };

  /* insertSheet is called before headers are known, so patch it to accept them later */
  spreadsheet.insertSheet = function (n) {
    const sh = makeSheet(n, []);
    sh.appendRow = function (row) {
      counts.appendRow++;
      if (sh._rows.length === 1 && sh._rows[0].length === 0) sh._rows[0] = row.slice();
      else sh._rows.push(row.slice());
      return sh;
    };
    sheets[n] = sh;
    return sh;
  };

  const props = {};
  props[spreadsheetIdKey()] = spreadsheetId;

  const cacheStore = {};

  return {
    counts,
    sheets,
    cacheStore,
    globals: {
      SpreadsheetApp: {
        openById() { counts.openById++; return spreadsheet; },
        create() { return spreadsheet; }
      },
      PropertiesService: {
        getScriptProperties() {
          return {
            getProperty(k) { return props[k] === undefined ? null : props[k]; },
            setProperty(k, v) { props[k] = v; return this; }
          };
        }
      },
      CacheService: {
        getScriptCache() {
          return {
            get(k) { return cacheStore[k] === undefined ? null : cacheStore[k]; },
            put(k, v) { cacheStore[k] = v; },
            remove(k) { delete cacheStore[k]; }
          };
        }
      },
      LockService: {
        getScriptLock() {
          return { tryLock() { return true; }, releaseLock() {} };
        }
      },
      Utilities: {
        sleep() {},
        formatDate(d) { return String(d); }
      }
    }
  };
}

function spreadsheetIdKey() { return 'SPREADSHEET_ID'; }

module.exports = { makeEnv };
