/**
 * Renders a self-contained <g> fragment for a given MET Norway symbol_code
 * (e.g. "clearsky_day", "partlycloudy_night", "rain", "cloudy").
 * Coordinates are in a 24x24 box; wrap with a transform to position/scale.
 *
 * These are original, simplified icons — not reproductions of yr.no's or
 * MET's own icon set.
 */

const SUN = `
  <circle cx="12" cy="12" r="5" fill="#f5a623" />
  <g stroke="#f5a623" stroke-width="2" stroke-linecap="round">
    <line x1="12" y1="1" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="23" />
    <line x1="1" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="23" y2="12" />
    <line x1="4.2" y1="4.2" x2="6.3" y2="6.3" />
    <line x1="17.7" y1="17.7" x2="19.8" y2="19.8" />
    <line x1="4.2" y1="19.8" x2="6.3" y2="17.7" />
    <line x1="17.7" y1="6.3" x2="19.8" y2="4.2" />
  </g>
`;

const MOON = `
  <path d="M16 3.5a8.8 8.8 0 1 0 4.5 16.3A9.8 9.8 0 0 1 16 3.5Z" fill="#9aa5c9" />
`;

const SMALL_SUN = `
  <circle cx="7" cy="8" r="3.4" fill="#f5a623" />
  <g stroke="#f5a623" stroke-width="1.5" stroke-linecap="round">
    <line x1="7" y1="1.5" x2="7" y2="3.2" />
    <line x1="1.5" y1="8" x2="3.2" y2="8" />
    <line x1="2.6" y1="3.6" x2="3.8" y2="4.8" />
    <line x1="11.4" y1="3.6" x2="10.2" y2="4.8" />
  </g>
`;

const SMALL_MOON = `
  <path d="M9.2 3.2a5.2 5.2 0 1 0 2.6 9.6A5.7 5.7 0 0 1 9.2 3.2Z" fill="#9aa5c9" />
`;

const CLOUD = `
  <path d="M6.5 19a4 4 0 0 1 .3-8 5.7 5.7 0 0 1 10.9-1.6A4.1 4.1 0 0 1 17.5 17.5v.02A3 3 0 0 1 17 19H6.5Z" fill="#b8bfc9" />
`;

const RAIN_DROPS = `
  <g stroke="#3d8bd4" stroke-width="1.6" stroke-linecap="round">
    <line x1="8" y1="20" x2="7" y2="23" />
    <line x1="12.5" y1="20" x2="11.5" y2="23" />
    <line x1="17" y1="20" x2="16" y2="23" />
  </g>
`;

const SNOWFLAKES = `
  <g fill="#7fb3e0">
    <circle cx="8" cy="21" r="1.1" />
    <circle cx="12.5" cy="21.5" r="1.1" />
    <circle cx="17" cy="21" r="1.1" />
  </g>
`;

const LIGHTNING = `
  <path d="M13 15.5 9.5 21h3l-1 3.2L16 18h-3z" fill="#e0a02a" />
`;

function isNight(symbol: string): boolean {
  return symbol.includes("_night");
}

/** Returns an SVG fragment (no outer <svg> tag) for the given symbol_code. */
export function iconFragment(symbol: string): string {
  const night = isNight(symbol);
  const base = symbol.replace(/_day|_night|_polartwilight/g, "");

  if (base === "clearsky") return night ? MOON : SUN;
  if (base === "fair") return (night ? SMALL_MOON : SMALL_SUN) + CLOUD;
  if (base === "partlycloudy") return (night ? SMALL_MOON : SMALL_SUN) + CLOUD;
  if (base === "cloudy") return CLOUD;
  if (base.includes("thunder")) return CLOUD + LIGHTNING;
  if (base.includes("sleet") || base.includes("snow")) return CLOUD + SNOWFLAKES;
  if (base.includes("rain") || base.includes("showers")) {
    const withSun = base.startsWith("lightrainshowers") || base.startsWith("rainshowers");
    return (withSun ? (night ? SMALL_MOON : SMALL_SUN) : "") + CLOUD + RAIN_DROPS;
  }
  if (base.includes("fog")) return CLOUD;

  // Fallback: just show a plain cloud rather than nothing.
  return CLOUD;
}

/** Wraps iconFragment in a positioned, scaled <g>. size is the rendered box size in px. */
export function iconAt(symbol: string, x: number, y: number, size: number): string {
  const scale = size / 24;
  return `<g transform="translate(${(x - size / 2).toFixed(1)},${(y - size / 2).toFixed(1)}) scale(${scale.toFixed(3)})">${iconFragment(symbol)}</g>`;
}
