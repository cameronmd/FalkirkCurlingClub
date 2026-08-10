/* Falkirk Curling Club — rota parser (pure, no DOM).
 * Works in the browser (window.FCCParser) and Node (module.exports).
 * Expects a SheetJS workbook read with { cellDates: true }.
 */
(function (root, factory) {
  // Prefer a global XLSX (browser CDN). Fall back to an optional require('xlsx')
  // in Node, but don't hard-fail if it's absent — only parseWorkbook needs it,
  // so buildModel/helpers stay usable (and unit-testable) without the library.
  var XLSXlib = (typeof XLSX !== 'undefined') ? XLSX : null;
  if (!XLSXlib && typeof require !== 'undefined') {
    try { XLSXlib = require('xlsx'); } catch (e) { XLSXlib = null; }
  }
  var api = factory(XLSXlib);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FCCParser = api;
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
  'use strict';

  function isDate(v) { return v instanceof Date && !isNaN(v); }

  function extractTime(v) {
    if (isDate(v)) return { h: v.getHours(), m: v.getMinutes() };
    if (typeof v === 'string') {
      var m = v.match(/(\d{1,2})[:.](\d{2})/);
      if (m) return { h: +m[1], m: +m[2] };
    }
    return null;
  }

  function cellStr(v) {
    if (v === null || v === undefined) return '';
    if (isDate(v)) return v.toLocaleDateString();
    return String(v).trim();
  }

  function parseDate(v, yearHint) {
    if (isDate(v)) {
      if (v.getFullYear() > 1901) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
      return null;
    }
    if (typeof v === 'string') {
      var s = v.trim();
      var dm = s.match(/^(\d{1,2})[\/](\d{1,2})(?:[\/](\d{2,4}))?$/);
      if (dm) {
        var day = +dm[1], mon = +dm[2] - 1, yr = dm[3] ? +dm[3] : yearHint;
        if (dm[3] && dm[3].length === 2) yr = 2000 + +dm[3];
        if (yr) return new Date(yr, mon, day);
      }
      var months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      var tm = s.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
      if (tm) {
        var mi = months.indexOf(tm[2].slice(0, 3).toLowerCase());
        if (mi >= 0 && yearHint) return new Date(yearHint, mi, +tm[1]);
      }
    }
    return null;
  }

  function sheetToAoA(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  }

  function findDateRow(aoa) {
    var best = -1, bestCount = 0;
    for (var r = 0; r < Math.min(aoa.length, 14); r++) {
      var row = aoa[r] || [];
      var count = 0;
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        if (isDate(v) && v.getFullYear() > 1901) count++;
        else if (typeof v === 'string' && /^\d{1,2}[\/]\d{1,2}/.test(v.trim())) count++;
      }
      if (count > bestCount) { bestCount = count; best = r; }
    }
    return bestCount >= 3 ? best : -1;
  }

  function buildModel(aoa, dateRow) {
    var timeRow = dateRow + 1, oppRow = dateRow + 2, compRow = dateRow + 3;
    var firstPlayerRow = dateRow + 4, weekRow = dateRow - 1;

    var dateCells = aoa[dateRow] || [];
    var timeCells = aoa[timeRow] || [];
    var oppCells = aoa[oppRow] || [];
    var compCells = aoa[compRow] || [];
    var weekCells = weekRow >= 0 ? (aoa[weekRow] || []) : [];

    var ncols = Math.max(dateCells.length, timeCells.length, oppCells.length, compCells.length);

    var years = {};
    dateCells.forEach(function (v) {
      if (isDate(v) && v.getFullYear() > 1901) years[v.getFullYear()] = (years[v.getFullYear()] || 0) + 1;
    });
    var yearHint = Object.keys(years).sort(function (a, b) { return years[b] - years[a]; })[0];
    yearHint = yearHint ? +yearHint : new Date().getFullYear();

    var fixtures = [];
    var lastWeek = '';
    for (var c = 1; c < ncols; c++) {
      var time = extractTime(timeCells[c]);
      var opp = cellStr(oppCells[c]);
      var comp = cellStr(compCells[c]);
      var hasDate = isDate(dateCells[c]) && dateCells[c].getFullYear() > 1901;
      var isFixture = !!time || (opp && opp !== '-') || (comp && comp !== '-');
      if (!isFixture && !hasDate) continue;
      if (cellStr(weekCells[c])) lastWeek = cellStr(weekCells[c]);
      fixtures.push({
        col: c,
        date: parseDate(dateCells[c], yearHint),
        rawDate: cellStr(dateCells[c]),
        time: time,
        opposition: opp,
        competition: comp,
        week: lastWeek
      });
    }

    var players = [];
    for (var r = firstPlayerRow; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var name = cellStr(row[0]);
      if (!name) break;
      if (/^(key|previous|only if|sub player|grangemouth not)/i.test(name)) break;
      var markers = {};
      fixtures.forEach(function (f) {
        var raw = cellStr(row[f.col]);
        if (raw) markers[f.col] = raw;
      });
      players.push({ name: name, markers: markers });
    }

    if (!fixtures.length) throw new Error('No fixtures found in the grid.');
    if (!players.length) throw new Error('No players found in the grid.');

    var seasonCell = cellStr((aoa[0] || [])[0]) || '';
    return { fixtures: fixtures, players: players, season: seasonCell };
  }

  function parseWorkbook(wb) {
    if (!XLSX || !XLSX.utils) {
      throw new Error('Spreadsheet library (xlsx) is not available.');
    }
    var candidates = [];
    wb.SheetNames.forEach(function (name) {
      var aoa = sheetToAoA(wb.Sheets[name]);
      var dr = findDateRow(aoa);
      if (dr >= 0) candidates.push({ name: name, aoa: aoa, dateRow: dr });
    });
    if (!candidates.length) {
      throw new Error("Couldn't find a fixtures grid in this spreadsheet. Expected a sheet with a row of dates and player names down the left.");
    }
    candidates.sort(function (a, b) {
      return (b.aoa[b.dateRow] || []).length - (a.aoa[a.dateRow] || []).length;
    });
    var chosen = candidates[0];
    var model = buildModel(chosen.aoa, chosen.dateRow);
    model.sheetName = chosen.name;
    return model;
  }

  return {
    parseWorkbook: parseWorkbook,
    buildModel: buildModel,
    findDateRow: findDateRow,
    _helpers: { isDate: isDate, extractTime: extractTime, cellStr: cellStr, parseDate: parseDate }
  };
});
