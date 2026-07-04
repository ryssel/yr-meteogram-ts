# Project notes for AI coding assistants

This file exists so Claude Code, Copilot, or future-you can pick up this
project without re-deriving the context below. Claude Code reads `CLAUDE.md`
automatically on startup.

## What this is

A small TypeScript/Vite app that draws a scrollable, multi-day meteogram
(temperature line, precipitation bars, wind speed + gusts, weather icons) in
the style of yr.no's forecast graph, using MET Norway's public
Locationforecast API. No charting library — the chart is a hand-built SVG
string in `src/meteogram.ts`.

## Key constraints that shaped the design (don't "fix" these)

- **MET Norway's API requires a `User-Agent` header** identifying the app +
  a contact, or it returns 403. Browsers can't set a custom `User-Agent`
  from client-side JS, so requests go through Vite's dev-server proxy
  (`vite.config.ts`, the `/api/forecast` proxy), which attaches the header
  server-side. This is *not* optional — removing the proxy and calling
  `api.met.no` directly from the browser will break with 403 or get
  throttled per MET's own docs.
- **The User-Agent value lives in `.env`** (git-ignored), read via Vite's
  `loadEnv`, specifically so the contact email doesn't end up in git
  history. `.env.example` is the committed template. If `.env` is missing,
  `vite.config.ts` logs a warning and falls back to a clearly-broken
  placeholder string (intentional, so failures are obvious).
- **MET's forecast resolution degrades over time**: hourly (`next_1_hours`)
  for roughly the first 2–3 days, then 6-hourly (`next_6_hours`) beyond
  that. `src/forecast.ts`'s `toForecastPoints()` already handles both and
  tags each point with `stepHours: 1 | 6` — the renderer uses that to size
  precipitation bars and icon spacing correctly. Don't assume uniform
  hourly data across the whole range.
- **Icons are original, hand-drawn SVGs** (`src/icons.ts`), not copies of
  yr.no's or MET's own icon set — deliberate, to avoid reproducing
  copyrighted/branded artwork. If you swap in a real icon set (e.g. MET's
  own [weathericons](https://github.com/metno/weathericons)), check its
  license terms first.

## Architecture

```
index.html          entry point, has the location/days form
src/main.ts          wires up the form, calls fetch + render
src/forecast.ts       fetches from /api/forecast, normalizes MET's JSON
                       into ForecastPoint[]
src/meteogram.ts      pure function: ForecastPoint[] -> SVG string
                       (temp line, precip bars, wind lines, day separators,
                       icon row, axes — all hand-computed scales, no lib)
src/icons.ts          symbol_code -> SVG icon fragment mapping
src/style.css         page chrome + .meteogram-scroll { overflow-x: auto }
                       (this is what makes it "scrollable" — the SVG is
                       rendered wider than the viewport)
vite.config.ts        dev-server proxy to api.met.no with the User-Agent
.env / .env.example   MET_USER_AGENT
```

There's no backend/server component beyond the Vite dev proxy. For a real
deployment, that proxy logic needs an equivalent (a tiny server route,
Cloudflare Worker, etc.) — see the "not yet done" list below.

## Conventions used so far

- No frontend framework, no charting library — plain TypeScript + hand-built
  SVG. This was a deliberate choice for full control over the yr.no-style
  look; if you introduce React/Chart.js/etc. later, that's a rewrite, not a
  refactor — flag it as such.
- Colors are CSS custom properties (`--temp`, `--precip`, `--wind` in
  `style.css`) referenced directly inside the SVG string via `var(...)`.
- `LAYOUT` constant at the top of `meteogram.ts` controls all spacing/sizing
  — change values there rather than hardcoding new numbers inline.

## Known rough edges / not yet done

- Day-separator and label logic in `meteogram.ts` uses the *browser's*
  local timezone, not the forecast location's timezone. Fine for local use,
  wrong if the viewer and the forecast location are in different timezones.
- No loading skeleton beyond a plain "Loading forecast…" text.
- No error handling for malformed/partial API responses beyond a generic
  try/catch in `main.ts`.
- No tests.
- No production deployment path yet — the MET proxy only exists in Vite's
  dev server. Needs a real server-side proxy before hosting this anywhere
  public.
- Icon-to-symbol mapping in `icons.ts` covers the common MET symbol_code
  families (clearsky, fair, partlycloudy, cloudy, rain, sleet/snow,
  thunder, fog) but isn't exhaustive against MET's full symbol list.

## Git / GitHub setup (for context, not something to change)

This repo is pushed to `https://github.com/ryssel/yr-meteogram-ts` under
the personal `ryssel` GitHub account, kept deliberately separate from a
work Azure DevOps identity on the same machine — remote URL has `ryssel@`
pinned, and repo-local `user.email` is set to the personal address. If a
push ever fails with "Repository not found," that's almost always this
account-mismatch issue, not a real missing repo.
