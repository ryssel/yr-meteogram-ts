// Barrel for the forecast backend.
//
// The implementation moved into src/forecast/ (a pluggable provider registry —
// see docs/pluggable-backend-plan.md). This file preserves the original
// "./forecast" import path for existing consumers (the card, the web app, the
// renderer) and hosts the web app's dev-proxy fetch. Note: `./forecast`
// resolves to this file, not the folder's index.ts (files win over dirs).

import type { MetResponse } from "./forecast/met";

export * from "./forecast/index";

/**
 * Web-app fetch: hits Vite's dev-server proxy (/api/forecast), which attaches
 * MET's required User-Agent server-side, and returns the raw MET response.
 * (The card fetches via its own proxy_url instead; the source-agnostic path is
 * the registry's fetchForecastPoints.)
 */
export async function fetchForecast(lat: number, lon: number): Promise<MetResponse> {
  const url = `/api/forecast?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Forecast request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as MetResponse;
}
