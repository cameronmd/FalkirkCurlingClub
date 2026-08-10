/* Falkirk Curling Club — calendar (.ics) generation (pure, no DOM).
 * Works in the browser (window.FCCCalendar) and Node (module.exports).
 *
 * A "game" is { fixture, info, mates } where:
 *   fixture = { col, date:Date|null, time:{h,m}|null, opposition, competition, week }
 *   info    = { playing:boolean, ... }   (from FCCFixtures.markerInfo)
 *   mates   = [names]                     (optional; listed in the event description)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FCCCalendar = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    location: 'Falkirk Curling Club',
    durationMin: 120,
    alarmHours: 3,
    playerName: 'Fixtures',
    prodId: '-//Falkirk Curling Club//Fixtures//EN'
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function displayOpp(f) {
    return (f.opposition && f.opposition !== '-') ? f.opposition : (f.competition || 'Curling');
  }

  // Floating local time (no Z / no TZID) so calendars show the phone's local time.
  function fmtLocal(y, mo, d, h, mi) {
    return y + pad(mo + 1) + pad(d) + 'T' + pad(h) + pad(mi) + '00';
  }

  function icsLocal(date, time) {
    return fmtLocal(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m);
  }

  function icsLocalPlus(date, time, mins) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0);
    d.setMinutes(d.getMinutes() + mins);
    return fmtLocal(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  }

  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
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

  function eventTitle(f) {
    var opp = displayOpp(f);
    return 'Curling: ' + opp + (f.competition && f.competition !== opp ? ' (' + f.competition + ')' : '');
  }

  function buildEvent(game, opts) {
    opts = opts || {};
    var loc = opts.location || DEFAULTS.location;
    var durationMin = opts.durationMin || DEFAULTS.durationMin;
    var alarmHours = opts.alarmHours == null ? DEFAULTS.alarmHours : opts.alarmHours;
    var playerName = opts.playerName || DEFAULTS.playerName;
    var now = opts.now || new Date();

    var f = game.fixture;
    var title = eventTitle(f);
    var mates = game.mates || [];
    var desc = [];
    if (f.competition) desc.push('Competition: ' + f.competition);
    if (f.week) desc.push(f.week);
    if (mates.length) desc.push('Team: ' + mates.join(', '));
    desc.push('Falkirk Curling Club');

    var uid = 'fcc-' + (f.date ? f.date.getTime() : 'nd') + '-' + f.col + '-' +
              String(playerName).replace(/\W/g, '') + '@falkirkcurling';

    var lines = [
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + utcStamp(now),
      'DTSTART:' + icsLocal(f.date, f.time),
      'DTEND:' + icsLocalPlus(f.date, f.time, durationMin),
      'SUMMARY:' + icsEscape(title),
      'LOCATION:' + icsEscape(loc),
      'DESCRIPTION:' + icsEscape(desc.join('\n'))
    ];
    if (alarmHours > 0) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title),
                 'TRIGGER:-PT' + alarmHours + 'H', 'END:VALARM');
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  }

  // Only games the player is playing, with a real date+time, become events.
  function exportable(game) {
    return !!(game.info && game.info.playing && game.fixture.date && game.fixture.time);
  }

  function buildCalendar(games, opts) {
    opts = opts || {};
    var playerName = opts.playerName || DEFAULTS.playerName;
    var events = (games || []).filter(exportable).map(function (g) { return buildEvent(g, opts); });
    var cal = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:' + (opts.prodId || DEFAULTS.prodId),
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Falkirk Curling - ' + playerName
    ].concat(events).concat(['END:VCALENDAR']).join('\r\n');
    return foldICS(cal);
  }

  function eventFileName(game) {
    var f = game.fixture;
    var opp = (displayOpp(f) || 'curling').replace(/[^\w]+/g, '-').toLowerCase();
    var d = f.date ? f.date.getFullYear() + pad(f.date.getMonth() + 1) + pad(f.date.getDate()) : 'game';
    return 'curling-' + d + '-' + opp + '.ics';
  }

  return {
    DEFAULTS: DEFAULTS,
    buildCalendar: buildCalendar,
    buildEvent: buildEvent,
    eventTitle: eventTitle,
    eventFileName: eventFileName,
    displayOpp: displayOpp,
    foldICS: foldICS,
    icsEscape: icsEscape,
    icsLocal: icsLocal,
    exportable: exportable
  };
});
