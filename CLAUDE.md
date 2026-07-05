# Project notes for AI coding assistants

This file exists so Claude Code, Copilot, or future-you can pick up this
project without re-deriving the context below. Claude Code reads `CLAUDE.md`
automatically on startup.

## What this is

A small TypeScript/Vite project that draws a scrollable, multi-day meteogram
(temperature line, precipitation bars, wind speed + gusts, weather icons, wind
arrows) in the style of yr.no's forecast graph, using MET Norway's public
Locationforecast API. No charting library — the chart is a hand-built SVG in
`src/meteogram.ts`.

It ships in **two forms from one codebase**:

- **Web app** (`index.html` + `src/`): the standalone Vite dev/demo app.
- **Home Assistant card** (`ha-card/`): a HACS-installable Lovelace custom card
  that **reuses the same `src/forecast.ts` + `src/meteogram.ts`** — single
  source of truth, no duplicated parsing/rendering.

## Key constraints that shaped the design (don't "fix" these)

- **MET Norway's API requires a descriptive `User-Agent` header** identifying
  the app + a contact, or it returns 403. Browsers can't set a custom
  `User-Agent` from client-side JS, so requests must go through a proxy that
  attaches it server-side. Two proxies exist for the two forms:
  - **Web app**: Vite's dev-server proxy (`vite.config.ts`, `/api/forecast`),
    reading `MET_USER_AGENT` from `.env`.
  - **HACS card**: a *user-provided* proxy pointed at by the card's `proxy_url`
    config. Recommended is an NGINX Proxy Manager `location /met/` block that
    injects the header (relative `proxy_url: /met` → same-origin, avoids
    CORS/mixed-content); a Cloudflare Worker also works. See
    `ha-card/README.md`. The card does **not** use `.env`.
  Calling `api.met.no` directly from the browser will 403 / get throttled — the
  proxy is not optional.
- **The web app's User-Agent lives in `.env`** (git-ignored), read via Vite's
  `loadEnv`, so the contact email stays out of git history. `.env.example` is
  the committed template.
- **MET's forecast resolution degrades over time**: hourly (`next_1_hours`) for
  ~2 days, then 6-hourly (`next_6_hours`) out to ~10 days. `toForecastPoints()`
  in `src/forecast.ts` handles both and tags each point `stepHours: 1 | 6`; the
  renderer uses that to size precip bars, space icons/arrows, and horizontally
  compress the 6-hourly tail. Don't assume uniform hourly data. **~10 days is
  MET's own horizon**, not our cap: `toForecastPoints(response, maxDays)` takes a
  required `maxDays` cutoff, and the card passes `MET_MAX_DAYS = 11`
  (`meteogram-card.ts`) — deliberately *above* MET's horizon as a "never-trim"
  sentinel, not a product limit. Raising it shows no more days because MET
  publishes no more data; the card's optional `days` config only trims the tail.
- **Icons are original, hand-drawn SVGs** (`src/icons.ts`), not copies of
  yr.no's/MET's branded set — deliberate, to avoid copyrighted artwork. Check
  license terms before swapping in a real icon set.

## Architecture

```
README.md                     repo landing page — HA-card-first (this is what HACS
                               renders; see the HACS gotcha below). Web-app/dev docs
                               live in DEVELOPMENT.md, not here.
DEVELOPMENT.md                 web-app getting-started, MET-proxy rationale, how the
                               chart works, customizing, and card build/release steps
index.html                    web-app entry point (location/days form + theme toggle)
src/main.ts                    wires the form + dark-mode toggle, calls fetch + render
src/forecast.ts                fetch (/api/forecast) + normalize MET JSON -> ForecastPoint[]
src/meteogram.ts               renderMeteogram(container, points): void — builds the SVG(s)
                               and sets container.innerHTML. Hand-computed dynamic scales,
                               monotone-cubic smoothing, 6-hourly horizontal compression,
                               icons riding the temp line, wind-direction arrow row, and a
                               frozen left-axis overlay. LAYOUT const controls all sizing.
src/icons.ts                   symbol_code -> SVG icon fragment mapping
src/style.css                  web-app chrome + theme vars (light/dark) + .meteogram-scroll
vite.config.ts                 dev-server proxy to api.met.no with the User-Agent
.env / .env.example            MET_USER_AGENT (web app only)

ha-card/src/meteogram-card.ts  the custom element (Shadow DOM). Reuses src/forecast +
                               src/meteogram. Resolves location, fetches via proxy_url,
                               refreshes on a 30-min timer (not on every hass update),
                               preserves scroll across re-renders.
ha-card/manifest.json          card metadata + version (bump this per release)
ha-card/README.md              install (HACS + NGINX proxy), config, troubleshooting
ha-card/images/*.png           light/dark screenshots used in the README
ha-card/dist/                  built bundle (git-ignored; produced by rollup / CI)
rollup.config.js               builds ha-card/dist/meteogram-card.js (self-contained ESM)
hacs.json                      HACS metadata (filename = meteogram-card.js, Dashboard)
.github/workflows/release.yml  on a `v*` tag: build the card and attach the JS to a
                               GitHub Release — which is what HACS downloads
```

The renderer output is `.meteogram-wrap > (.meteogram-scroll > chart SVG) +
overlay SVG`: the inner element scrolls horizontally; the overlay is a sibling
so the left-axis value labels stay frozen while you scroll.

## Home Assistant card & releasing

- **Build locally**: `npm run build:card` (rollup → `ha-card/dist/`). `dist` is
  git-ignored; CI rebuilds it.
- **Release flow**: bump `ha-card/manifest.json` `version`, commit, then
  `git tag vX.Y.Z && git push origin vX.Y.Z`. The Action builds and publishes a
  GitHub Release with `meteogram-card.js` attached; HACS installs that asset.
  (Docs-only or web-app-only changes don't need a tag.)
- **Install**: HACS → Custom repositories → this repo, category **Dashboard**.
- **HACS gotcha — the info page is the root `README.md`**: current HACS renders
  the repo's root `README.md` on the card's information page and **ignores
  `info.md` and `render_readme: false`** (see hacs/integration#3994). We tried an
  `info.md` and it never showed. So the root `README.md` *is* the HACS landing
  page — keep it HA-card-first; developer/web-app docs live in `DEVELOPMENT.md`.
  Don't reintroduce `info.md`. HACS also caches repo metadata: after a docs
  change, an HA restart + browser hard-refresh (or a version bump) is needed
  before the new README shows.
- **Theme**: the card is theme-aware — the SVG and chrome use HA theme vars
  (`--ha-card-background`, `--primary/secondary-text-color`, `--divider-color`,
  `--scrollbar-thumb-color`) so it follows HA light/dark automatically.

## Conventions

- No frontend framework, no charting library — plain TypeScript + hand-built
  SVG. Introducing React/Chart.js/etc. would be a rewrite, not a refactor.
- Data-series colors are CSS custom properties (`--temp`, `--precip`, `--wind`);
  structural colors use HA theme vars with light fallbacks (see Theme above), so
  the same SVG renders correctly in the light web app and in HA dark mode.
- The web app supports dark mode (auto via `prefers-color-scheme`, plus a
  `data-theme` toggle persisted in `localStorage`).
- The `LAYOUT` constant at the top of `meteogram.ts` controls all
  spacing/sizing — change values there rather than hardcoding inline.

## Known rough edges / not yet done

- Day-separator and hour labels use the **browser's** local timezone, not the
  forecast location's. Fine when viewer ≈ location; wrong across timezones.
- No tests.
- Error handling is basic: the card shows an error message and retries on its
  timer; the web app has a generic try/catch. No fetch timeout/abort.
- Icon-to-symbol mapping in `icons.ts` covers the common MET `symbol_code`
  families (clearsky, fair, partlycloudy, cloudy, rain, sleet/snow, thunder,
  fog) but isn't exhaustive; thunder takes priority over rain/sleet.
- The non-linear x-axis (compressed 6-hourly tail) means equal horizontal
  distance ≠ equal time past the transition day — intentional, but worth
  knowing when reading rate-of-change.

## Git / GitHub setup (for context, not something to change)

This repo is pushed to `https://github.com/ryssel/yr-meteogram-ts` under the
personal `ryssel` GitHub account, kept deliberately separate from a work Azure
DevOps identity on the same machine — remote URL has `ryssel@` pinned, and
repo-local `user.email` is the personal address. The repo is **public** (needed
for HACS install). If a push fails with "Repository not found," that's almost
always this account-mismatch issue, not a real missing repo.
```
