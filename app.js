/* Falkirk Curling Club — My Fixtures
 * Fully client-side. Parses the "Rota by Player" grid spreadsheet,
 * lets a player see their games and export them to a calendar (.ics).
 */
(function () {
  'use strict';

  // ---------- Config ----------
  var STORAGE_KEY = 'fcc_rota_v1';
  var PLAYER_KEY = 'fcc_player_v1';
  var DEFAULT_LOCATION = 'Falkirk Curling Club';
  var GAME_DURATION_MIN = 120; // assumed length of a game
  // Marker meaning within a fixture column
  var MARKERS = {
    x: { status: 'playing', label: 'Playing', playing: true },
    sub: { status: 'sub', label: 'Sub (playing)', playing: true },
    'n/a': { status: 'unavailable', label: 'Not available', playing: false },
    na: { status: 'unavailable', label: 'Not available', playing: false },
    d: { status: 'declined', label: 'Declined', playing: false },
    '?': { status: 'awaiting', label: 'Awaiting response', playing: false }
  };

  // ---------- State ----------
  var state = {
    fixtures: [],   // [{col, date(Date|null), rawDate, time{h,m}|null, opposition, competition, week}]
    players: [],    // [{name, markers: {colIndex: rawMarker}}]
    selectedPlayer: null,
    filters: { playing: true, unavailable: false, hidepast: true },
    meta: { fileName: '', season: '' }
  };

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
  //  MARKER / DISPLAY HELPERS
  // ============================================================

  function markerInfo(raw) {
    if (!raw) return { status: 'none', label: '', playing: false };
    var key = raw.toString().trim().toLowerCase();
    if (MARKERS[key]) return MARKERS[key];
    // Unknown non-empty marker: treat as a note (assume playing).
    return { status: 'other', label: raw, playing: true };
  }

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
  //  GAME LIST FOR SELECTED PLAYER
  // ============================================================

  function playerObj() {
    return state.players.filter(function (p) { return p.name === state.selectedPlayer; })[0] || null;
  }

  function playerGames() {
    var p = playerObj();
    if (!p) return [];
    var today = startOfToday();
    var games = [];
    state.fixtures.forEach(function (f) {
      var raw = p.markers[f.col];
      if (!raw) return;
      var info = markerInfo(raw);
      // Filters
      if (info.playing && !state.filters.playing) return;
      if (!info.playing && info.status === 'unavailable' && !state.filters.unavailable) return;
      if (!info.playing && info.status !== 'unavailable') {
        // declined / awaiting: show only if unavailable filter on
        if (!state.filters.unavailable) return;
      }
      if (state.filters.hidepast && f.date && f.date < today) return;
      games.push({ fixture: f, info: info });
    });
    games.sort(function (a, b) {
      var da = a.fixture.date ? a.fixture.date.getTime() : Infinity;
      var db = b.fixture.date ? b.fixture.date.getTime() : Infinity;
      return da - db;
    });
    return games;
  }

  // Everyone marked as playing a given fixture
  function teammates(fixture) {
    return state.players.filter(function (p) {
      var info = markerInfo(p.markers[fixture.col]);
      return info.playing;
    }).map(function (p) { return p.name; });
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

    var games = playerGames();
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
    var today = startOfToday();
    var html = games.map(function (g, i) {
      var f = g.fixture;
      var isNext = g.info.playing && f.date && f.date >= today;
      // mark only the first upcoming as "next"
      var opp = f.opposition && f.opposition !== '-' ? f.opposition : (f.competition || 'Fixture');
      var mates = teammates(f);
      var canCal = g.info.playing && f.date && f.time;
      var dateLabel = f.date ? fmtDate(f.date) : (f.rawDate || 'Date TBC');
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

    // wire per-card buttons
    Array.prototype.forEach.call(el.gamesSection.querySelectorAll('[data-cal]'), function (btn) {
      btn.addEventListener('click', function () {
        var g = games[+btn.getAttribute('data-cal')];
        downloadICS([g], icsFileName(g));
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
    var mates = teammates(fixture);
    var opp = fixture.opposition && fixture.opposition !== '-' ? fixture.opposition : (fixture.competition || 'Fixture');
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
  //  ICS / CALENDAR
  // ============================================================

  function pad(n) { return String(n).padStart(2, '0'); }

  // Floating local time (no Z) so Apple/Google show it in the phone's local time.
  function icsLocal(date, time) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  function addMinutes(date, time, mins) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0);
    d.setMinutes(d.getMinutes() + mins);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function buildEvent(g) {
    var f = g.fixture;
    var opp = f.opposition && f.opposition !== '-' ? f.opposition : (f.competition || 'Curling');
    var title = 'Curling: ' + opp + (f.competition && f.competition !== opp ? ' (' + f.competition + ')' : '');
    var mates = teammates(f);
    var desc = [];
    if (f.competition) desc.push('Competition: ' + f.competition);
    if (f.week) desc.push(f.week);
    if (mates.length) desc.push('Team: ' + mates.join(', '));
    desc.push('Falkirk Curling Club');
    var uid = 'fcc-' + (f.date ? f.date.getTime() : 'nd') + '-' + f.col + '-' + (state.selectedPlayer || '').replace(/\W/g, '') + '@falkirkcurling';
    var stamp = new Date();
    var dtstamp = stamp.getUTCFullYear() + pad(stamp.getUTCMonth() + 1) + pad(stamp.getUTCDate()) + 'T' +
                  pad(stamp.getUTCHours()) + pad(stamp.getUTCMinutes()) + pad(stamp.getUTCSeconds()) + 'Z';
    return [
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + dtstamp,
      'DTSTART:' + icsLocal(f.date, f.time),
      'DTEND:' + addMinutes(f.date, f.time, GAME_DURATION_MIN),
      'SUMMARY:' + icsEscape(title),
      'LOCATION:' + icsEscape(DEFAULT_LOCATION),
      'DESCRIPTION:' + icsEscape(desc.join('\n')),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsEscape(title),
      'TRIGGER:-PT3H',
      'END:VALARM',
      'END:VEVENT'
    ].join('\r\n');
  }

  // Fold logical lines to <=75 chars (RFC 5545) so strict importers accept the file.
  function foldICS(str) {
    return str.split('\r\n').map(function (line) {
      if (line.length <= 75) return line;
      var out = line.slice(0, 75);
      var rest = line.slice(75);
      while (rest.length > 74) { out += '\r\n ' + rest.slice(0, 74); rest = rest.slice(74); }
      return out + '\r\n ' + rest;
    }).join('\r\n');
  }

  function buildCalendar(games) {
    var events = games
      .filter(function (g) { return g.info.playing && g.fixture.date && g.fixture.time; })
      .map(buildEvent);
    var cal = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Falkirk Curling Club//Fixtures//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Falkirk Curling - ' + (state.selectedPlayer || 'Fixtures')
    ].concat(events).concat(['END:VCALENDAR']).join('\r\n');
    return foldICS(cal);
  }

  function icsFileName(g) {
    var f = g.fixture;
    var opp = (f.opposition || 'curling').replace(/[^\w]+/g, '-').toLowerCase();
    var d = f.date ? f.date.getFullYear() + pad(f.date.getMonth() + 1) + pad(f.date.getDate()) : 'game';
    return 'curling-' + d + '-' + opp + '.ics';
  }

  function downloadICS(games, filename) {
    var ics = buildCalendar(games);
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
        var model = FCCParser.parseWorkbook(wb);
        state.fixtures = model.fixtures;
        state.players = model.players;
        state.meta = { fileName: file.name, season: model.season };
        // Preserve previously selected player if still present
        if (state.selectedPlayer && !playerObj()) state.selectedPlayer = null;
        if (!state.selectedPlayer) state.selectedPlayer = guessPlayer(model.players);
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

  // Best-effort default: match this device's user if we can, else none.
  function guessPlayer(players) {
    var stored = localStorage.getItem(PLAYER_KEY);
    if (stored && players.some(function (p) { return p.name === stored; })) return stored;
    return null;
  }

  // ============================================================
  //  EVENTS
  // ============================================================

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

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
      var games = playerGames().filter(function (g) { return g.info.playing; });
      downloadICS(games, 'falkirk-curling-' + (state.selectedPlayer || 'fixtures').replace(/\W+/g, '-').toLowerCase() + '.ics');
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
      // restore filter chips state
      Array.prototype.forEach.call(el.filterChips.querySelectorAll('.chip'), function (btn) {
        btn.classList.toggle('active', !!state.filters[btn.getAttribute('data-filter')]);
      });
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
