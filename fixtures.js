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

  function byDate(a, b) {
    var da = a.fixture.date ? a.fixture.date.getTime() : Infinity;
    var db = b.fixture.date ? b.fixture.date.getTime() : Infinity;
    return da - db;
  }

  // Competition filter — accepts either the new `competitions` array (multi-
  // select; empty/absent means "all") or the legacy single `competition` string.
  function passesCompetition(f, filters) {
    var list = filters.competitions;
    if ((!list || !list.length) && filters.competition) list = [filters.competition];
    if (!list || !list.length) return true;
    return list.indexOf(f.competition) !== -1;
  }

  function passesCommon(f, filters, today) {
    if (filters.hidepast && today && f.date && f.date < today) return false;
    if (!passesCompetition(f, filters)) return false;
    return true;
  }

  // Games for a player, filtered and sorted by date.
  // filters: { playing, unavailable, hidepast, competitions[] }; today: Date.
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
      if (!passesCommon(f, filters, today)) return;
      games.push({ fixture: f, info: info });
    });
    games.sort(byDate);
    return games;
  }

  // Games for a set of players, merged so each fixture appears once (the
  // "favourites" view). A fixture is included if at least one selected player
  // has a marker there; it counts as playing if any of them is playing. `who`
  // lists the selected players actually playing that fixture.
  function playersGames(model, names, filters, today) {
    filters = filters || {};
    var set = {};
    (names || []).forEach(function (n) { set[n] = true; });
    var selected = model.players.filter(function (p) { return set[p.name]; });
    var games = [];
    model.fixtures.forEach(function (f) {
      if (!passesCommon(f, filters, today)) return;
      var anyMarker = false, whoPlaying = [];
      selected.forEach(function (p) {
        var raw = p.markers[f.col];
        if (raw === undefined || raw === null || raw === '') return;
        anyMarker = true;
        if (markerInfo(raw).playing) whoPlaying.push(p.name);
      });
      if (!anyMarker) return;
      if (whoPlaying.length) {
        if (filters.playing === false) return;
        games.push({ fixture: f, info: { status: 'playing', label: 'Playing', playing: true }, who: whoPlaying });
      } else {
        if (!filters.unavailable) return;
        games.push({ fixture: f, info: { status: 'unavailable', label: 'Not available', playing: false }, who: [] });
      }
    });
    games.sort(byDate);
    return games;
  }

  // Every fixture as a game (no per-player filter) for the "all fixtures" view.
  // Each is treated as playing so it can be counted and exported.
  function allFixtureGames(model, filters, today) {
    filters = filters || {};
    var games = model.fixtures
      .filter(function (f) { return passesCommon(f, filters, today); })
      .map(function (f) {
        return { fixture: f, info: { status: 'playing', label: 'Fixture', playing: true } };
      });
    games.sort(byDate);
    return games;
  }

  // Distinct competition names across all fixtures, sorted alphabetically.
  function competitions(model) {
    var seen = {};
    model.fixtures.forEach(function (f) {
      var c = (f.competition || '').trim();
      if (c) seen[c] = true;
    });
    return Object.keys(seen).sort();
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
    playersGames: playersGames,
    allFixtureGames: allFixtureGames,
    competitions: competitions,
    nextGame: nextGame
  };
});
