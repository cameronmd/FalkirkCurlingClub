'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fixtures.js');

function makeModel() {
  const fx = (col, y, m, d, h, mi, opp, comp) => ({
    col, date: (y ? new Date(y, m - 1, d) : null),
    time: (h != null ? { h, m: mi } : null),
    opposition: opp, competition: comp, week: 'Week ' + col
  });
  return {
    fixtures: [
      fx(1, 2026, 9, 8, 20, 30, 'Dunblane', 'Small Clubs'),   // past-ish/future depending on today
      fx(2, 2026, 9, 9, 18, 0, '-', 'Opening Bonspiel'),
      fx(3, 2026, 9, 14, 20, 30, 'A Vs B', 'League'),
      fx(4, 2026, 9, 6, 20, 30, 'NoTime', 'League')            // earlier date, for sort test
    ],
    players: [
      { name: 'Ferguson I', markers: { 1: 'x', 2: 'x', 3: 'x' } },
      { name: 'Cameron', markers: { 2: 'x', 3: 'n/a' } },
      { name: 'Gray A', markers: { 1: 'x', 4: 'x' } }
    ]
  };
}

test('markerInfo maps known markers', () => {
  assert.equal(F.markerInfo('x').playing, true);
  assert.equal(F.markerInfo('X').status, 'playing');
  assert.equal(F.markerInfo('n/a').playing, false);
  assert.equal(F.markerInfo('n/a').status, 'unavailable');
  assert.equal(F.markerInfo('d').status, 'declined');
  assert.equal(F.markerInfo('?').status, 'awaiting');
  assert.equal(F.markerInfo('sub').playing, true);
});

test('markerInfo: empty is "none", unknown is "other" (assumed playing)', () => {
  assert.equal(F.markerInfo('').status, 'none');
  assert.equal(F.markerInfo(null).status, 'none');
  const other = F.markerInfo('SUB?');
  assert.equal(other.status, 'other');
  assert.equal(other.playing, true);
  assert.equal(other.label, 'SUB?');
});

test('findPlayer returns the player or null', () => {
  const m = makeModel();
  assert.equal(F.findPlayer(m, 'Cameron').name, 'Cameron');
  assert.equal(F.findPlayer(m, 'Nobody'), null);
});

test('teammates lists everyone playing a fixture column', () => {
  const m = makeModel();
  // Column 1: Ferguson (x) and Gray (x) play; Cameron has no marker
  assert.deepEqual(F.teammates(m, m.fixtures[0]).sort(), ['Ferguson I', 'Gray A']);
  // Column 2: Ferguson + Cameron
  assert.deepEqual(F.teammates(m, m.fixtures[1]).sort(), ['Cameron', 'Ferguson I']);
});

test('playerGames returns only playing games by default, sorted by date', () => {
  const m = makeModel();
  const games = F.playerGames(m, 'Ferguson I', { playing: true }, null);
  assert.equal(games.length, 3);
  const cols = games.map(g => g.fixture.col);
  // col4 (Sep 6) sorts before col1 (Sep 8) before col3 (Sep 14); Ferguson doesn't play col4
  assert.deepEqual(cols, [1, 2, 3]);
  assert.ok(games.every(g => g.info.playing));
});

test('playerGames hides non-playing unless the unavailable filter is on', () => {
  const m = makeModel();
  const hidden = F.playerGames(m, 'Cameron', { playing: true, unavailable: false }, null);
  assert.deepEqual(hidden.map(g => g.fixture.col), [2]); // only the x game

  const shown = F.playerGames(m, 'Cameron', { playing: true, unavailable: true }, null);
  const statuses = shown.map(g => g.info.status).sort();
  assert.deepEqual(shown.map(g => g.fixture.col).sort(), [2, 3]);
  assert.ok(statuses.includes('unavailable'));
});

test('playerGames: playing:false hides the playing games', () => {
  const m = makeModel();
  const games = F.playerGames(m, 'Cameron', { playing: false, unavailable: true }, null);
  assert.deepEqual(games.map(g => g.fixture.col), [3]); // only the n/a one
});

test('playerGames: hidepast drops games before "today"', () => {
  const m = makeModel();
  const today = new Date(2026, 8, 10); // Sep 10 2026
  const games = F.playerGames(m, 'Ferguson I', { playing: true, hidepast: true }, today);
  // col1 (Sep 8) and col2 (Sep 9) are in the past; only col3 (Sep 14) remains
  assert.deepEqual(games.map(g => g.fixture.col), [3]);
});

test('playerGames: unknown player yields no games', () => {
  assert.deepEqual(F.playerGames(makeModel(), 'Ghost', {}, null), []);
});

test('allFixtureGames returns every fixture, marked playing, sorted by date', () => {
  const m = makeModel();
  const games = F.allFixtureGames(m, {}, null);
  assert.equal(games.length, m.fixtures.length);
  assert.ok(games.every(g => g.info.playing));
  const cols = games.map(g => g.fixture.col);
  // col4 (Sep 6) sorts first, then col1 (Sep 8), col2 (Sep 9), col3 (Sep 14)
  assert.deepEqual(cols, [4, 1, 2, 3]);
});

test('competitions lists distinct names sorted', () => {
  const m = makeModel();
  assert.deepEqual(F.competitions(m), ['League', 'Opening Bonspiel', 'Small Clubs']);
});

test('playerGames filters by competition', () => {
  const m = makeModel();
  // Ferguson plays cols 1 (Small Clubs), 2 (Opening Bonspiel), 3 (League)
  const league = F.playerGames(m, 'Ferguson I', { playing: true, competition: 'League' }, null);
  assert.deepEqual(league.map(g => g.fixture.col), [3]);
  const none = F.playerGames(m, 'Ferguson I', { playing: true, competition: 'Nope' }, null);
  assert.equal(none.length, 0);
});

test('allFixtureGames filters by competition', () => {
  const m = makeModel();
  // cols 3 and 4 are both "League"; sorted by date col4 (Sep 6) precedes col3 (Sep 14)
  const league = F.allFixtureGames(m, { competition: 'League' }, null);
  assert.deepEqual(league.map(g => g.fixture.col), [4, 3]);
});

test('allFixtureGames respects hidepast', () => {
  const m = makeModel();
  const today = new Date(2026, 8, 10);
  const games = F.allFixtureGames(m, { hidepast: true }, today);
  assert.deepEqual(games.map(g => g.fixture.col), [3]); // only Sep 14 survives
});

test('playerGames filters by competitions array (multi-select)', () => {
  const m = makeModel();
  // Ferguson plays cols 1 (Small Clubs), 2 (Opening Bonspiel), 3 (League)
  const two = F.playerGames(m, 'Ferguson I', { playing: true, competitions: ['League', 'Small Clubs'] }, null);
  assert.deepEqual(two.map(g => g.fixture.col).sort(), [1, 3]);
  // Empty array means "all"
  const all = F.playerGames(m, 'Ferguson I', { playing: true, competitions: [] }, null);
  assert.deepEqual(all.map(g => g.fixture.col).sort(), [1, 2, 3]);
});

test('allFixtureGames filters by competitions array', () => {
  const m = makeModel();
  const games = F.allFixtureGames(m, { competitions: ['Small Clubs', 'Opening Bonspiel'] }, null);
  assert.deepEqual(games.map(g => g.fixture.col).sort(), [1, 2]);
});

test('playersGames merges games across selected players, once each', () => {
  const m = makeModel();
  // Ferguson: cols 1,2,3 (all x). Gray: cols 1 (x), 4 (x). Union playing = 1,2,3,4.
  const games = F.playersGames(m, ['Ferguson I', 'Gray A'], { playing: true }, null);
  assert.deepEqual(games.map(g => g.fixture.col), [4, 1, 2, 3]); // sorted by date
  assert.ok(games.every(g => g.info.playing));
  // col1 is played by both selected players
  const col1 = games.find(g => g.fixture.col === 1);
  assert.deepEqual(col1.who.sort(), ['Ferguson I', 'Gray A']);
});

test('playersGames: a fixture is "playing" if any selected player plays it', () => {
  const m = makeModel();
  // Cameron: col2 x, col3 n/a. Gray: col4 x. col3 has no playing selected player.
  const playingOnly = F.playersGames(m, ['Cameron', 'Gray A'], { playing: true, unavailable: false }, null);
  // Cameron plays col2; Gray plays cols 1 and 4
  assert.deepEqual(playingOnly.map(g => g.fixture.col).sort(), [1, 2, 4]);
  // With unavailable on, col3 (Cameron n/a) appears as unavailable
  const withNa = F.playersGames(m, ['Cameron', 'Gray A'], { playing: true, unavailable: true }, null);
  const col3 = withNa.find(g => g.fixture.col === 3);
  assert.equal(col3.info.status, 'unavailable');
});

test('playersGames: empty selection yields no games', () => {
  assert.deepEqual(F.playersGames(makeModel(), [], { playing: true }, null), []);
});

test('nextGame returns the first upcoming played game', () => {
  const m = makeModel();
  const today = new Date(2026, 8, 10);
  const ng = F.nextGame(m, 'Ferguson I', today);
  assert.equal(ng.fixture.col, 3);
  assert.equal(F.nextGame(m, 'Ferguson I', new Date(2027, 0, 1)), null);
});
