# FRC WikiRun

FRC WikiRun is a local speedrun game for The Blue Alliance. A run starts on one FRC team page and ends when the player reaches the target team page using only links inside the embedded TBA site. Runs are locked to one FRC season, external links are blocked, the Teams tab is blocked, and the app tracks elapsed time plus link count.

## What the App Does

- Starts a full random run by choosing a random FRC season and two teams that both played that season.
- Starts a classic run from two manually entered teams, either in a specific year or in a random shared year.
- Embeds The Blue Alliance through a local proxy so navigation can be restricted and measured.
- Rewrites TBA links so internal navigation stays inside the local app.
- Blocks external links, the Teams tab, search/year controls, and Ctrl+F during active runs.
- Shows an in-run status island with goal team, current team, region, timer, selected year, and link count.
- Saves the last 20 completed runs in browser `localStorage`.

## Tech Stack

- React 19 for the browser UI.
- Vite for local development, bundling, and frontend test config.
- Express 5 for API routes and the TBA HTML proxy.
- The Blue Alliance API for team, event, district, and year metadata.
- Vitest with jsdom for unit tests.

## Project Layout

```text
.
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── frc-wikirun-verification.png
├── src
│   ├── main.jsx
│   ├── game.js
│   └── styles.css
├── server
│   ├── server.js
│   └── tba.js
└── tests
    ├── game.test.js
    └── tba.test.js
```

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Then set `TBA_AUTH_KEY` in `.env` to a The Blue Alliance API key. Random and classic live runs need this key because the server validates teams and seasons against TBA.

```env
TBA_AUTH_KEY=your_tba_key_here
PORT=8787
```

## Running Locally

Start both the Express server and the Vite dev server:

```bash
npm run dev
```

The app runs through Vite at:

```text
http://127.0.0.1:5173
```

The API/proxy server runs at:

```text
http://127.0.0.1:8787
```

Vite forwards `/api/*` and `/proxy` requests to the Express server, so the browser can use one local origin during development.

## Scripts

- `npm run dev` starts the client and server together with `concurrently`.
- `npm run dev:client` starts Vite on `127.0.0.1:5173`.
- `npm run dev:server` starts the Express server with Node watch mode.
- `npm run build` creates the production frontend bundle in `dist/`.
- `npm run start` runs the Express server in production mode and serves `dist/`.
- `npm run test` runs all Vitest unit tests.

## How Runs Work

### Home Screen

`src/main.jsx` renders the main app. When no run is active, it shows:

- A random run button.
- A classic run form with start team, goal team, and optional year.
- The rule list.
- Recent local run history from `localStorage`.

### Random Run Flow

1. The user clicks **Random Run**.
2. `startRandomRun()` calls `GET /api/random-run`.
3. The server picks a random year with `pickRandomYear()`.
4. The server fetches teams for that year from TBA.
5. `pickRandomPlayedRun()` repeatedly chooses two distinct teams until both have event records in that season.
6. District/region data is attached when a TBA auth key is available.
7. The frontend creates a local run object with `createRun()`.
8. The app preloads the starting TBA page in the iframe, shows a countdown, then starts the timer.

### Classic Run Flow

1. The user enters a start team and goal team.
2. The optional year can be left blank.
3. The frontend validates team and year input using helpers from `src/game.js`.
4. `startClassicRun()` calls `GET /api/classic-run`.
5. The server fetches the years both teams participated.
6. If the user supplied a year, the server verifies both teams played an event in that exact year.
7. If the year is blank, the server randomly tries shared years until it finds one where both teams have event records.
8. The returned teams and year become the local run.

### Starting Countdown

Before timing begins, the app loads the starting team page through `/proxy`. This avoids charging the player for initial page load time. The run starts when:

- The iframe reports that the proxied page is ready and the countdown reaches zero, or
- The player clicks the start button, or
- The player presses the spacebar.

### Active Run Tracking

The iframe is pointed at:

```text
/proxy?path=/team/<team>/<year>&year=<year>
```

The Express proxy fetches the real TBA HTML, rewrites it, and injects a small guard script. As the player clicks rewritten TBA links, the guard script posts navigation messages to the parent React app. The parent app calls `advanceRun()` to update:

- Current proxied path.
- Current team, when the path is a team page.
- Link count.
- Completion state.

The run finishes when the current team number equals the target team number. `runResult()` calculates elapsed time and creates a history item.

## Frontend Files

### `src/main.jsx`

This is the React application entrypoint. It owns all UI state:

- Form inputs for team and year.
- Setup/countdown state.
- Active run state.
- Elapsed timer state.
- Local history state.
- Blocked-link warnings.
- Current-team region lookups.

Important pieces:

- `active` is true when a run exists and is not complete.
- `visibleRun` chooses either the active run or the prepared setup run so the iframe can preload.
- `iframeSrc` builds the local proxy URL for the current TBA path.
- Timer state updates every 50 ms while a run is active.
- `handleFramePath()` receives iframe navigation paths and advances the run.
- `handleFrameLoad()` handles iframe load events and abandons the run if the iframe leaves the local proxy.
- The `message` listener accepts navigation, page-load, blocked-link, and blocked-route messages from the injected proxy script.

### `src/game.js`

This file contains pure game-state helpers:

- `formatElapsed(ms)` formats milliseconds as seconds or minutes.
- `normalizeTeamInput(value)` accepts inputs like `254` or `frc254`.
- `normalizeYearInput(value)` accepts blank input or a 4-digit year.
- `teamPath(teamNumber)` creates `/team/<number>`.
- `teamYearPath(teamNumber, year)` creates `/team/<number>/<year>`.
- `proxyUrl(path, year)` creates the local `/proxy` URL.
- `teamFromPath(path)` extracts a team number from TBA team paths.
- `pathFromProxyLocation(href)` reads the proxied TBA path from an iframe URL.
- `createRun(...)` validates teams/year and creates a new run object.
- `advanceRun(run, nextPath)` increments link count and marks the run complete when the target team is reached.
- `runResult(run)` converts a completed run into a saved history item.
- `loadHistory()` and `saveHistory()` read/write recent runs from browser storage.

### `src/styles.css`

This stylesheet defines the full visual system:

- Home layout and top navigation.
- Brand mark and TBA speedrun identity.
- Hero, setup, rules, and history panels.
- Full-screen iframe play view.
- Countdown overlay.
- In-run status island.
- Finish dialog.
- Blocked-route toast.
- Responsive layout for smaller screens.

## Server Files

### `server/server.js`

This is the Express app. It exposes:

- `GET /api/health` for a simple health check.
- `GET /api/random-run` for full random run generation.
- `GET /api/classic-run` for manual-team run generation.
- `GET /api/team-region` for lazy current-team region display.
- `GET /proxy` for fetching, rewriting, and serving TBA HTML.

In production, `server/server.js` also serves the built Vite output from `dist/` and falls back to `index.html` for browser routes.

### `server/tba.js`

This file contains all TBA-specific logic.

Data helpers:

- `SAMPLE_TEAMS` is a small fallback team set for tests and optional sample behavior.
- `normalizeTeamNumber()` parses team numbers.
- `currentFrcYear()`, `isValidFrcYear()`, and `pickRandomYear()` manage season validation.
- `summarizeRegion()` and `normalizeTeam()` convert TBA team/district data into the shape used by the UI.

TBA API helpers:

- `fetchTbaJson()` performs authenticated TBA API requests.
- `fetchTbaTeams()` loads all team pages for a selected year and caches live results.
- `fetchTeamDistrictForYear()` retrieves district metadata.
- `fetchTeamEventsForYear()` retrieves a team's events for a season.
- `teamPlayedInYear()` checks whether a team has event records in a season.
- `fetchTeamWithRegion()` loads team metadata and region display text.
- `fetchCommonYears()` finds seasons shared by two teams.

Run-selection helpers:

- `pickRandomRun()` chooses two distinct teams from a list.
- `requireTeamsPlayedInYear()` verifies both teams have event records in a year.
- `createClassicRun()` builds a manual-team run from either a requested year or a random shared valid year.
- `pickRandomPlayedRun()` retries random team pairs until both played in the selected season.

Proxy helpers:

- `resolveTbaPath()` accepts only paths or URLs from `https://www.thebluealliance.com`.
- `isTeamsTab()` detects the TBA Teams listing.
- `pathMatchesYear()` checks whether an event/team path belongs to the active run year.
- `normalizePathForYear()` rewrites team paths to the active year and rejects invalid year-scoped routes.
- `rewriteTbaHtml()` rewrites the fetched TBA HTML so assets load from TBA, internal links go through `/proxy`, external links are blocked, and the run guard script is injected.
- `fetchTbaPage()` fetches and rewrites a TBA page for the iframe.

## Proxy and Rule Enforcement

The proxy is the core of the game. It prevents the embedded TBA page from acting like a normal unrestricted browser.

When `rewriteTbaHtml()` sees an anchor tag:

- TBA links are rewritten to `/proxy?path=...`.
- Team links are forced into the selected run year.
- External links are replaced with blocked-link markers.
- The Teams tab is replaced with a blocked-route marker.
- Pages that do not match the run year are blocked.
- `target="_blank"` is removed so links stay inside the iframe.

When it sees assets such as CSS, images, scripts, sources, video, audio, or iframe tags:

- Relative TBA asset URLs are converted to absolute TBA URLs.
- This lets the proxied page keep its normal visual styling while navigation remains controlled.

The injected guard script:

- Announces page loads to the parent app.
- Announces valid proxy navigation before the iframe changes pages.
- Blocks Ctrl+F.
- Blocks form submission.
- Disables search and year controls.
- Sends visible warnings for blocked links and blocked routes.

## API Reference

### `GET /api/health`

Returns:

```json
{ "ok": true }
```

### `GET /api/random-run`

Creates a random season/team run.

Requirements:

- `TBA_AUTH_KEY` must be set unless sample fallback behavior is enabled in the server environment.

Returns:

```json
{
  "year": 2025,
  "start": {
    "key": "frc254",
    "team_number": 254,
    "nickname": "The Cheesy Poofs",
    "state_prov": "California",
    "country": "USA",
    "region": "California, USA"
  },
  "target": {
    "key": "frc1678",
    "team_number": 1678,
    "nickname": "Citrus Circuits",
    "state_prov": "California",
    "country": "USA",
    "region": "California, USA"
  }
}
```

### `GET /api/classic-run`

Query parameters:

- `start`: start team number.
- `target`: target team number.
- `year`: optional FRC season.

Example:

```text
/api/classic-run?start=254&target=1678&year=2025
```

Returns the same shape as `/api/random-run`.

### `GET /api/team-region`

Query parameters:

- `team`: team number.
- `year`: FRC season.

Returns normalized team metadata with a `region` field.

### `GET /proxy`

Query parameters:

- `path`: TBA path to fetch.
- `year`: optional run year used for rule enforcement.

Example:

```text
/proxy?path=%2Fteam%2F254%2F2025&year=2025
```

Returns rewritten HTML for iframe display.

## Tests

Run all tests:

```bash
npm run test
```

The test suite covers:

- Team/year input normalization.
- Run creation and completion logic.
- Timer formatting.
- History result generation.
- TBA path parsing.
- Random season selection.
- Team list fetching.
- Missing auth errors.
- Sample-team fallback filtering.
- TBA HTML rewriting.
- External link blocking.
- Teams tab blocking.
- Year-scoped path enforcement.
- Classic run validation.
- Random run retries.

## Production Build

Build the frontend:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

In production mode, Express serves the Vite bundle from `dist/` and continues to provide the same `/api` and `/proxy` routes.

## Environment Variables

- `TBA_AUTH_KEY`: The Blue Alliance API key. Required for live random and classic runs.
- `PORT`: Express server port. Defaults to `8787`.
- `TBA_SAMPLE_FALLBACK`: When set to `1`, lets `/api/random-run` use the bundled sample teams if no TBA auth key is present.
- `NODE_ENV`: When set to `production`, enables static serving from `dist/`.

## Notes and Limitations

- This is a local solo app, not an anti-cheat system.
- It depends on the current HTML structure of The Blue Alliance pages.
- The proxy rewrites ordinary links and assets, but unusual dynamic client-side behavior on TBA may need future handling.
- TBA API rate limits and availability can affect run generation.
- Run history is local to the current browser and is not synced.
