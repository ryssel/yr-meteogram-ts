// MET Norway Locationforecast provider — the default (and reference) source.
//
// Minimal typing of the "complete" response; only the fields the meteogram
// actually uses. Full schema:
// https://api.met.no/weatherapi/locationforecast/2.0/documentation

import type { ForecastPoint, ForecastProvider } from "./types";

export interface MetInstantDetails {
  air_temperature?: number;
  wind_speed?: number;
  wind_speed_of_gust?: number;
  wind_from_direction?: number;
  relative_humidity?: number;
}

export interface MetPrecipDetails {
  precipitation_amount?: number;
}

export interface MetSummary {
  symbol_code: string;
}

export interface MetTimeStep {
  time: string;
  data: {
    instant: { details: MetInstantDetails };
    next_1_hours?: { summary: MetSummary; details: MetPrecipDetails };
    next_6_hours?: { summary: MetSummary; details: MetPrecipDetails };
  };
}

export interface MetResponse {
  properties: {
    timeseries: MetTimeStep[];
  };
}

/**
 * Flattens the MET Norway timeseries into a list of ForecastPoints.
 * Prefers next_1_hours (available for roughly the first 2-3 days) and falls
 * back to next_6_hours for the remainder of the requested range, mirroring how
 * yr.no's own meteogram degrades resolution over time.
 */
export function toForecastPoints(response: MetResponse, maxDays: number): ForecastPoint[] {
  const cutoff = Date.now() + maxDays * 24 * 60 * 60 * 1000;
  const points: ForecastPoint[] = [];

  for (const step of response.properties.timeseries) {
    const time = new Date(step.time);
    if (time.getTime() > cutoff) break;

    const instant = step.data.instant.details;
    const hourly = step.data.next_1_hours;
    const sixHourly = step.data.next_6_hours;

    if (hourly) {
      points.push({
        time,
        stepHours: 1,
        temperature: instant.air_temperature ?? null,
        precipitation: hourly.details.precipitation_amount ?? null,
        windSpeed: instant.wind_speed ?? null,
        windGust: instant.wind_speed_of_gust ?? null,
        windDirection: instant.wind_from_direction ?? null,
        symbol: hourly.summary.symbol_code,
      });
    } else if (sixHourly) {
      points.push({
        time,
        stepHours: 6,
        temperature: instant.air_temperature ?? null,
        precipitation: sixHourly.details.precipitation_amount ?? null,
        windSpeed: instant.wind_speed ?? null,
        windGust: instant.wind_speed_of_gust ?? null,
        windDirection: instant.wind_from_direction ?? null,
        symbol: sixHourly.summary.symbol_code,
      });
    }
  }

  return points;
}

export const met: ForecastProvider = {
  id: "met",
  label: "MET Norway",
  requiresProxy: true, // needs a proxy to inject MET's required User-Agent
  requestUrl(proxyBase, lat, lon) {
    // proxyBase maps to api.met.no; append the locationforecast path + coords.
    return `${proxyBase}/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;
  },
  parse(raw, maxDays) {
    return toForecastPoints(raw as MetResponse, maxDays);
  },
};
