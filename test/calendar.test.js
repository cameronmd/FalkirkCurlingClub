'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calendar.js');

function game(over) {
  return Object.assign({
    fixture: {
      col: 1, date: new Date(2026, 8, 8), time: { h: 20, m: 30 },
      opposition: 'Dunblane', competition: 'Small Clubs', week: 'Week 1'
    },
    info: { playing: true, status: 'playing' },
    mates: ['Ferguson I', 'Gray A']
  }, over);
}

const FIXED_NOW = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));

test('displayOpp falls back to competition when opposition is missing/"-"', () => {
  assert.equal(C.displayOpp({ opposition: 'Dunblane', competition: 'League' }), 'Dunblane');
  assert.equal(C.displayOpp({ opposition: '-', competition: 'Opening Bonspiel' }), 'Opening Bonspiel');
  assert.equal(C.displayOpp({ opposition: '', competition: '' }), 'Curling');
});

test('eventTitle appends competition only when it differs', () => {
  assert.equal(C.eventTitle({ opposition: 'Dunblane', competition: 'Small Clubs' }), 'Curling: Dunblane (Small Clubs)');
  assert.equal(C.eventTitle({ opposition: '-', competition: 'Opening Bonspiel' }), 'Curling: Opening Bonspiel');
});

test('icsEscape escapes commas, semicolons, backslashes, newlines', () => {
  assert.equal(C.icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('icsLocal produces floating local time (no Z, no offset)', () => {
  const s = C.icsLocal(new Date(2026, 8, 8), { h: 20, m: 30 });
  assert.equal(s, '20260908T203000');
});

test('foldICS folds lines longer than 75 chars with CRLF + space', () => {
  const long = 'DESCRIPTION:' + 'a'.repeat(120);
  const folded = C.foldICS(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  assert.ok(lines[0].length <= 75);
  // continuation lines start with a single space
  assert.ok(lines.slice(1).every(l => l.startsWith(' ')));
  // unfolding restores the original
  assert.equal(folded.replace(/\r\n /g, ''), long);
  // short lines are untouched
  assert.equal(C.foldICS('SHORT:line'), 'SHORT:line');
});

test('buildEvent: core fields, 2h default duration, alarm', () => {
  const ics = C.buildEvent(game(), { playerName: 'Cameron', now: FIXED_NOW });
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:Curling: Dunblane \(Small Clubs\)/);
  assert.match(ics, /DTSTART:20260908T203000/);
  assert.match(ics, /DTEND:20260908T223000/);      // +120 min
  assert.match(ics, /LOCATION:The Peak\\, Stirling/); // comma escaped per RFC 5545
  assert.match(ics, /DTSTAMP:20260102T030405Z/);
  assert.match(ics, /BEGIN:VALARM[\s\S]*TRIGGER:-PT3H[\s\S]*END:VALARM/);
  assert.match(ics, /UID:fcc-\d+-1-Cameron@falkirkcurling/);
});

test('buildEvent: default location is The Peak and includes a tappable map link', () => {
  const ics = C.buildEvent(game(), { now: FIXED_NOW });
  assert.match(ics, /LOCATION:The Peak\\, Stirling/);
  assert.match(ics, /URL:https:\/\/maps\.app\.goo\.gl\/J6bCU8uT9ptG5qUh6/);
  assert.match(ics, /Map: https:\/\/maps\.app\.goo\.gl\/J6bCU8uT9ptG5qUh6/);
});

test('buildEvent: location and map link are overridable', () => {
  const ics = C.buildEvent(game(), { location: 'Somewhere Else', locationUrl: '', now: FIXED_NOW });
  assert.match(ics, /LOCATION:Somewhere Else/);
  assert.doesNotMatch(ics, /URL:/);
  assert.doesNotMatch(ics, /Map:/);
});

test('buildEvent: custom duration and alarm, teammates in description', () => {
  const ics = C.buildEvent(game(), { playerName: 'X', durationMin: 90, alarmHours: 1, now: FIXED_NOW });
  assert.match(ics, /DTEND:20260908T220000/); // +90 min
  assert.match(ics, /TRIGGER:-PT1H/);
  assert.match(ics, /Team: Ferguson I\\, Gray A/);
});

test('buildEvent: alarmHours=0 omits the VALARM', () => {
  const ics = C.buildEvent(game(), { alarmHours: 0, now: FIXED_NOW });
  assert.doesNotMatch(ics, /VALARM/);
});

test('exportable: only playing games with a date and time', () => {
  assert.equal(C.exportable(game()), true);
  assert.equal(C.exportable(game({ info: { playing: false } })), false);
  assert.equal(C.exportable(game({ fixture: Object.assign(game().fixture, { time: null }) })), false);
});

test('buildCalendar wraps events and filters non-exportable games', () => {
  const games = [
    game(),
    game({ info: { playing: false, status: 'unavailable' } }),          // excluded
    game({ fixture: Object.assign({}, game().fixture, { col: 9, time: null }) }) // excluded (no time)
  ];
  const cal = C.buildCalendar(games, { playerName: 'Cameron', now: FIXED_NOW });
  assert.match(cal, /^BEGIN:VCALENDAR/);
  assert.match(cal, /END:VCALENDAR$/);
  assert.match(cal, /X-WR-CALNAME:Falkirk Curling - Cameron/);
  assert.match(cal, /VERSION:2\.0/);
  // exactly one VEVENT survived the filter
  assert.equal((cal.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('buildCalendar uses CRLF line endings', () => {
  const cal = C.buildCalendar([game()], { now: FIXED_NOW });
  assert.ok(cal.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(cal)); // no bare LF
});

test('eventFileName is filesystem-safe and dated', () => {
  assert.equal(C.eventFileName(game()), 'curling-20260908-dunblane.ics');
});
