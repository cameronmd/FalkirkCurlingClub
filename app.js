/* Falkirk Curling Club — My Fixtures (UI glue)
 * Fully client-side. Parsing lives in parser.js, fixture/marker logic in
 * fixtures.js, and calendar (.ics) generation in calendar.js. This file wires
 * those pure modules to the DOM.
 */
(function () {
  'use strict';

  // ---------- Config ----------
  var STORAGE_KEY = 'fcc_rota_v1';
  var PLAYER_KEY = 'fcc_player_v1';
  var SETTINGS_KEY = 'fcc_settings_v1';
  var ALL_PLAYERS = 'ALL';   // legacy sentinel (older stored single-player value)

  // Calendar defaults; overridable via the settings panel (persisted).
  var CAL_DEFAULTS = {
    location: 'The Peak, Stirling',
    locationUrl: 'https://maps.app.goo.gl/J6bCU8uT9ptG5qUh6',
    durationMin: 120,   // every game is assumed 2 hours
    alarmHours: 3
  };

  function cloneSettings(s) {
    return { location: s.location, locationUrl: s.locationUrl, durationMin: s.durationMin, alarmHours: s.alarmHours };
  }

  // ---------- State ----------
  // selection.mode is 'all' (every fixture) or 'players' (selection.names — one or more).
  var state = {
    fixtures: [],   // [{col, date(Date|null), rawDate, time{h,m}|null, opposition, competition, week}]
    players: [],    // [{name, markers: {colIndex: rawMarker}}]
    selection: { mode: 'all', names: [] },
    filters: { playing: true, unavailable: false, hidepast: true, competitions: [] },
    meta: { fileName: '', season: '' },
    settings: cloneSettings(CAL_DEFAULTS)
  };

  function model() { return { fixtures: state.fixtures, players: state.players }; }
  function hasData() { return state.fixtures.length && state.players.length; }
  function isAll() { return state.selection.mode === 'all'; }
  function selectedNames() { return state.selection.names || []; }
  function isMulti() { return !isAll() && selectedNames().length > 1; }
  function headingLabel() {
    if (isAll()) return 'All fixtures';
    var names = selectedNames();
    if (names.length === 1) return names[0];
    if (names.length > 1) return names.length + ' players';
    return 'Fixtures';
  }
  // Keep selected names in the spreadsheet's player order for a stable display.
  function orderNames(names) {
    var order = state.players.map(function (p) { return p.name; });
    return names.slice().sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  }
  function slug(s) {
    return (String(s || 'fixtures').replace(/\W+/g, '-').toLowerCase().replace(/^-+|-+$/g, '')) || 'fixtures';
  }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    uploadSection: $('uploadSection'),
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    parseError: $('parseError'),
    changeFileBtn: $('changeFileBtn'),
    settingsBtn: $('settingsBtn'),
    controlsSection: $('controlsSection'),
    playerSearch: $('playerSearch'),
    playerList: $('playerList'),
    compSearch: $('compSearch'),
    compList: $('compList'),
    filterChips: $('filterChips'),
    summarySection: $('summarySection'),
    spotlightSection: $('spotlightSection'),
    statGames: $('statGames'),
    nextStat: $('nextStat'),
    statNext: $('statNext'),
    addAllBtn: $('addAllBtn'),
    shareBtn: $('shareBtn'),
    gamesSection: $('gamesSection'),
    emptyState: $('emptyState'),
    modal: $('modal'),
    modalTitle: $('modalTitle'),
    modalBody: $('modalBody'),
    settingsModal: $('settingsModal'),
    settingsForm: $('settingsForm'),
    setLocation: $('setLocation'),
    setMapUrl: $('setMapUrl'),
    setDuration: $('setDuration'),
    setReminder: $('setReminder'),
    settingsReset: $('settingsReset'),
    shareModal: $('shareModal'),
    shareLinkBtn: $('shareLinkBtn'),
    shareTextBtn: $('shareTextBtn'),
    shareStatus: $('shareStatus')
  };

  // ============================================================
  //  DISPLAY HELPERS
  // ============================================================

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtTime(t) {
    if (!t) return '';
    var h = t.h, m = t.m;
    var ampm = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ampm;
  }

  function fmtDate(d) {
    if (!d) return '';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function startOfToday() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============================================================
  //  DERIVED DATA (via pure modules)
  // ============================================================

  function currentGames() {
    var today = startOfToday();
    if (isAll()) return FCCFixtures.allFixtureGames(model(), state.filters, today);
    return FCCFixtures.playersGames(model(), selectedNames(), state.filters, today);
  }

  function matesFor(fixture) {
    return FCCFixtures.teammates(model(), fixture);
  }

  // Attach teammates to each game and hand to the calendar module.
  function exportCalendar(games, filename) {
    var withMates = games.map(function (g) {
      return { fixture: g.fixture, info: g.info, mates: matesFor(g.fixture) };
    });
    var ics = FCCCalendar.buildCalendar(withMates, {
      playerName: headingLabel(),
      location: state.settings.location,
      locationUrl: state.settings.locationUrl,
      durationMin: state.settings.durationMin,
      alarmHours: state.settings.alarmHours
    });
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  // ============================================================
  //  PERSISTENCE
  // ============================================================

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fixtures: state.fixtures.map(function (f) {
          return { col: f.col, date: f.date ? f.date.getTime() : null, rawDate: f.rawDate,
                   time: f.time, opposition: f.opposition, competition: f.competition, week: f.week };
        }),
        players: state.players,
        meta: state.meta
      }));
    } catch (e) { /* storage full / disabled — ignore */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var fixtures = data.fixtures.map(function (f) {
        return { col: f.col, date: f.date ? new Date(f.date) : null, rawDate: f.rawDate,
                 time: f.time, opposition: f.opposition, competition: f.competition, week: f.week };
      });
      adopt({ fixtures: fixtures, players: data.players, season: (data.meta && data.meta.season) || '' },
            data.meta || {});
      return hasData();
    } catch (e) { return false; }
  }

  // Take a freshly parsed/loaded model into state and tidy up the selection
  // and competition filter so they only reference things that still exist.
  function adopt(parsed, meta) {
    state.fixtures = parsed.fixtures || [];
    state.players = parsed.players || [];
    state.meta = meta || {};
    reconcileSelection();
    reconcileCompetitions();
  }

  // Drop any selected names that no longer exist; fall back to "all" if empty.
  function reconcileSelection() {
    if (state.selection.mode !== 'players') return;
    var names = selectedNames().filter(function (n) { return FCCFixtures.findPlayer(model(), n); });
    state.selection = names.length ? { mode: 'players', names: orderNames(names) } : { mode: 'all', names: [] };
  }

  // Drop any chosen competitions that no longer exist in this rota.
  function reconcileCompetitions() {
    var comps = FCCFixtures.competitions(model());
    state.filters.competitions = (state.filters.competitions || []).filter(function (c) {
      return comps.indexOf(c) !== -1;
    });
  }

  function saveSelection() {
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify(state.selection)); } catch (e) {}
  }

  // Read the remembered selection, tolerating the older single-name / sentinel format.
  function loadSelection() {
    try {
      var raw = localStorage.getItem(PLAYER_KEY);
      if (!raw) return { mode: 'all', names: [] };
      if (raw === ALL_PLAYERS || raw === 'all' || raw === ' ALL') return { mode: 'all', names: [] };
      if (raw.charAt(0) === '{') {
        var o = JSON.parse(raw);
        if (o && o.mode === 'players' && o.names && o.names.length) return { mode: 'players', names: o.names.slice() };
        return { mode: 'all', names: [] };
      }
      return { mode: 'players', names: [raw] }; // legacy single-name value
    } catch (e) { return { mode: 'all', names: [] }; }
  }

  // Default selection: the remembered player(s) if still present, else "Everyone".
  function applyDefaultSelection() {
    var stored = loadSelection();
    if (stored.mode === 'players') {
      var valid = stored.names.filter(function (n) { return FCCFixtures.findPlayer(model(), n); });
      state.selection = valid.length ? { mode: 'players', names: orderNames(valid) } : { mode: 'all', names: [] };
    } else {
      state.selection = { mode: 'all', names: [] };
    }
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  function render() {
    el.uploadSection.hidden = hasData();
    el.changeFileBtn.hidden = !hasData();
    el.settingsBtn.hidden = !hasData();
    el.controlsSection.hidden = !hasData();
    if (!hasData()) {
      el.summarySection.hidden = true;
      el.spotlightSection.hidden = true;
      el.gamesSection.innerHTML = '';
      return;
    }
    renderPlayerPicker();
    renderCompPicker();
    renderMainView();
  }

  // Everything below the pickers — refreshed on filter/selection changes without
  // rebuilding (or closing) the dropdowns.
  function renderMainView() {
    var games = currentGames();
    el.summarySection.hidden = false;
    renderSummary(games);
    renderSpotlight(games);
    renderGames(games);
  }

  // ----- Player picker (multi-select) -----

  function renderPlayerPicker() {
    if (isAll()) { el.playerSearch.value = 'Everyone — all fixtures'; return; }
    var names = selectedNames();
    if (names.length === 1) el.playerSearch.value = names[0];
    else el.playerSearch.value = names.length <= 2 ? names.join(', ') : (names[0] + ' + ' + (names.length - 1) + ' more');
  }

  function addEveryoneRow() {
    var on = isAll();
    var li = document.createElement('li');
    li.className = 'all-opt' + (on ? ' sel' : '');
    li.tabIndex = 0;
    li.setAttribute('data-all', '1');
    li.innerHTML = '<span class="ti-check">' + (on ? '●' : '') + '</span>' +
      '<span class="ti-label">👥 Everyone — all fixtures</span>';
    li.addEventListener('click', selectEveryone);
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') selectEveryone(); });
    el.playerList.appendChild(li);
  }

  function addPlayerRow(name) {
    var on = !isAll() && selectedNames().indexOf(name) !== -1;
    var li = document.createElement('li');
    li.className = 'player-opt' + (on ? ' sel' : '');
    li.tabIndex = 0;
    li.setAttribute('data-player', name);
    li.innerHTML = '<span class="ti-check">' + (on ? '✓' : '') + '</span>' +
      '<span class="ti-label">' + escapeHtml(name) + '</span>';
    li.addEventListener('click', function () { togglePlayer(name); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') togglePlayer(name); });
    el.playerList.appendChild(li);
  }

  function showPlayerList() {
    el.playerList.innerHTML = '';
    var head = document.createElement('li');
    head.className = 'picker-hint';
    head.innerHTML = '<span>Tap names to add or remove — pick as many as you like.</span>';
    var done = document.createElement('button');
    done.type = 'button'; done.className = 'picker-done'; done.textContent = 'Done';
    done.addEventListener('click', function () { hidePlayerList(); });
    head.appendChild(done);
    el.playerList.appendChild(head);
    addEveryoneRow();
    state.players.map(function (p) { return p.name; }).sort().forEach(function (n) { addPlayerRow(n); });
    el.playerList.hidden = false;
  }

  function hidePlayerList() { el.playerList.hidden = true; }
  function togglePlayerList() { if (el.playerList.hidden) showPlayerList(); else hidePlayerList(); }

  // Update ticks/highlights in place (so an outside-click check stays reliable).
  function updatePlayerTicks() {
    Array.prototype.forEach.call(el.playerList.children, function (li) {
      var check = li.querySelector ? li.querySelector('.ti-check') : null;
      if (li.getAttribute && li.getAttribute('data-all') != null) {
        var onAll = isAll();
        li.classList.toggle('sel', onAll);
        if (check) check.textContent = onAll ? '●' : '';
      } else if (li.getAttribute && li.getAttribute('data-player') != null) {
        var onP = !isAll() && selectedNames().indexOf(li.getAttribute('data-player')) !== -1;
        li.classList.toggle('sel', onP);
        if (check) check.textContent = onP ? '✓' : '';
      }
    });
  }

  function selectEveryone() {
    state.selection = { mode: 'all', names: [] };
    saveSelection();
    hidePlayerList();
    render();
  }

  // Toggle a player in/out, keeping the dropdown open for multi-picking.
  // Clearing the last one falls back to "Everyone".
  function togglePlayer(name) {
    var names = isAll() ? [] : selectedNames().slice();
    var i = names.indexOf(name);
    if (i === -1) names.push(name); else names.splice(i, 1);
    state.selection = names.length ? { mode: 'players', names: orderNames(names) } : { mode: 'all', names: [] };
    saveSelection();
    updatePlayerTicks();   // refresh ticks in place (list stays open)
    renderPlayerPicker();  // refresh the input label
    renderMainView();      // refresh games/summary/spotlight
  }

  // ----- Competition picker (multi-select filter) -----

  function selectedComps() { return state.filters.competitions || []; }
  function isAllComps() { return selectedComps().length === 0; }

  function renderCompPicker() {
    var comps = selectedComps();
    if (!comps.length) { el.compSearch.value = 'All competitions'; return; }
    el.compSearch.value = comps.length <= 2 ? comps.join(', ') : (comps[0] + ' + ' + (comps.length - 1) + ' more');
  }

  function addAllCompsRow() {
    var on = isAllComps();
    var li = document.createElement('li');
    li.className = 'all-opt' + (on ? ' sel' : '');
    li.tabIndex = 0;
    li.setAttribute('data-allcomp', '1');
    li.innerHTML = '<span class="ti-check">' + (on ? '●' : '') + '</span>' +
      '<span class="ti-label">🏆 All competitions</span>';
    li.addEventListener('click', selectAllComps);
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') selectAllComps(); });
    el.compList.appendChild(li);
  }

  function addCompRow(comp) {
    var on = selectedComps().indexOf(comp) !== -1;
    var li = document.createElement('li');
    li.className = 'comp-opt' + (on ? ' sel' : '');
    li.tabIndex = 0;
    li.setAttribute('data-comp', comp);
    li.innerHTML = '<span class="ti-check">' + (on ? '✓' : '') + '</span>' +
      '<span class="ti-label">' + escapeHtml(comp) + '</span>';
    li.addEventListener('click', function () { toggleComp(comp); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') toggleComp(comp); });
    el.compList.appendChild(li);
  }

  function showCompList() {
    el.compList.innerHTML = '';
    var head = document.createElement('li');
    head.className = 'picker-hint';
    head.innerHTML = '<span>Tap to include competitions — none picked shows them all.</span>';
    var done = document.createElement('button');
    done.type = 'button'; done.className = 'picker-done'; done.textContent = 'Done';
    done.addEventListener('click', function () { hideCompList(); });
    head.appendChild(done);
    el.compList.appendChild(head);
    addAllCompsRow();
    FCCFixtures.competitions(model()).forEach(function (c) { addCompRow(c); });
    el.compList.hidden = false;
  }

  function hideCompList() { el.compList.hidden = true; }
  function toggleCompList() { if (el.compList.hidden) showCompList(); else hideCompList(); }

  function updateCompTicks() {
    Array.prototype.forEach.call(el.compList.children, function (li) {
      var check = li.querySelector ? li.querySelector('.ti-check') : null;
      if (li.getAttribute && li.getAttribute('data-allcomp') != null) {
        var onAll = isAllComps();
        li.classList.toggle('sel', onAll);
        if (check) check.textContent = onAll ? '●' : '';
      } else if (li.getAttribute && li.getAttribute('data-comp') != null) {
        var onC = selectedComps().indexOf(li.getAttribute('data-comp')) !== -1;
        li.classList.toggle('sel', onC);
        if (check) check.textContent = onC ? '✓' : '';
      }
    });
  }

  function selectAllComps() {
    state.filters.competitions = [];
    hideCompList();
    render();
  }

  function toggleComp(comp) {
    var comps = selectedComps().slice();
    var i = comps.indexOf(comp);
    if (i === -1) comps.push(comp); else comps.splice(i, 1);
    state.filters.competitions = comps;
    updateCompTicks();
    renderCompPicker();
    renderMainView();
  }

  function renderSummary(games) {
    var playing = games.filter(function (g) { return g.info.playing; });
    el.statGames.textContent = playing.length;
    var today = startOfToday();
    var upcoming = playing.filter(function (g) { return g.fixture.date && g.fixture.date >= today; })[0];
    if (upcoming) {
      el.nextStat.hidden = false;
      el.statNext.textContent = fmtDate(upcoming.fixture.date) + (upcoming.fixture.time ? ' · ' + fmtTime(upcoming.fixture.time) : '');
    } else {
      el.nextStat.hidden = true;
    }
    el.addAllBtn.disabled = playing.length === 0;
    el.addAllBtn.childNodes[el.addAllBtn.childNodes.length - 1].nodeValue = ' Add ' + playing.length + ' to calendar';
  }

  // The upcoming weekend (Sat + Sun) relative to today.
  function weekendWindow(today) {
    var dow = today.getDay(); // 0 Sun … 6 Sat
    var sat = new Date(today), sun = new Date(today);
    if (dow === 0) {          // Sunday — this weekend is yesterday (Sat) + today
      sat.setDate(today.getDate() - 1);
    } else {                  // Mon–Sat — the coming Saturday + Sunday
      sat.setDate(today.getDate() + (6 - dow));
      sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    }
    return { start: sat, end: sun };
  }

  // A compact "this weekend" spotlight above the list — shown in the Everyone
  // (all-fixtures) and multi-player views, where it aggregates across players.
  // Respects the active filters.
  function renderSpotlight(games) {
    if (!(isAll() || isMulti())) { el.spotlightSection.hidden = true; return; }
    var today = startOfToday();
    var w = weekendWindow(today);
    var wk = games.filter(function (g) {
      var d = g.fixture.date;
      return d && d >= today && d >= w.start && d <= w.end;
    });
    if (!wk.length) { el.spotlightSection.hidden = true; return; }

    el.spotlightSection.hidden = false;
    el.spotlightSection.innerHTML =
      '<div class="spot-head">🥌 This weekend <span>' + escapeHtml(fmtDate(w.start)) + ' – ' + escapeHtml(fmtDate(w.end)) + '</span></div>' +
      '<ul class="spot-list">' + wk.map(function (g) {
        var f = g.fixture;
        var opp = FCCCalendar.displayOpp(f);
        var comp = (f.competition && f.competition !== opp) ? f.competition : '';
        var who = (g.who && g.who.length) ? g.who.join(', ') : '';
        return '<li class="spot-item status-' + g.info.status + '">' +
          '<span class="spot-when">' + (f.date ? DAYS[f.date.getDay()] : '') + ' ' + (f.time ? fmtTime(f.time) : 'TBC') + '</span>' +
          '<span class="spot-body">' +
            '<span class="spot-match">' + escapeHtml(opp) + '</span>' +
            (comp ? '<span class="spot-comp">🏆 ' + escapeHtml(comp) + '</span>' : '') +
            (who ? '<span class="spot-who">🥌 ' + escapeHtml(who) + '</span>' : '') +
          '</span>' +
        '</li>';
      }).join('') + '</ul>';
  }

  function monthKey(d) { return d ? d.getFullYear() + '-' + d.getMonth() : 'tbc'; }
  function monthLabel(d) { return d ? MONTHS[d.getMonth()] + ' ' + d.getFullYear() : 'Date TBC'; }

  function statusBadge(info) {
    return '<span class="badge badge-' + info.status + '">' + escapeHtml(info.label) + '</span>';
  }

  function renderGames(games) {
    if (!games.length) {
      el.gamesSection.innerHTML = '';
      el.emptyState.hidden = false;
      el.emptyState.textContent = 'No games match the current filters.';
      return;
    }
    el.emptyState.hidden = true;
    var showWho = isMulti();
    var lastMonth = null;
    var html = games.map(function (g, i) {
      var f = g.fixture;
      var opp = FCCCalendar.displayOpp(f);
      var mates = matesFor(f);
      var canCal = g.info.playing && f.date && f.time;
      var timeLabel = f.time ? fmtTime(f.time) : 'Time TBC';
      var who = (showWho && g.who && g.who.length) ? g.who.join(', ') : '';
      // A month divider whenever the month changes down the sorted list.
      var head = '';
      var key = monthKey(f.date);
      if (key !== lastMonth) { head = '<div class="month-head">' + escapeHtml(monthLabel(f.date)) + '</div>'; lastMonth = key; }
      return head +
        '<article class="game-card status-' + g.info.status + '">' +
          '<div class="game-date">' +
            '<span class="gd-dow">' + (f.date ? DAYS[f.date.getDay()] : '') + '</span>' +
            '<span class="gd-day">' + (f.date ? f.date.getDate() : '?') + '</span>' +
            '<span class="gd-mon">' + (f.date ? MONTHS[f.date.getMonth()] : '') + '</span>' +
          '</div>' +
          '<div class="game-main">' +
            '<div class="game-top">' +
              '<h3 class="game-opp">' + escapeHtml(opp) + '</h3>' +
              statusBadge(g.info) +
            '</div>' +
            '<p class="game-meta">' +
              '<span class="gm-time">🕒 ' + timeLabel + '</span>' +
              (f.competition && f.competition !== opp ? '<span class="gm-comp">🏆 ' + escapeHtml(f.competition) + '</span>' : '') +
              (f.week ? '<span class="gm-week">' + escapeHtml(f.week) + '</span>' : '') +
              (who ? '<span class="gm-who">🥌 ' + escapeHtml(who) + '</span>' : '') +
            '</p>' +
            '<div class="game-actions">' +
              (canCal
                ? '<button class="cal-btn" data-cal="' + i + '"><svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg> Add to calendar</button>'
                : '<span class="cal-na">' + (g.info.playing ? 'No date/time yet' : '') + '</span>') +
              (mates.length > 1 ? '<button class="mates-btn" data-mates="' + i + '">👥 Team (' + mates.length + ')</button>' : '') +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');
    el.gamesSection.innerHTML = html;

    Array.prototype.forEach.call(el.gamesSection.querySelectorAll('[data-cal]'), function (btn) {
      btn.addEventListener('click', function () {
        var g = games[+btn.getAttribute('data-cal')];
        exportCalendar([g], FCCCalendar.eventFileName(g));
      });
    });
    Array.prototype.forEach.call(el.gamesSection.querySelectorAll('[data-mates]'), function (btn) {
      btn.addEventListener('click', function () {
        var g = games[+btn.getAttribute('data-mates')];
        openTeamModal(g.fixture);
      });
    });
  }

  function openTeamModal(fixture) {
    var mates = matesFor(fixture);
    var opp = FCCCalendar.displayOpp(fixture);
    el.modalTitle.textContent = opp + (fixture.date ? ' — ' + fmtDate(fixture.date) : '');
    el.modalBody.innerHTML =
      '<p class="modal-sub">' + (fixture.competition ? escapeHtml(fixture.competition) + ' · ' : '') +
        (fixture.time ? fmtTime(fixture.time) : 'Time TBC') + '</p>' +
      '<ul class="mates-list">' + mates.map(function (n) {
        var me = !isAll() && selectedNames().indexOf(n) !== -1;
        return '<li' + (me ? ' class="me"' : '') + '>' + escapeHtml(n) + '</li>';
      }).join('') + '</ul>';
    el.modal.hidden = false;
  }

  function closeModals() {
    el.modal.hidden = true;
    el.settingsModal.hidden = true;
    el.shareModal.hidden = true;
  }

  // ============================================================
  //  FILE HANDLING
  // ============================================================

  function handleFile(file) {
    el.parseError.hidden = true;
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array', cellDates: true });
        var parsed = FCCParser.parseWorkbook(wb);
        // A new rota keeps any still-valid selection/competition filters and
        // otherwise falls back to sensible defaults (handled by reconcile*).
        adopt({ fixtures: parsed.fixtures, players: parsed.players, season: parsed.season },
              { fileName: file.name, season: parsed.season });
        save();
        render();
      } catch (err) {
        el.parseError.hidden = false;
        el.parseError.textContent = '⚠️ ' + (err.message || 'Could not read that spreadsheet.');
        console.error(err);
      }
    };
    reader.onerror = function () {
      el.parseError.hidden = false;
      el.parseError.textContent = '⚠️ Could not read that file.';
    };
    reader.readAsArrayBuffer(file);
  }

  // ============================================================
  //  SETTINGS
  // ============================================================

  function loadSettings() {
    var s = cloneSettings(CAL_DEFAULTS);
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (typeof d.location === 'string') s.location = d.location;
        if (typeof d.locationUrl === 'string') s.locationUrl = d.locationUrl;
        if (d.durationMin) s.durationMin = +d.durationMin;
        if (d.alarmHours != null) s.alarmHours = +d.alarmHours;
      }
    } catch (e) { /* ignore */ }
    state.settings = s;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) {}
  }

  function openSettings() {
    el.setLocation.value = state.settings.location || '';
    el.setMapUrl.value = state.settings.locationUrl || '';
    el.setDuration.value = String(state.settings.durationMin);
    el.setReminder.value = String(state.settings.alarmHours);
    el.settingsModal.hidden = false;
  }

  function applySettingsForm() {
    state.settings.location = el.setLocation.value.trim() || CAL_DEFAULTS.location;
    state.settings.locationUrl = el.setMapUrl.value.trim();
    state.settings.durationMin = +el.setDuration.value || CAL_DEFAULTS.durationMin;
    state.settings.alarmHours = +el.setReminder.value || 0;
    saveSettings();
    closeModals();
  }

  // ============================================================
  //  SHARING
  // ============================================================

  function openShare() {
    el.shareStatus.hidden = true;
    el.shareModal.hidden = false;
  }

  function setShareStatus(msg) {
    el.shareStatus.hidden = false;
    el.shareStatus.textContent = msg;
  }

  // gzip/base64url so the whole rota fits in a shareable URL fragment.
  function gzip(str) {
    var cs = new CompressionStream('gzip');
    var w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(str)); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function gunzip(bytes) {
    var ds = new DecompressionStream('gzip');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new TextDecoder().decode(b); });
  }
  function bytesToB64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function strToB64url(str) { return bytesToB64url(new TextEncoder().encode(str)); }
  function b64urlToStr(s) { return new TextDecoder().decode(b64urlToBytes(s)); }

  // Append the current player selection so a shared link opens on the same view.
  function selectionSuffix() {
    return '&player=' + (isAll() ? 'all' : selectedNames().map(encodeURIComponent).join(','));
  }

  function buildShareLink() {
    var json = FCCShare.serialize(model());
    var base = location.origin + location.pathname;
    var tail = selectionSuffix();
    if (window.CompressionStream) {
      return gzip(json).then(function (gz) { return base + '#d=g' + bytesToB64url(gz) + tail; })
        .catch(function () { return base + '#d=r' + strToB64url(json) + tail; });
    }
    return Promise.resolve(base + '#d=r' + strToB64url(json) + tail);
  }

  function doShareLink() {
    buildShareLink().then(function (url) {
      if (navigator.share) {
        return navigator.share({ title: 'Falkirk Curling rota', url: url })
          .then(function () { setShareStatus('Shared.'); })
          .catch(function (e) {
            if (e && e.name === 'AbortError') return;
            return copyText(url).then(function () { setShareStatus('Link copied to clipboard.'); });
          });
      }
      return copyText(url).then(function () { setShareStatus('Link copied to clipboard.'); });
    }).catch(function () { setShareStatus('Sorry — could not create the link.'); });
  }

  function doShareText() {
    var text = FCCShare.fixturesToText(currentGames(), headingLabel());
    if (navigator.share) {
      navigator.share({ title: 'Falkirk Curling fixtures', text: text })
        .then(function () { setShareStatus('Shared.'); })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return;
          copyText(text).then(function () { setShareStatus('Fixtures copied to clipboard.'); });
        });
    } else {
      copyText(text).then(function () { setShareStatus('Fixtures copied to clipboard.'); })
        .catch(function () { setShareStatus('Sorry — could not copy.'); });
    }
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); resolve();
      } catch (e) { reject(e); }
    });
  }

  // Load a rota shared via URL fragment (#d=...). Returns a Promise<boolean>.
  function loadFromHash() {
    var m = (location.hash || '').match(/[#&]d=([gr])([A-Za-z0-9\-_]+)/);
    if (!m) return Promise.resolve(false);
    var enc = m[1], data = m[2];
    var jsonP = (enc === 'g') ? gunzip(b64urlToBytes(data)) : Promise.resolve(b64urlToStr(data));
    return jsonP.then(function (json) {
      var mdl = FCCShare.deserialize(json);
      if (!mdl.fixtures.length || !mdl.players.length) return false;
      adopt({ fixtures: mdl.fixtures, players: mdl.players, season: mdl.season },
            { fileName: 'shared link', season: mdl.season });
      save();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      return true;
    }).catch(function () { return false; });
  }

  // Deep link: #player=Name (or #player=A,B or #player=all) preselects a view.
  // Runs after data is loaded and overrides the remembered selection. Names are
  // comma-separated, URL-encoded, and matched case-insensitively.
  function applyPlayerHash(rawHash) {
    var m = (rawHash || '').match(/[#&]player=([^&]+)/i);
    if (!m) return;
    var val;
    try { val = decodeURIComponent(m[1]); } catch (e) { val = m[1]; }
    if (/^all$/i.test(val)) {
      state.selection = { mode: 'all', names: [] };
    } else {
      var names = [];
      val.split(',').forEach(function (w) {
        var wanted = w.trim().toLowerCase();
        if (!wanted) return;
        state.players.forEach(function (p) {
          if (p.name.toLowerCase() === wanted && names.indexOf(p.name) === -1) names.push(p.name);
        });
      });
      if (names.length) state.selection = { mode: 'players', names: orderNames(names) };
    }
    saveSelection();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  // ============================================================
  //  EVENTS
  // ============================================================

  function wireEvents() {
    el.dropzone.addEventListener('click', function () { el.fileInput.click(); });
    el.dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); } });
    el.fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });

    ['dragover', 'dragenter'].forEach(function (ev) {
      el.dropzone.addEventListener(ev, function (e) { e.preventDefault(); el.dropzone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.dropzone.addEventListener(ev, function (e) { e.preventDefault(); el.dropzone.classList.remove('drag'); });
    });
    el.dropzone.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    el.changeFileBtn.addEventListener('click', function () {
      el.fileInput.value = '';
      el.fileInput.click();
    });

    // Player multi-picker: tap to open/close; keyboard opens with Enter/Space/Down.
    el.playerSearch.addEventListener('click', togglePlayerList);
    el.playerSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); showPlayerList(); }
      else if (e.key === 'Escape') hidePlayerList();
    });

    // Competition multi-picker: same interaction as the player picker.
    el.compSearch.addEventListener('click', toggleCompList);
    el.compSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); showCompList(); }
      else if (e.key === 'Escape') hideCompList();
    });

    // Tap anywhere outside a picker closes its dropdown.
    document.addEventListener('click', function (e) {
      if (!el.playerList.hidden && e.target !== el.playerSearch && !el.playerList.contains(e.target)) hidePlayerList();
      if (!el.compList.hidden && e.target !== el.compSearch && !el.compList.contains(e.target)) hideCompList();
    });

    el.filterChips.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var f = btn.getAttribute('data-filter');
      state.filters[f] = !state.filters[f];
      btn.classList.toggle('active', state.filters[f]);
      render();
    });

    el.addAllBtn.addEventListener('click', function () {
      var games = currentGames().filter(function (g) { return g.info.playing; });
      exportCalendar(games, 'falkirk-curling-' + slug(headingLabel()) + '.ics');
    });

    // Settings
    el.settingsBtn.addEventListener('click', openSettings);
    el.settingsForm.addEventListener('submit', function (e) { e.preventDefault(); applySettingsForm(); });
    el.settingsReset.addEventListener('click', function () {
      state.settings = cloneSettings(CAL_DEFAULTS); saveSettings(); openSettings();
    });

    // Share
    el.shareBtn.addEventListener('click', openShare);
    el.shareLinkBtn.addEventListener('click', doShareLink);
    el.shareTextBtn.addEventListener('click', doShareText);

    // Modals: backdrop / close button / Escape close whichever is open.
    [el.modal, el.settingsModal, el.shareModal].forEach(function (mod) {
      mod.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeModals(); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModals(); hidePlayerList(); hideCompList(); }
    });
  }

  // ============================================================
  //  INIT
  // ============================================================

  // If the app throws while starting up — most likely because a stale service
  // worker served an index.html and app.js from different versions, so an
  // expected element is missing — clear the caches + service worker and reload
  // once so everything comes back fresh and matched. Guarded so it can only
  // self-heal once per tab (no reload loops).
  function recoverFromStaleShell(err) {
    if (window.console && console.error) console.error('Startup failed; attempting recovery.', err);
    try {
      if (sessionStorage.getItem('fcc_selfheal')) return; // already tried this tab
      sessionStorage.setItem('fcc_selfheal', '1');
    } catch (e) { return; }
    var reload = function () { try { location.reload(); } catch (e) {} };
    var jobs = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }));
      }
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }));
      }
    } catch (e) { /* ignore */ }
    Promise.all(jobs).then(reload, reload);
    setTimeout(reload, 1500); // fallback if the clears hang
  }

  function init() {
    try {
      if (typeof XLSX === 'undefined') {
        el.parseError.hidden = false;
        el.parseError.textContent = '⚠️ Could not load the spreadsheet library. Try refreshing.';
      }
      wireEvents();
      loadSettings();
      Array.prototype.forEach.call(el.filterChips.querySelectorAll('.chip'), function (btn) {
        btn.classList.toggle('active', !!state.filters[btn.getAttribute('data-filter')]);
      });
      // Capture the hash before loadFromHash clears any #d= share payload.
      var rawHash = location.hash;
      loadFromHash().then(function (fromLink) {
        if (!fromLink) load();
        applyDefaultSelection();    // remembered player(s), or "Everyone"
        applyPlayerHash(rawHash);   // #player=… deep link overrides
        render();
        // Startup succeeded — allow future self-heals if a later reload needs one.
        try { sessionStorage.removeItem('fcc_selfheal'); } catch (e) {}
      }).catch(function (e) { recoverFromStaleShell(e); });
    } catch (e) {
      recoverFromStaleShell(e);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
