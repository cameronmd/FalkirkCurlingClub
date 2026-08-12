/* Falkirk Curling Club — fixture/marker logic (pure, no DOM).
 * Works in the browser (window.FCCFixtures) and Node (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FCCFixtures = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Marker meaning within a fixture column.
  var MARKERS = {
    x: { status: 'playing', label: 'Playing', playing: true },
    sub: { status: 'sub', label: 'Sub (playing)', playing: true },
    'n/a': { status: 'unavailable', label: 'Not available', playing: false },
    na: { status: 'unavailable', label: 'Not available', playing: false },
    d: { status: 'declined', label: 'Declined', playing: false },
    '?': { status: 'awaiting', label: 'Awaiting response', playing: false }
  };

  function markerInfo(raw) {
    if (raw === null || raw === undefined || raw === '') {
      return { status: 'none', label: '', playing: false };
    }
    var key = String(raw).trim().toLowerCase();
    if (MARKERS[key]) return MARKERS[key];
    // Unknown non-empty marker: treat as a note (assume playing).
    return { status: 'other', label: String(raw), playing: true };
  }

  function findPlayer(model, name) {
    for (var i = 0; i < model.players.length; i++) {
      if (model.players[i].name === name) return model.players[i];
    }
    return null;
  }

  // Everyone marked as playing a given fixture column.
  function teammates(model, fixture) {
    return model.players.filter(function (p) {
      return markerInfo(p.markers[fixture.col]).playing;
    }).map(function (p) { return p.name; });
  }

  // Games for a player, filtered and sorted by date.
  // filters: { playing, unavailable, hidepast }; today: Date (start of day).
  function playerGames(model, playerName, filters, today) {
    var p = findPlayer(model, playerName);
    if (!p) return [];
    filters = filters || {};
    var games = [];
    model.fixtures.forEach(function (f) {
      var raw = p.markers[f.col];
      if (raw === undefined || raw === null || raw === '') return;
      var info = markerInfo(raw);
      if (info.playing) {
        if (filters.playing === false) return;
      } else {
        // Any non-playing status (unavailable/declined/awaiting) is gated
        // behind the "unavailable" filter.
        if (!filters.unavailable) return;
      }
      if (filters.hidepast && today && f.date && f.date < today) return;
      games.push({ fixture: f, info: info });
    });
    games.sort(function (a, b) {
      var da = a.fixture.date ? a.fixture.date.getTime() : Infinity;
      var db = b.fixture.date ? b.fixture.date.getTime() : Infinity;
      return da - db;
    });
    return games;
  }

  // Every fixture as a game (no per-player filter) for the "all fixtures" view.
  // Each is treated as playing so it can be counted and exported.
  function allFixtureGames(model, filters, today) {
    filters = filters || {};
    var games = model.fixtures
      .filter(function (f) {
        if (filters.hidepast && today && f.date && f.date < today) return false;
        return true;
      })
      .map(function (f) {
        return { fixture: f, info: { status: 'playing', label: 'Fixture', playing: true } };
      });
    games.sort(function (a, b) {
      var da = a.fixture.date ? a.fixture.date.getTime() : Infinity;
      var db = b.fixture.date ? b.fixture.date.getTime() : Infinity;
      return da - db;
    });
    return games;
  }

  // First upcoming game the player is actually playing (>= today), or null.
  function nextGame(model, playerName, today) {
    var playing = playerGames(model, playerName, { playing: true }, null)
      .filter(function (g) { return g.info.playing && g.fixture.date && (!today || g.fixture.date >= today); });
    return playing.length ? playing[0] : null;
  }

  return {
    MARKERS: MARKERS,
    markerInfo: markerInfo,
    findPlayer: findPlayer,
    teammates: teammates,
    playerGames: playerGames,
    allFixtureGames: allFixtureGames,
    nextGame: nextGame
  };
});
