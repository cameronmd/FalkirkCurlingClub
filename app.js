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
  var CAL_OPTS = { location: 'Falkirk Curling Club', durationMin: 120, alarmHours: 3 };

  // ---------- State ----------
  var state = {
    fixtures: [],   // [{col, date(Date|null), rawDate, time{h,m}|null, opposition, competition, week}]
    players: [],    // [{name, markers: {colIndex: rawMarker}}]
    selectedPlayer: null,
    filters: { playing: true, unavailable: false, hidepast: true },
    meta: { fileName: '', season: '' }
  };

  function model() { return { fixtures: state.fixtures, players: state.players }; }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    uploadSection: $('uploadSection'),
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    parseError: $('parseError'),
    changeFileBtn: $('changeFileBtn'),
    controlsSection: $('controlsSection'),
    playerSearch: $('playerSearch'),
    playerList: $('playerList'),
    filterChips: $('filterChips'),
    summarySection: $('summarySection'),
    statGames: $('statGames'),
    nextStat: $('nextStat'),
    statNext: $('statNext'),
    addAllBtn: $('addAllBtn'),
    gamesSection: $('gamesSection'),
    emptyState: $('emptyState'),
    modal: $('modal'),
    modalTitle: $('modalTitle'),
    modalBody: $('modalBody')
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
    return FCCFixtures.playerGames(model(), state.selectedPlayer, state.filters, startOfToday());
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
      playerName: state.selectedPlayer || 'Fixtures',
      location: CAL_OPTS.location,
      durationMin: CAL_OPTS.durationMin,
      alarmHours: CAL_OPTS.alarmHours
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
      state.fixtures = data.fixtures.map(function (f) {
        return { col: f.col, date: f.date ? new Date(f.date) : null, rawDate: f.rawDate,
                 time: f.time, opposition: f.opposition, competition: f.competition, week: f.week };
      });
      state.players = data.players;
      state.meta = data.meta || {};
      state.selectedPlayer = localStorage.getItem(PLAYER_KEY) || null;
      return state.fixtures.length && state.players.length;
    } catch (e) { return false; }
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  function render() {
    var hasData = state.fixtures.length && state.players.length;
    el.uploadSection.hidden = hasData;
    el.changeFileBtn.hidden = !hasData;
    el.controlsSection.hidden = !hasData;
    if (!hasData) { el.summarySection.hidden = true; el.gamesSection.innerHTML = ''; return; }

    renderPlayerPicker();

    if (!state.selectedPlayer) {
      el.summarySection.hidden = true;
      el.gamesSection.innerHTML = '';
      el.emptyState.hidden = false;
      el.emptyState.textContent = 'Choose your name above to see your games.';
      return;
    }

    var games = currentGames();
    el.summarySection.hidden = false;
    renderSummary(games);
    renderGames(games);
  }

  function renderPlayerPicker() {
    if (state.selectedPlayer && document.activeElement !== el.playerSearch) {
      el.playerSearch.value = state.selectedPlayer;
    }
  }

  function filterPlayers(q) {
    q = (q || '').toLowerCase().trim();
    var list = state.players.map(function (p) { return p.name; });
    if (q) list = list.filter(function (n) { return n.toLowerCase().indexOf(q) !== -1; });
    return list.sort();
  }

  function showPlayerList(q) {
    var names = filterPlayers(q);
    el.playerList.innerHTML = '';
    names.forEach(function (n) {
      var li = document.createElement('li');
      li.textContent = n;
      li.tabIndex = 0;
      li.addEventListener('mousedown', function (e) { e.preventDefault(); selectPlayer(n); });
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter') selectPlayer(n); });
      el.playerList.appendChild(li);
    });
    el.playerList.hidden = names.length === 0;
  }

  function hidePlayerList() { el.playerList.hidden = true; }

  function selectPlayer(name) {
    state.selectedPlayer = name;
    try { localStorage.setItem(PLAYER_KEY, name); } catch (e) {}
    el.playerSearch.value = name;
    hidePlayerList();
    el.playerSearch.blur();
    render();
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
    var html = games.map(function (g, i) {
      var f = g.fixture;
      var opp = FCCCalendar.displayOpp(f);
      var mates = matesFor(f);
      var canCal = g.info.playing && f.date && f.time;
      var timeLabel = f.time ? fmtTime(f.time) : 'Time TBC';
      return '' +
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
        return '<li' + (n === state.selectedPlayer ? ' class="me"' : '') + '>' + escapeHtml(n) + '</li>';
      }).join('') + '</ul>';
    el.modal.hidden = false;
  }

  function closeModal() { el.modal.hidden = true; }

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
        state.fixtures = parsed.fixtures;
        state.players = parsed.players;
        state.meta = { fileName: file.name, season: parsed.season };
        // Preserve previously selected player if still present.
        if (state.selectedPlayer && !FCCFixtures.findPlayer(model(), state.selectedPlayer)) {
          state.selectedPlayer = null;
        }
        if (!state.selectedPlayer) state.selectedPlayer = guessPlayer(parsed.players);
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

  // Best-effort default: reuse the remembered player if present in this rota.
  function guessPlayer(players) {
    var stored = localStorage.getItem(PLAYER_KEY);
    if (stored && players.some(function (p) { return p.name === stored; })) return stored;
    return null;
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

    el.playerSearch.addEventListener('focus', function () { showPlayerList(''); el.playerSearch.select(); });
    el.playerSearch.addEventListener('input', function () { showPlayerList(el.playerSearch.value); });
    el.playerSearch.addEventListener('blur', function () { setTimeout(hidePlayerList, 150); });

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
      exportCalendar(games, 'falkirk-curling-' + (state.selectedPlayer || 'fixtures').replace(/\W+/g, '-').toLowerCase() + '.ics');
    });

    el.modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) closeModal();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  // ============================================================
  //  INIT
  // ============================================================

  function init() {
    if (typeof XLSX === 'undefined') {
      el.parseError.hidden = false;
      el.parseError.textContent = '⚠️ Could not load the spreadsheet library. Check your connection and refresh.';
    }
    wireEvents();
    if (load()) {
      Array.prototype.forEach.call(el.filterChips.querySelectorAll('.chip'), function (btn) {
        btn.classList.toggle('active', !!state.filters[btn.getAttribute('data-filter')]);
      });
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
