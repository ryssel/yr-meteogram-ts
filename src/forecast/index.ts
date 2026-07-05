// Forecast backend registry.
//
// MET Norway is the default (and reference) source. Additional providers
// (e.g. DMI) register here as opt-in choices the user selects via config/UI —
// never a replacement. See docs/pluggable-backend-plan.md. The renderer only
// ever sees ForecastPoint[], so it stays source-agnostic.

import type { ForecastPoint, ForecastProvider } from "./types";
import { met } from "./met";
import { dmi } from "./dmi";

export type { ForecastPoint, ForecastProvider } from "./types";
export * from "./met";
export { dmi } from "./dmi";

// Registered providers, keyed by their config id. MET is the default; DMI (via
// Open-Meteo) is an opt-in alternative. Declaring the object literal (rather
// than annotating it) keeps SourceId a precise union of the actual keys.
export const PROVIDERS = { met, dmi };

export type SourceId = keyof typeof PROVIDERS;
export const DEFAULT_SOURCE: SourceId = "met";

/**
 * Fetch + normalize a forecast from the chosen source.
 *
 * `proxyBase` is the user-provided proxy that injects the source's required
 * auth (MET's User-Agent, DMI's API key, ...). Unknown sources fall back to the
 * default. Returns renderer-ready points.
 */
export async function fetchForecastPoints(
  source: SourceId,
  proxyBase: string,
  lat: number,
  lon: number,
  maxDays: number,
): Promise<ForecastPoint[]> {
  const provider: ForecastProvider = PROVIDERS[source] ?? PROVIDERS[DEFAULT_SOURCE];
  const res = await fetch(provider.requestUrl(proxyBase, lat, lon));
  if (!res.ok) {
    throw new Error(`${provider.label} request failed: ${res.status} ${res.statusText}`);
  }
  return provider.parse(await res.json(), maxDays);
}
