// Shared contract between forecast sources and the renderer.
//
// The renderer (src/meteogram.ts) only ever sees ForecastPoint[]; it never
// learns which source produced them. Adding a new backend means implementing
// ForecastProvider — see docs/pluggable-backend-plan.md.

// Normalized point the renderer works with, independent of which source or
// resolution (hourly vs 6-hourly) the step came from.
export interface ForecastPoint {
  time: Date;
  stepHours: 1 | 6;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  /** Direction the wind blows FROM, in degrees (0 = north, 90 = east). */
  windDirection: number | null;
  symbol: string | null;
}

// A pluggable forecast source. Each provider knows how to build its request
// URL (against a user-provided proxy that injects the source's required auth)
// and how to normalize its raw response into ForecastPoint[].
export interface ForecastProvider {
  /** Stable id used in config (e.g. the card's `source:` option). */
  readonly id: string;
  /** Human-readable name shown in source pickers. */
  readonly label: string;
  /**
   * Whether requestUrl needs a user-provided proxy base to inject auth (a
   * User-Agent, API key, ...). Keyless, CORS-open sources set this false and
   * are called directly (proxyBase is ignored) — so the card doesn't demand a
   * proxy_url for them.
   */
  readonly requiresProxy: boolean;
  /** Build the request URL from a proxy base + coordinates. */
  requestUrl(proxyBase: string, lat: number, lon: number): string;
  /** Normalize the raw JSON response into renderer-ready points. */
  parse(raw: unknown, maxDays: number): ForecastPoint[];
}
