# yr-meteogram-ts

A small, dependency-free TypeScript app that draws a scrollable, multi-day
meteogram (temperature line, precipitation bars, wind speed + gusts) in the
style of yr.no's forecast graph, using MET Norway's public Locationforecast
API.

## Why it's structured this way

MET Norway's API requires a descriptive `User-Agent` header identifying your
app, and rejects requests without one (403). Browsers won't let client-side
JavaScript set that header itself, and calling the API directly from the
browser in production risks throttling since MET can only see your page's
`Origin`, not who you are. So this project routes forecast requests through
Vite's dev server proxy (`vite.config.ts`), which attaches the header
server-side.

The header value itself lives in a local `.env` file (git-ignored), not in
source code, so personal contact info never ends up in your commit history.

## Getting started

```bash
cp .env.example .env
# edit .env and fill in your own contact info
npm install
npm run dev
```

**Before deploying anywhere beyond your own machine**, use a real contact
in `.env`, per [MET's Terms of Service](https://api.met.no/doc/TermsOfService),
and put an equivalent proxy in front of your production server (a tiny
Express/Fastify route, a Cloudflare Worker, whatever you're already using —
the header logic is identical, just read `MET_USER_AGENT` from your host's
environment variables instead of a `.env` file).

Open the printed local URL. Enter a location's latitude/longitude (or click
"Use my location") and pick how many days of forecast to show.

## Home Assistant Integration

Want to use the meteogram as a custom card in Home Assistant? See [ha-card/README.md](ha-card/README.md) for installation and setup.

The card integrates seamlessly into your Home Assistant dashboard and works great on mobile via the Companion app.

## How the chart works

- `src/forecast.ts` fetches the forecast and flattens MET's timeseries into a
  simple `ForecastPoint[]`, preferring hourly (`next_1_hours`) data where
  available and falling back to 6-hourly (`next_6_hours`) data further out —
  MET's own resolution drops off after roughly 2–3 days, which is also why
  yr.no's own meteogram widget only shows ~3 days by default.
- `src/meteogram.ts` renders the chart as a single hand-built SVG string: a
  temperature line and precipitation bars share the top pane (dual y-axis,
  like yr.no), wind speed and gusts (dashed) share the bottom pane, and
  vertical lines mark local midnight with weekday/date labels.
- The SVG is drawn wider than the viewport (based on however many hours of
  data you request) and wrapped in a horizontally scrollable `<div>` — no
  charting library, pinch-zoom, or extra dependency needed for the
  scrolling behavior itself.

## Customizing

- `LAYOUT.pxPerHour` in `meteogram.ts` controls how wide each hour is —
  raise it for a more spread-out chart, lower it to fit more days on screen
  before scrolling.
- Colors are CSS variables (`--temp`, `--precip`, `--wind`) in `style.css`.
- To add sunrise/sunset shading or weather icons per point, `ForecastPoint`
  already carries a MET `symbol_code` (e.g. `partlycloudy_day`) you can map
  to an icon set such as MET's own
  [weathericon set](https://github.com/metno/weathericons).

## Data attribution

Forecast data is from [MET Norway](https://api.met.no/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
