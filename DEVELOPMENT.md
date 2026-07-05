# Development

Developer / web-app guide for **yr-meteogram-ts**. For *installing* the Home
Assistant card, see the [root README](README.md) and
[`ha-card/README.md`](ha-card/README.md) instead.

## Web app: getting started

```bash
cp .env.example .env
# edit .env and fill in your own contact info
npm install
npm run dev
```

Open the printed local URL. Enter a location's latitude/longitude (or click
"Use my location"), pick how many days to show, and use the 🌙 / ☀️ button to
switch theme.

## The MET proxy (why it's structured this way)

MET Norway's API requires a descriptive `User-Agent` header identifying your
app, and rejects requests without one (403). Browsers won't let client-side
JavaScript set that header itself, so forecast requests are routed through a
proxy that attaches it server-side:

- **Web app**: Vite's dev-server proxy (`vite.config.ts`), reading
  `MET_USER_AGENT` from a local git-ignored `.env` (so personal contact info
  never ends up in your commit history).
- **Home Assistant card**: a small proxy you point it at (e.g. an NGINX Proxy
  Manager location, or a Cloudflare Worker) — see
  [`ha-card/README.md`](ha-card/README.md).

**Before deploying the web app beyond your own machine**, use a real contact in
`.env` per [MET's Terms of Service](https://api.met.no/doc/TermsOfService), and
put an equivalent proxy in front of your production server (the header logic is
identical — just read `MET_USER_AGENT` from your host's environment).

## How the chart works

- `src/forecast.ts` fetches the forecast and flattens MET's timeseries into a
  simple `ForecastPoint[]`, tagging each point `stepHours: 1 | 6`. MET serves
  hourly (`next_1_hours`) data for ~2 days, then 6-hourly (`next_6_hours`) out
  to ~10 days.
- `src/meteogram.ts` renders the chart as a hand-built SVG:
  - **Top pane**: temperature line + precipitation bars (dual y-axis, like
    yr.no), with weather icons riding just above the temperature line.
  - **Bottom pane**: wind speed (solid) and gusts (dashed), with a row of
    wind-direction arrows beneath.
  - Lines are smoothed with monotone-cubic interpolation (smooth but never
    overshoots the data). The y-axes scale dynamically to the data range, and
    their value labels stay **frozen** on the left while you scroll.
  - The 6-hourly long-range tail is **compressed** horizontally so the whole
    forecast is scannable without endless scrolling; the hourly region and the
    transition day stay full width.
- The SVG is drawn wider than the viewport and wrapped in a horizontally
  scrollable container — no charting library needed for the scrolling.

Both forms share `src/forecast.ts` + `src/meteogram.ts` as the single source of
truth for parsing and rendering — there's no duplicated chart code.

## Customizing

- `LAYOUT` at the top of `meteogram.ts` controls all spacing/sizing —
  `pxPerHour` (hourly width), `pxPerHourLong` (compressed 6-hourly width), pane
  tick spacing, etc.
- Data-series colors are CSS variables (`--temp`, `--precip`, `--wind`);
  structural colors use theme variables with light fallbacks, so the same SVG
  renders correctly in light and dark.
- Weather icons are original hand-drawn SVGs in `src/icons.ts`, mapped from
  MET's `symbol_code`. The mapping covers the common families; extend it there
  if you need MET's rarer codes.

## Testing the card without Home Assistant

`ha-card/dev.html` is a dev-only harness that mounts the real `<meteogram-card>`
custom element with a stub `hass`, so you can iterate on card-specific code
(config handling, sources, scroll, sizing) in seconds instead of round-tripping
through Home Assistant. Run `npm run dev` and open:

```
http://localhost:5174/ha-card/dev.html   (port may vary)
```

It renders two cards — a MET card (`proxy_url: /met`) and a DMI card
(`source: dmi`, no proxy) — using a minimal `hass` and hardcoded HA theme vars.
The file is dev-server-only (not part of `vite build` or the card bundle) and
never ships. Edit the `mount(...)` calls at the bottom to try other configs.

Caveat: the stub `hass` and fake theme vars make this a good first-pass check,
**not** a substitute for verifying in a real Home Assistant instance (actual
theme integration, HA card sizing) before a release.

## Building & releasing the Home Assistant card

```bash
npm run build:card          # builds ha-card/dist/meteogram-card.js
npm run build:card:watch    # rebuild on change
```

Releases are published by bumping `ha-card/manifest.json` `version`, committing,
then tagging:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

A GitHub Action builds the card and attaches `meteogram-card.js` to a GitHub
Release, which is what HACS downloads. (Docs-only or web-app-only changes don't
need a tag.)

## Data attribution

Forecast data from [MET Norway](https://api.met.no/), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
