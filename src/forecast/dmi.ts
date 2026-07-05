// DMI provider (via Open-Meteo) — an opt-in alternative to MET Norway.
//
// Open-Meteo serves DMI's HARMONIE-AROME model and is CORS-open + keyless, so
// the browser calls it directly (no proxy, no API key — proxyBase is ignored).
// This is a short-range model (~2.5 days, hourly). See
// docs/pluggable-backend-plan.md.

import type { ForecastPoint, ForecastProvider } from "./types";

interface OpenMeteoResponse {
  hourly?: {
    time?: number[]; // unix seconds (timeformat=unixtime)
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    weather_code?: (number | null)[];
    is_day?: (number | null)[];
  };
}

// Map a WMO weather code (Open-Meteo `weather_code`) to a MET-style symbol_code
// the icon set understands (src/icons.ts). `isDay` (1/0) picks the _day/_night
// variant for sky-dependent icons; codes that don't vary ignore the suffix.
function wmoToSymbol(code: number | null | undefined, isDay: number | null | undefined): string | null {
  if (code == null) return null;
  const suffix = isDay === 0 ? "_night" : "_day";
  switch (code) {
    case 0: return "clearsky" + suffix;
    case 1: return "fair" + suffix;
    case 2: return "partlycloudy" + suffix;
    case 3: return "cloudy";
    case 45:
    case 48: return "fog";
    case 80:
    case 81:
    case 82: return "rainshowers" + suffix; // showers → sun/moon + cloud + rain
    case 51: case 53: case 55: // drizzle
    case 61: case 63: case 65: return "rain"; // rain
    case 56: case 57: // freezing drizzle
    case 66: case 67: return "sleet"; // freezing rain
    case 71: case 73: case 75: case 77: // snow
    case 85: case 86: return "snow"; // snow showers
    case 95: case 96: case 99: return "thunderstorm"; // thunder takes priority
    default: return "cloudy";
  }
}

export const dmi: ForecastProvider = {
  id: "dmi",
  label: "DMI (via Open-Meteo)",
  requiresProxy: false, // Open-Meteo is keyless + CORS-open; called directly
  requestUrl(_proxyBase, lat, lon) {
    // proxyBase is ignored — Open-Meteo needs no proxy/key. Pull the genuine DMI
    // HARMONIE-AROME model; unixtime keeps timestamps in UTC (matching MET), and
    // wind_speed_unit=ms matches the renderer's expectation.
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly:
        "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,is_day",
      models: "dmi_harmonie_arome_europe",
      wind_speed_unit: "ms",
      timeformat: "unixtime",
      forecast_days: "3", // model horizon is ~2.5 days
    });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  },
  parse(raw, maxDays) {
    const h = (raw as OpenMeteoResponse).hourly;
    const times = h?.time ?? [];
    const cutoff = Date.now() + maxDays * 24 * 60 * 60 * 1000;
    const points: ForecastPoint[] = [];

    for (let i = 0; i < times.length; i++) {
      const time = new Date(times[i] * 1000);
      if (time.getTime() > cutoff) break;

      const temperature = h?.temperature_2m?.[i] ?? null;
      if (temperature === null) continue; // skip any padding beyond the model horizon

      points.push({
        time,
        stepHours: 1, // DMI HARMONIE is hourly throughout its short range
        temperature,
        precipitation: h?.precipitation?.[i] ?? null,
        windSpeed: h?.wind_speed_10m?.[i] ?? null,
        windGust: h?.wind_gusts_10m?.[i] ?? null,
        windDirection: h?.wind_direction_10m?.[i] ?? null,
        symbol: wmoToSymbol(h?.weather_code?.[i], h?.is_day?.[i]),
      });
    }

    return points;
  },
};
