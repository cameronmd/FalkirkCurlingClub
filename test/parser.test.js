'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../parser.js');

const { isDate, extractTime, cellStr, parseDate } = parser._helpers;

// A synthetic "Rota by Player" grid mirroring the real spreadsheet layout:
// row0 = season/week labels, row1 = dates, row2 = times, row3 = opposition,
// row4 = competition, row5+ = players. Column 0 is the player-name column.
function sampleAoA() {
  const D = (y, m, d) => new Date(y, m - 1, d);
  const T = (h, m) => new Date(1899, 11, 31, h, m); // Excel time-only epoch
  return [
    // 0: labels + summary headers (col 7-9 are non-fixture summary columns)
    ['2026/27', 'Week 1', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'HOL', 'Games', 'SUB', 'TOTAL'],
    // 1: dates  (col 6 = spacer with no date; col 7-9 = summary, no dates)
    [null, D(2026, 9, 8), D(2026, 9, 9), D(2026, 9, 14), 'Thur 11 Mar', D(2026, 10, 6), null, null, null, null],
    // 2: times
    [null, T(20, 30), T(18, 0), T(20, 30), T(17, 30), T(12, 30), null, null, null, null],
    // 3: opposition
    [null, 'Dunblane', '-', 'A Vs B', 'Torbrex', 'Grangemouth', null, null, null, null],
    // 4: competition
    [null, 'Small Clubs', 'Opening Bonspiel', 'League', 'Alex Reid', 'Small Clubs', null, null, null, null],
    // 5+: players
    ['Ferguson I', 'x', 'x', 'x', 'x', 'x', 'L', 15, 0, 15],
    ['Matheson-Dear C', null, 'x', null, null, null, 'B', 1, 0, 1],
    ['Gray A', 'x', null, 'n/a', 'x', null, 'I', 8, 0, 8],
    ['Welton K', 'x', 'x', null, '?', 'd', 'D', 10, 0, 10],
    // legend / trailing rows (must be excluded)
    [null, null, null, null, null, null, null, null, null, null],
    ['KEY', null, null, null, null, null, null, null, null, null],
    ['x', 'played in game', null, null, null, null, null, null, null, null]
  ];
}

test('helpers: isDate distinguishes real dates', () => {
  assert.equal(isDate(new Date(2026, 0, 1)), true);
  assert.equal(isDate(new Date('nope')), false);
  assert.equal(isDate('2026'), false);
  assert.equal(isDate(null), false);
});

test('helpers: extractTime from Date and string', () => {
  assert.deepEqual(extractTime(new Date(1899, 11, 31, 20, 30)), { h: 20, m: 30 });
  assert.deepEqual(extractTime('8:00'), { h: 8, m: 0 });
  assert.deepEqual(extractTime('17.30'), { h: 17, m: 30 });
  assert.equal(extractTime('nope'), null);
  assert.equal(extractTime(null), null);
});

test('helpers: cellStr trims and stringifies', () => {
  assert.equal(cellStr('  hi  '), 'hi');
  assert.equal(cellStr(2011), '2011');
  assert.equal(cellStr(null), '');
  assert.equal(cellStr(undefined), '');
});

test('helpers: parseDate handles real Dates, dd/mm, and "11 Mar" with year hint', () => {
  const d = parseDate(new Date(2026, 8, 8), 2026);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 8);

  const dm = parseDate('23/10', 2026);
  assert.equal(dm.getMonth(), 9);
  assert.equal(dm.getDate(), 23);

  const named = parseDate('Thur 11 Mar', 2027);
  assert.equal(named.getFullYear(), 2027);
  assert.equal(named.getMonth(), 2);
  assert.equal(named.getDate(), 11);

  // Excel time-only epoch dates are not real fixture dates
  assert.equal(parseDate(new Date(1899, 11, 31, 20, 30), 2026), null);
});

test('findDateRow locates the date header row', () => {
  const aoa = sampleAoA();
  assert.equal(parser.findDateRow(aoa), 1);
});

test('buildModel: extracts the right fixtures and excludes summary/spacer columns', () => {
  const model = parser.buildModel(sampleAoA(), 1);
  // 5 real fixtures (cols 1-5); col 6 spacer + 7-9 summary excluded
  assert.equal(model.fixtures.length, 5);
  assert.deepEqual(model.fixtures.map(f => f.col), [1, 2, 3, 4, 5]);
});

test('buildModel: parses dates (incl. string date) and times', () => {
  const model = parser.buildModel(sampleAoA(), 1);
  const byCol = Object.fromEntries(model.fixtures.map(f => [f.col, f]));
  assert.equal(byCol[1].date.getMonth(), 8); // Sept
  assert.deepEqual(byCol[1].time, { h: 20, m: 30 });
  // String date "Thur 11 Mar" resolved using the season's year hint (2026)
  assert.equal(byCol[4].date.getMonth(), 2);
  assert.equal(byCol[4].date.getDate(), 11);
  assert.deepEqual(byCol[4].time, { h: 17, m: 30 });
});

test('buildModel: reads opposition and competition', () => {
  const model = parser.buildModel(sampleAoA(), 1);
  const f1 = model.fixtures[0];
  assert.equal(f1.opposition, 'Dunblane');
  assert.equal(f1.competition, 'Small Clubs');
});

test('buildModel: players stop at the legend, markers captured', () => {
  const model = parser.buildModel(sampleAoA(), 1);
  const names = model.players.map(p => p.name);
  assert.deepEqual(names, ['Ferguson I', 'Matheson-Dear C', 'Gray A', 'Welton K']);
  assert.ok(!names.includes('KEY'));
  assert.ok(!names.includes('x'));

  const cam = model.players.find(p => p.name === 'Matheson-Dear C');
  // Cameron only marked column 2
  assert.equal(cam.markers[2], 'x');
  assert.equal(cam.markers[1], undefined);
});

test('buildModel: season captured from A1', () => {
  const model = parser.buildModel(sampleAoA(), 1);
  assert.equal(model.season, '2026/27');
});

test('buildModel: throws when there are no players', () => {
  const aoa = sampleAoA().slice(0, 5); // header rows only
  assert.throws(() => parser.buildModel(aoa, 1), /No players/);
});
