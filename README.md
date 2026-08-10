# Falkirk Curling Club — My Fixtures

A tiny, phone-friendly web app that turns the season rota spreadsheet into a clear list of **your** games — and lets you add them to your calendar (iPhone or anything else) in one tap.

No more pinch-zooming across a giant grid to find your name.

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

## How the spreadsheet is read

The app looks for the fixtures grid automatically (the sheet with a row of dates and player names down the left). For each fixture column it reads the **date, time, opposition and competition**; for each player row it reads the marker in each column:

| Marker | Meaning              | Shown as        |
| ------ | -------------------- | --------------- |
| `x`    | Playing              | Playing         |
| `n/a`  | Not available        | Not available   |
| `d`    | Sub asked, declined  | Declined        |
| `?`    | Awaiting response    | Awaiting        |

It handles the quirks in the real sheets — string dates like `Thur 11 Mar`, mid-season year rollovers, the decorative "HOLIDAY BREAK" spacer column, and the summary/total columns — by only treating a column as a fixture if it has a time, opposition or competition.

Only `x` (and subs) count as games you're playing and are eligible for calendar export.

## Running / hosting

It's just static files — no build step, no server code.

**Locally:** open `index.html` in a browser, or run a static server:

```bash
npm start          # serves on http://localhost:4178
```

**Publish it (recommended — GitHub Pages):**

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` / root.
3. Your app is live at `https://<username>.github.io/FalkirkCurlingClub/`.

On your iPhone, open that URL in Safari and **Share → Add to Home Screen** for an app-like icon.

Any other static host works too (Netlify, Vercel, Cloudflare Pages) — just serve the folder.

## Adding to your iPhone calendar — what happens

Tapping **Add to calendar** downloads a `.ics` file. iOS opens it in Apple Calendar and asks which calendar to add to. Times are stored as *local time* (no timezone conversion surprises). If a season's rota is updated, re-upload it and re-export — events have stable IDs per fixture, so most calendars will update rather than duplicate.

## Files

| File            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `index.html`    | Page structure                                                 |
| `styles.css`    | Mobile-first styling                                           |
| `parser.js`     | Pure spreadsheet-parsing logic (shared by app + tests)         |
| `app.js`        | UI, filtering, calendar (`.ics`) generation                    |
| `test-parse.js` | Node test that verifies parsing against a real sample sheet    |

The spreadsheet library ([SheetJS](https://sheetjs.com/)) is loaded from a CDN in `index.html`.

## Tests

`test-parse.js` checks the parser against a local sample spreadsheet (`sample.xlsx`, not committed for privacy — drop your own copy in the folder):

```bash
npm install       # dev-only: xlsx, for the Node test
npm test
```

## Notes / assumptions

- **Location** on calendar events defaults to _Falkirk Curling Club_. Home/away isn't recorded in the rota, so double-check venue for away games.
- **Game length** is assumed to be 2 hours for the calendar block — adjust the event afterwards if needed.
- If a future season changes the spreadsheet layout significantly, the auto-detection may need tweaking in `parser.js` (`findDateRow` / `buildModel`).
