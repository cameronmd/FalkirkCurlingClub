# Falkirk Curling Club — My Fixtures

A tiny, phone-friendly web app that turns the season rota spreadsheet into a clear list of **your** games — and lets you add them to your calendar (iPhone or anything else) in one tap.

No more pinch-zooming across a giant grid to find your name.

[![CI & Deploy](https://github.com/cameronmd/FalkirkCurlingClub/actions/workflows/deploy.yml/badge.svg)](https://github.com/cameronmd/FalkirkCurlingClub/actions/workflows/deploy.yml)

**Live app:** https://cameronmd.github.io/FalkirkCurlingClub/

---

## Contents

- [What it does](#what-it-does)
- [Quick start (use it now)](#quick-start-use-it-now)
- [How the spreadsheet is read](#how-the-spreadsheet-is-read)
- [Architecture](#architecture)
- [Running locally](#running-locally)
- [Testing](#testing)
- [CI/CD & deployment](#cicd--deployment)
- [Adding to your iPhone](#adding-to-your-iphone)
- [Notes & assumptions](#notes--assumptions)

---

## What it does

1. **Upload** the season rota spreadsheet (`.xlsx`) — the "Rota by Player" grid.
2. **Pick your name** from the list.
3. **See your games** as clean cards, sorted by date: opposition, time, competition, and the week.
4. **Add to your calendar** — a single game, or all of them at once, as a standard `.ics` file. On iPhone this opens Apple Calendar with an "Add All" prompt. Each event gets a 3-hour-before reminder and a 2-hour duration.

### Nice extras

- **Runs entirely in your browser.** The spreadsheet is read on your device and never uploaded anywhere.
- **Remembers** your uploaded rota and your name, so next time you just open it and your games are there.
- **Team view** — tap _Team_ on any game to see who else from the club is playing that day (you're highlighted).
- **Filters** — show/hide games you're marked _N/A_ for, and hide games that have already passed.
- **Next game** shown at a glance.

---

## Quick start (use it now)

Open the [live app](https://cameronmd.github.io/FalkirkCurlingClub/) (or `index.html` locally), tap **Upload the season rota**, choose the `.xlsx`, then pick your name. That's it.

---

## How the spreadsheet is read

The app auto-detects the fixtures grid — the sheet with a row of dates and player names down the left. It doesn't rely on hard-coded cell positions, so it survives small layout changes between seasons.

For each **fixture column** it reads the date, time, opposition and competition. For each **player row** it reads the marker in each column:

| Marker | Meaning              | Shown as        | Counts as playing? |
| ------ | -------------------- | --------------- | ------------------ |
| `x`    | Playing              | Playing         | ✅ yes             |
| `sub`  | Subbed in            | Sub (playing)   | ✅ yes             |
| `n/a`  | Not available        | Not available   | no                 |
| `d`    | Sub asked, declined  | Declined        | no                 |
| `?`    | Awaiting response    | Awaiting        | no                 |

Only games you're playing (`x` / `sub`) are counted and eligible for calendar export.

It also handles the real-world quirks in the club sheets:

- **String dates** like `Thur 11 Mar` (parsed using the season's year).
- **Mid-season year rollover** — a year is inferred from the surrounding date cells.
- **The decorative "HOLIDAY BREAK" spacer column** and the **summary/total columns** (Games / SUB / TOTAL) — ignored, because a column only counts as a fixture if it has a time, opposition or competition.
- **The legend/key rows** at the bottom — player parsing stops at the first blank name.

If a future season changes the layout dramatically, the detection lives in [`parser.js`](parser.js) (`findDateRow` / `buildModel`) and is covered by tests.

---

## Architecture

Plain HTML/CSS/vanilla JS — **no framework, no build step**. Logic is split into small pure modules (usable in both the browser and Node, so they're unit-testable) plus a thin DOM layer.

| File            | Responsibility                                                        | Pure? |
| --------------- | --------------------------------------------------------------------- | :---: |
| `index.html`    | Page structure, loads scripts                                         |  —    |
| `styles.css`    | Mobile-first styling                                                  |  —    |
| `parser.js`     | Spreadsheet → data model (fixtures + players + markers)               |  ✅   |
| `fixtures.js`   | Marker meaning, per-player game filtering/sorting, teammates          |  ✅   |
| `calendar.js`   | `.ics` generation (RFC 5545: floating local time, folding, VALARM)    |  ✅   |
| `app.js`        | UI glue — DOM rendering, events, persistence, file handling           |  —    |

```
 spreadsheet ──▶ parser.js ──▶ model ──▶ fixtures.js ──▶ games ──▶ app.js ──▶ DOM
                                            │                        │
                                            └────────────────────────┴──▶ calendar.js ──▶ .ics
```

Each pure module uses a small UMD wrapper: it attaches to `window` in the browser (`FCCParser`, `FCCFixtures`, `FCCCalendar`) and exports via `module.exports` under Node. The spreadsheet library ([SheetJS](https://sheetjs.com/)) is loaded from a CDN in `index.html`.

**Data model** (produced by `parser.js`):

```js
{
  season: '2026/27',
  fixtures: [
    { col: 1, date: Date, time: { h: 20, m: 30 },
      opposition: 'Dunblane', competition: 'Small Clubs', week: 'Week 1', rawDate: '…' },
    // …
  ],
  players: [
    { name: 'Matheson-Dear C', markers: { 2: 'x', 3: 'n/a' } },
    // …
  ]
}
```

---

## Running locally

It's just static files. Either open `index.html` directly, or serve the folder:

```bash
npm start          # serves on http://localhost:4178
```

(`npm start` uses `npx http-server`; any static server works.)

---

## Testing

Unit tests use Node's **built-in test runner** — no dependencies, no install:

```bash
npm test           # runs node --test over the test/ folder
```

Covers:

- **`test/parser.test.js`** — header-row detection, fixture/column extraction, summary & spacer-column exclusion, date parsing (real dates, `dd/mm`, `11 Mar` + year inference), time parsing, player-row boundaries, legend exclusion.
- **`test/fixtures.test.js`** — marker mapping, filtering (playing / N/A / hide-past), date sorting, teammates, next game.
- **`test/calendar.test.js`** — title formatting, ICS escaping, floating-local-time output, RFC 5545 line folding, event fields (duration, alarm, UID, teammates), calendar wrapping/filtering, CRLF endings, filenames.

There's also an **optional integration test** that runs the parser against a real spreadsheet:

```bash
npm install            # dev-only: xlsx
npm run test:integration
```

It expects a `sample.xlsx` in the project root. That file is **git-ignored** (it contains real club data) — drop your own copy in to run it. The unit tests above are fully hermetic and need no spreadsheet.

---

## CI/CD & deployment

A single GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) does both:

1. **`test`** job — runs `node --test` on every push and pull request.
2. **`deploy`** job — runs only on `main`, only after tests pass. It stages the static files, uploads them as a Pages artifact, and deploys.

The workflow enables GitHub Pages automatically on first run (`configure-pages` with `enablement: true`), so there's no manual repo setting to click. Every push to `main` redeploys in under a minute.

> **Note:** GitHub Pages on a free plan requires a **public** repository. Only source code is published — no rota or personal data is ever committed.

**If the first deploy fails** with a Pages-not-enabled error (some accounts restrict automatic enablement), enable it once by hand: **Settings → Pages → Build and deployment → Source → GitHub Actions**, then re-run the workflow.

**Other static hosts** (Netlify, Cloudflare Pages, Vercel) work too — just serve the repo root; there's nothing to build.

---

## Adding to your iPhone

Tapping **Add to calendar** downloads a `.ics` file; iOS opens it in Apple Calendar and asks which calendar to add to. Times are stored as *floating local time*, so there are no timezone surprises.

For an app-like experience: open the live URL in **Safari → Share → Add to Home Screen**. You'll get an icon on your home screen that opens the app full-screen.

If a season's rota is updated, re-upload it and re-export — events use stable IDs per fixture, so most calendars update the existing entry rather than creating a duplicate.

---

## Notes & assumptions

- **Location** on calendar events defaults to _The Peak, Stirling_ (the home ice), with a tappable Google Maps link in the event notes. Home/away isn't recorded in the rota, so double-check the venue for away games. (Configurable via `CAL_OPTS` at the top of [`app.js`](app.js).)
- **Game length** is 2 hours for the calendar block — adjust the event afterwards if needed. (Also in `CAL_OPTS`.)
- **Reminder** defaults to 3 hours before the game.
- **Internet on first load** is needed to fetch the SheetJS library from its CDN (you'd have it anyway to open a hosted page). It could be vendored into the repo for full offline use if ever wanted.

## Licence

MIT — see [`package.json`](package.json).
