/* Falkirk Curling Club — sharing helpers (pure, no DOM).
 * Works in the browser (window.FCCShare) and Node (module.exports).
 *
 * serialize/deserialize produce a compact JSON representation of the rota that
 * can be compressed + base64url-encoded into a share link by the app layer.
 * fixturesToText renders a human-readable fixture list for text sharing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FCCShare = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;

  // model { season, fixtures[], players[] } -> compact JSON string.
  function serialize(model) {
    var payload = {
      v: VERSION,
      s: model.season || '',
      f: model.fixtures.map(function (f) {
        return [f.col, f.date ? f.date.getTime() : 0, f.rawDate || '',
                f.time ? [f.time.h, f.time.m] : 0, f.opposition || '', f.competition || '', f.week || ''];
      }),
      p: model.players.map(function (p) { return [p.name, p.markers]; })
    };
    return JSON.stringify(payload);
  }

  // compact JSON string -> model (dates rehydrated to Date objects).
  function deserialize(str) {
    var d = JSON.parse(str);
    if (!d || !d.f || !d.p) throw new Error('Invalid shared rota data.');
    return {
      season: d.s || '',
      fixtures: d.f.map(function (a) {
        return {
          col: a[0],
          date: a[1] ? new Date(a[1]) : null,
          rawDate: a[2] || '',
          time: a[3] ? { h: a[3][0], m: a[3][1] } : null,
          opposition: a[4] || '',
          competition: a[5] || '',
          week: a[6] || ''
        };
      }),
      players: d.p.map(function (a) { return { name: a[0], markers: a[1] || {} }; })
    };
  }

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(d, rawDate) {
    if (!d) return rawDate || 'Date TBC';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function fmtTime(t) {
    if (!t) return '';
    var ampm = t.h >= 12 ? 'pm' : 'am';
    var h12 = t.h % 12; if (h12 === 0) h12 = 12;
    return h12 + (t.m ? ':' + String(t.m).padStart(2, '0') : '') + ampm;
  }

  // games: [{ fixture, info }]; heading: e.g. a player name or "All fixtures".
  function fixturesToText(games, heading) {
    var lines = [];
    lines.push('🥌 Falkirk Curling — ' + (heading || 'Fixtures'));
    lines.push('');
    if (!games.length) {
      lines.push('No games.');
      return lines.join('\n');
    }
    games.forEach(function (g) {
      var f = g.fixture;
      var opp = (f.opposition && f.opposition !== '-') ? f.opposition : (f.competition || 'Fixture');
      var when = fmtDate(f.date, f.rawDate);
      var time = fmtTime(f.time);
      var bits = [when + (time ? ' ' + time : ''), opp];
      if (f.competition && f.competition !== opp) bits.push('(' + f.competition + ')');
      var suffix = (g.info && !g.info.playing && g.info.label) ? '  — ' + g.info.label : '';
      lines.push('• ' + bits.join(' · ') + suffix);
    });
    return lines.join('\n');
  }

  return {
    VERSION: VERSION,
    serialize: serialize,
    deserialize: deserialize,
    fixturesToText: fixturesToText
  };
});
