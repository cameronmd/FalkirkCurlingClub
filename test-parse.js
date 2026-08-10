/* Headless verification of the parser against the real sample spreadsheet. */
const fs = require('fs');
const XLSX = require('xlsx');
const FCCParser = require('./parser.js');

const buf = fs.readFileSync('./sample.xlsx');
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const model = FCCParser.parseWorkbook(wb);

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ok  ' : ' FAIL ') + name + (extra ? '  -> ' + extra : ''));
  if (!cond) failures++;
}

console.log('Sheet chosen:', model.sheetName, '| season:', model.season);
console.log('Fixtures:', model.fixtures.length, '| Players:', model.players.length, '\n');

check('sheet is "Rota by Player"', model.sheetName === 'Rota by Player');
check('found >= 55 fixtures', model.fixtures.length >= 55, model.fixtures.length);
check('found 20 players', model.players.length === 20, model.players.length);

const names = model.players.map(p => p.name);
check('includes Cameron (Matheson-Dear C)', names.some(n => /Matheson-Dear/i.test(n)));
check('excludes legend rows (no KEY row)', !names.some(n => /^key$/i.test(n)));
check('first player is Alexander B', names[0] === 'Alexander B', names[0]);
check('last player is Welton K', names[names.length - 1] === 'Welton K', names[names.length - 1]);

// Ferguson I should have the most games (28 grand total in sheet). Count 'x' markers.
function countPlaying(p) {
  return Object.values(p.markers).filter(v => String(v).trim().toLowerCase() === 'x').length;
}
const ferg = model.players.find(p => /Ferguson/i.test(p.name));
check('Ferguson I has ~28 games marked x', countPlaying(ferg) >= 26, countPlaying(ferg));

// Cameron played 1 game (C15='x') in the sample.
const cam = model.players.find(p => /Matheson-Dear/i.test(p.name));
check('Cameron has exactly 1 game', countPlaying(cam) === 1, countPlaying(cam));

// Every fixture should have at least one of date/time/opp/comp
const emptyFix = model.fixtures.filter(f => !f.time && !f.opposition && !f.competition && !f.date);
check('no empty fixture columns', emptyFix.length === 0, emptyFix.length + ' empty');

// Fixtures should carry real dates (parsed) for the vast majority
const withDates = model.fixtures.filter(f => f.date instanceof Date).length;
check('>=95% fixtures have a parsed date', withDates / model.fixtures.length >= 0.95,
      withDates + '/' + model.fixtures.length);

// The string-date column "Thur 11 Mar" should be picked up as a fixture
const march11 = model.fixtures.find(f => /11 Mar/i.test(f.rawDate) || (f.date && f.date.getMonth() === 2 && f.date.getDate() === 11));
check('includes the "Thur 11 Mar" Alex Reid fixture', !!march11, march11 && march11.competition);

// Times parsed: a 20:30 evening game
const eve = model.fixtures.find(f => f.time && f.time.h === 20 && f.time.m === 30);
check('parses 20:30 game times', !!eve);

// Print Cameron's actual game(s)
console.log('\nCameron\'s games:');
model.fixtures.forEach(f => {
  const mk = cam.markers[f.col];
  if (mk) {
    const d = f.date ? f.date.toDateString() : f.rawDate;
    console.log('   -', d, f.time ? `${f.time.h}:${String(f.time.m).padStart(2,'0')}` : '', '|', f.opposition, '|', f.competition, '| marker=', mk);
  }
});

// Sample first 3 fixtures
console.log('\nFirst 5 fixtures:');
model.fixtures.slice(0, 5).forEach(f => {
  console.log('   col', f.col, '|', f.date ? f.date.toDateString() : f.rawDate,
    '|', f.time ? `${f.time.h}:${String(f.time.m).padStart(2,'0')}` : 'no time',
    '|', f.opposition || '-', '|', f.competition || '-', '| week:', f.week);
});

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED ✅' : failures + ' CHECK(S) FAILED ❌'));
process.exit(failures === 0 ? 0 : 1);
