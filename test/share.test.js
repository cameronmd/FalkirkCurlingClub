'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../share.js');

function makeModel() {
  return {
    season: '2026/27',
    fixtures: [
      { col: 1, date: new Date(2026, 8, 8), rawDate: '', time: { h: 20, m: 30 },
        opposition: 'Dunblane', competition: 'Small Clubs', week: 'Week 1' },
      { col: 2, date: new Date(2026, 8, 9), rawDate: '', time: { h: 18, m: 0 },
        opposition: '-', competition: 'Opening Bonspiel', week: 'Week 1' },
      { col: 3, date: null, rawDate: 'Thur 11 Mar', time: null,
        opposition: 'Torbrex', competition: 'Alex Reid', week: 'Week 28' }
    ],
    players: [
      { name: 'Ferguson I', markers: { 1: 'x', 2: 'x' } },
      { name: 'Cameron', markers: { 2: 'x', 3: 'n/a' } }
    ]
  };
}

test('serialize -> deserialize round-trips the model', () => {
  const m = makeModel();
  const round = S.deserialize(S.serialize(m));
  assert.equal(round.season, '2026/27');
  assert.equal(round.fixtures.length, 3);
  assert.equal(round.players.length, 2);

  const f0 = round.fixtures[0];
  assert.ok(f0.date instanceof Date);
  assert.equal(f0.date.getTime(), new Date(2026, 8, 8).getTime());
  assert.deepEqual(f0.time, { h: 20, m: 30 });
  assert.equal(f0.opposition, 'Dunblane');
  assert.equal(f0.competition, 'Small Clubs');
  assert.equal(f0.week, 'Week 1');

  // Null date preserved as null, rawDate kept
  assert.equal(round.fixtures[2].date, null);
  assert.equal(round.fixtures[2].rawDate, 'Thur 11 Mar');
  assert.equal(round.fixtures[2].time, null);

  // Markers preserved (JSON keys are strings)
  assert.equal(round.players[1].name, 'Cameron');
  assert.equal(round.players[1].markers['2'], 'x');
  assert.equal(round.players[1].markers['3'], 'n/a');
});

test('serialize output is valid compact JSON', () => {
  const str = S.serialize(makeModel());
  const parsed = JSON.parse(str);
  assert.equal(parsed.v, S.VERSION);
  assert.ok(Array.isArray(parsed.f));
  assert.ok(Array.isArray(parsed.p));
});

test('deserialize rejects malformed data', () => {
  assert.throws(() => S.deserialize('{"nope":1}'), /Invalid shared rota/);
  assert.throws(() => S.deserialize('not json'));
});

test('fixturesToText renders a readable list with heading', () => {
  const games = [
    { fixture: makeModel().fixtures[0], info: { playing: true, status: 'playing', label: 'Playing' } },
    { fixture: makeModel().fixtures[1], info: { playing: true, status: 'playing', label: 'Playing' } }
  ];
  const text = S.fixturesToText(games, 'Cameron');
  assert.match(text, /Falkirk Curling — Cameron/);
  assert.match(text, /Tue 8 Sep 8:30pm · Dunblane · \(Small Clubs\)/);
  // opposition "-" falls back to the competition, no duplicate "(...)"
  assert.match(text, /Wed 9 Sep 6pm · Opening Bonspiel/);
  assert.doesNotMatch(text, /Opening Bonspiel · \(Opening Bonspiel\)/);
});

test('fixturesToText shows a status suffix for non-playing games', () => {
  const games = [
    { fixture: makeModel().fixtures[2], info: { playing: false, status: 'unavailable', label: 'Not available' } }
  ];
  const text = S.fixturesToText(games, 'Cameron');
  assert.match(text, /Thur 11 Mar · Torbrex · \(Alex Reid\).*— Not available/);
});

test('fixturesToText handles an empty list', () => {
  const text = S.fixturesToText([], 'All fixtures');
  assert.match(text, /All fixtures/);
  assert.match(text, /No games\./);
});
