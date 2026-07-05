# Plan: pluggable forecast backend (user-selectable source)

Status: **SHIPPED in v0.3.0** (2026-07-05). MET Norway stays the default and
canonical source; other providers (starting with DMI) are **opt-in choices the
user picks** — never a replacement.

## What shipped (vs. this plan)

- **Phase 1** — provider seam in `src/forecast/` (`types.ts`, `met.ts`,
  `index.ts` + `fetchForecastPoints`). ✅
- **Phase 2** — both entry points route through the registry; card `source?`;
  Vite proxy `/api/forecast` → `/met`; barrel deleted. ✅
- **Phase 3 (DMI)** — done, but via **Open-Meteo's `dmi_harmonie_arome_europe`
  model** (`src/forecast/dmi.ts`), *not* the official DMI EDR API. Open-Meteo is
  keyless + CORS-open, so **Phase 4 (DMI proxy/API key) was avoided entirely** —
  no proxy, no secret. A `requiresProxy` flag on `ForecastProvider` lets the card
  render DMI with no `proxy_url`. WMO `weather_code` → existing MET-style icons. ✅
- **Phase 5** — web-app source `<select>` **and** a Lovelace **visual editor**
  (`<meteogram-card-editor>`, plain-DOM, no `ha-form` dep). ✅
- **Phase 6** — README/DEVELOPMENT/CLAUDE docs + `ha-card/dev.html` test harness;
  released via `v0.3.0-beta.1/.2` → stable **`v0.3.0`**. ✅

**Not done (deliberately):** the official DMI EDR API path (Open-Meteo covered
the need), and a live in-card source toggle for HA (one source per card, set in
config/editor — matches HA conventions). Both remain easy future additions given
the registry design.

The rest of this document is the original plan, kept for reference.

---

## Goal

Let the user choose which forecast data source feeds the meteogram, from a small
set of built-in providers, defaulting to MET Norway. Adding a new source (DMI,
Open-Meteo, …) should be a self-contained module, not a change to the renderer
or the other providers.

## Non-goals

- Not replacing MET. MET is the default and the reference implementation.
- Not a runtime source toggle button on the card (needs multiple proxies
  configured simultaneously). A single configured source per card is enough for
  v1; a live toggle is a possible later extension.
- No changes to `src/meteogram.ts` (the renderer). It already consumes a
  normalized `ForecastPoint[]` and must stay source-agnostic.

## Guiding principles

1. **Renderer untouched.** `renderMeteogram(container, points)` keeps taking
   `ForecastPoint[]`. All source-specific logic lives in the fetch+parse step.
2. **Additive / back-compatible.** `source` defaults to `met`; every existing
   card config and the web app keep working with zero edits.
3. **One normalized contract.** Every provider must produce `ForecastPoint[]`.
   If a source lacks a field the renderer uses (e.g. a weather symbol), the
   provider synthesizes it or emits `null`, and the renderer tolerates `null`.
4. **One source ⇒ one proxy.** Each source needs its own proxy/secret (MET
   injects a `User-Agent`; DMI injects an API key). Selecting a source implies
   its matching `proxy_url`.

## Architecture

### Data flow

```
config.source ─┐
               ▼
   PROVIDERS[source] ──requestUrl()──► fetch(proxyBase + path)
        │                                      │
        │◄─────────── raw JSON ────────────────┘
        ▼
     parse(raw, maxDays) ──► ForecastPoint[] ──► renderMeteogram()
     (MET or DMI specific)     (single contract)     (unchanged)
```

### Provider interface

```ts
// src/forecast/types.ts   (ForecastPoint moves here unchanged)
export interface ForecastProvider {
  readonly id: string;        // 'met' | 'dmi'
  readonly label: string;     // 'MET Norway' | 'DMI (Denmark)'  ← shown in UI
  /** Build the request URL from the user's proxy base + coords. */
  requestUrl(proxyBase: string, lat: number, lon: number): string;
  /** Normalize the raw response into renderer-ready points. */
  parse(raw: unknown, maxDays: number): ForecastPoint[];
}
```

```ts
// src/forecast/index.ts   (registry + single call site)
export const PROVIDERS = { met, dmi } as const;
export type SourceId = keyof typeof PROVIDERS;
export const DEFAULT_SOURCE: SourceId = "met";

export async function fetchForecast(
  source: SourceId, proxyBase: string, lat: number, lon: number, maxDays: number,
): Promise<ForecastPoint[]> {
  const p = PROVIDERS[source] ?? PROVIDERS[DEFAULT_SOURCE];
  const res = await fetch(p.requestUrl(proxyBase, lat, lon));
  if (!res.ok) throw new Error(`${p.label} request failed: ${res.status}`);
  return p.parse(await res.json(), maxDays);
}
```

### Target file layout

```
src/forecast/
  types.ts     ForecastPoint + ForecastProvider          (contract)
  met.ts       MET provider (today's MetResponse + toForecastPoints, moved)
  dmi.ts       DMI provider (CoverageJSON parse + symbol synthesis)
  index.ts     PROVIDERS registry + fetchForecast()
src/forecast.ts   thin re-export of the folder for back-compat (or removed)
src/meteogram.ts  UNCHANGED
```

## Current state (baseline to refactor from)

- `src/forecast.ts` exports `ForecastPoint`, `MetResponse`,
  `toForecastPoints(response, maxDays)`, and `fetchForecast(lat, lon)` (web-app
  path via `/api/forecast`).
- `ha-card/src/meteogram-card.ts` builds its own endpoint from `proxy_url`,
  fetches, calls `toForecastPoints`, then `renderMeteogram`.
- `src/main.ts` (web app) uses `fetchForecast` → `toForecastPoints` →
  `renderMeteogram`.
- `renderMeteogram` uses `stepHours` (bar width / 6-hourly compression) and
  `symbol` (icons via `src/icons.ts`).

## Phased implementation

Each phase is independently shippable; the DMI-specific work is deferred so the
seam can land with zero behavior change.

### Phase 1 — Introduce the provider seam (MET only, no behavior change)
- Create `src/forecast/{types,met,index}.ts`.
- Move `ForecastPoint` → `types.ts`; move `MetResponse` + `toForecastPoints`
  logic into `met.ts` as `met.parse`; add `met.requestUrl`.
- Add `PROVIDERS`, `SourceId`, `DEFAULT_SOURCE`, `fetchForecast(...)` in
  `index.ts`.
- Keep `src/forecast.ts` as a re-export so nothing else breaks yet.
- **Verify:** web app + card render identically. Unit-check `met.parse` against a
  saved MET sample. **Shippable** (docs-only from the user's view; optional bump).

### Phase 2 — Route both entry points through `fetchForecast` (still MET)
- Card: add `source?: SourceId` to `CardConfig` (default `met`); replace the
  inline fetch+`toForecastPoints` with `fetchForecast(source, proxyBase, …)`.
- Web app: `main.ts` calls the new `fetchForecast` signature.
- **Verify:** identical output; `source: met` and omitted-source both work.
  **Shippable** — this is the real refactor, still MET-only. Suggest a patch bump.

### Phase 3 — DMI provider
- `dmi.ts`: `requestUrl` → EDR `position` query on `opendataapi.dmi.dk`;
  `parse` → walk CoverageJSON (`domain.axes.t.values` + per-parameter `ranges`)
  into `ForecastPoint[]`. All points `stepHours: 1` (HARMONIE is hourly, ~2–3 d).
- **Symbol synthesis:** derive a `symbol_code`-like value from cloud fraction +
  precipitation + day/night, or emit `symbol: null`.
- **Icons null-tolerance:** ensure `renderMeteogram` / `icons.ts` skip the icon
  when `symbol` is `null` or unmapped (audit current behavior first).
- Register `dmi` in `PROVIDERS`.
- **Verify:** point in DK renders a (short) chart; null symbols don't crash.

### Phase 4 — Proxies & secrets for DMI
- Web app: add a `/dmi` route to Vite's dev proxy injecting `DMI_API_KEY`
  (read from `.env`, add to `.env.example`).
- HA card: document a `/dmi` NGINX/CF-Worker proxy that injects the API key
  (parallel to the existing `/met` block).
- **Verify:** DMI request returns data through the proxy, not a 401/403.

### Phase 5 — Let the user choose in the UI
- Web app: `<select id="source">` in `index.html`; `main.ts` reads it and passes
  it to `fetchForecast`. Populate options from `PROVIDERS` (`id` + `label`).
- HA card: `source` is YAML today; optional polish is a visual dropdown via
  `static getConfigElement()` (the card has no editor yet — separate task).
- **Verify:** switching the selector re-fetches from the chosen source.

### Phase 6 — Docs & release
- README/DEVELOPMENT/ha-card README: document `source`, the DMI proxy, and that
  DMI is short-range (~2–3 days) vs MET's ~10.
- Note the trade-offs so users pick deliberately.
- Bump `ha-card/manifest.json`, tag, release.

## Key gotchas / risks

- **DMI has no weather symbol.** Biggest lift: synthesize icons from raw params,
  and make the renderer tolerate `null` symbols. (MET-only assumption today.)
- **Short horizon.** DMI HARMONIE is ~2–3 days, all hourly — the 6-hourly
  compression never triggers and the card is short. This is *why* it's an option,
  not a default; call it out in the UI/docs.
- **Per-source proxy/secret.** Choosing DMI requires a separate proxy that
  injects the API key; there is no `.env` on the card side, so it's the user's
  proxy responsibility (same model as MET).
- **DMI endpoint migration.** Target `opendataapi.dmi.dk`; the old
  `dmigw.govcloud.dk` retires **2026-06-30**.
- **CoverageJSON parsing.** More involved than MET's flat timeseries; verify the
  exact axis/range structure against live DMI responses before trusting the shape.

## Back-compat & rollout

- `source` defaults to `met`; `proxy_url` semantics unchanged ⇒ existing configs
  untouched.
- DMI is purely additive; can ship Phases 1–2 (the seam) without any DMI code.

## Open questions

- Do we want a live in-card source toggle later (needs both proxies configured)?
- Symbol synthesis fidelity: how close to MET's `symbol_code` families do we try
  to get, vs. a coarse clear/cloud/rain mapping?
- Add a third provider (Open-Meteo) as a no-key option to validate the
  abstraction? Open-Meteo needs no proxy at all, which would also exercise the
  "no secret" path.

## Verification per phase

Prefer a saved-sample unit check for each `parse` (MET sample already available;
capture a DMI CoverageJSON sample in Phase 3) plus an end-to-end render in the
web app before each release.
