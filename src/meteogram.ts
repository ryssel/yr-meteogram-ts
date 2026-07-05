import type { ForecastPoint } from "./forecast";
import { iconAt } from "./icons";

interface Layout {
  pxPerHour: number;
  pxPerHourLong: number;
  marginLeft: number;
  marginRight: number;
  dayLabelHeight: number;
  iconSize: number;
  iconClearance: number;
  pxPerTempTick: number;
  pxPerWindTick: number;
  precipBandHeight: number;
  panePadTop: number;
  panePadBottom: number;
  arrowRowHeight: number;
  axisHeight: number;
}

const LAYOUT: Layout = {
  pxPerHour: 16,
  // Compressed rate for the 6-hourly long-range tail so it doesn't require
  // endless horizontal scrolling.
  pxPerHourLong: 6,
  marginLeft: 42,
  marginRight: 42,
  dayLabelHeight: 22,
  // Icons ride just above the temperature line; iconClearance reserves space at
  // the top of the temp pane so an icon at the peak temperature isn't clipped.
  iconSize: 24,
  iconClearance: 30,
  // Vertical spacing between gridlines — pane heights are derived from these
  // times the number of ticks, so each pane is only as tall as its data needs.
  pxPerTempTick: 16,
  pxPerWindTick: 16,
  precipBandHeight: 38,
  panePadTop: 8,
  panePadBottom: 6,
  arrowRowHeight: 22,
  axisHeight: 24,
};

const dayLabelFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const hourLabelFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", hour12: false });

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const step = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return step * magnitude;
}

/**
 * Builds a smooth SVG path through the given points using monotone cubic Hermite
 * interpolation (Fritsch–Carlson). The curve passes through every point and
 * never overshoots — it won't invent a peak or dip beyond the data — which keeps
 * temperature/wind readings honest, especially across the coarser 6-hourly
 * stretch where points are far apart. Parameterized by x, so uneven spacing
 * (the 1h→6h transition) is handled naturally.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const p = (i: number) => `${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  if (n === 1) return `M${p(0)}`;
  if (n === 2) return `M${p(0)} L${p(1)}`;

  // Secant slopes between consecutive points.
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  }

  // Tangents at each point (average of adjacent secants at interior points).
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // At a local extremum (secants change sign or are flat) force a flat
    // tangent so the curve tops/bottoms out exactly at the point.
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }

  // Fritsch–Carlson: clamp tangents so the interpolant stays monotonic
  // (prevents overshoot).
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / d[i];
    const beta = m[i + 1] / d[i];
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * alpha * d[i];
      m[i + 1] = t * beta * d[i];
    }
  }

  // Emit one cubic Bézier per interval using the Hermite→Bézier conversion.
  let path = `M${p(0)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    const c1x = pts[i].x + h / 3;
    const c1y = pts[i].y + (m[i] * h) / 3;
    const c2x = pts[i + 1].x - h / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * h) / 3;
    path += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p(i + 1)}`;
  }
  return path;
}

/**
 * A small wind-direction arrow centred at (x, y). `fromDir` is the direction the
 * wind blows FROM (MET convention); the arrow points where the wind is going
 * (fromDir + 180). Default glyph points up (north); SVG rotate is clockwise, so
 * rotating by the compass bearing aims it correctly.
 */
function windArrow(fromDir: number, x: number, y: number): string {
  const flow = (fromDir + 180) % 360;
  return (
    `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${flow.toFixed(0)})" stroke="var(--secondary-text-color, #555)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<line x1="0" y1="-6" x2="0" y2="6" />` +
    `<path d="M-3,-3 L0,-6 L3,-3" />` +
    `</g>`
  );
}

export function renderMeteogram(container: HTMLElement, points: ForecastPoint[]): void {
  if (points.length === 0) {
    container.innerHTML = `<p class="status">No forecast data available.</p>`;
    return;
  }

  const { pxPerHour, pxPerHourLong, marginLeft, marginRight, dayLabelHeight, iconSize, iconClearance, pxPerTempTick, pxPerWindTick, precipBandHeight, panePadTop, panePadBottom, arrowRowHeight, axisHeight } =
    LAYOUT;
  // Header is just the day-label row now; weather icons live inside the temp
  // pane, riding above the temperature line.
  const headerHeight = dayLabelHeight;

  const firstTime = points[0].time.getTime();
  const last = points[points.length - 1];
  const lastTime = last.time.getTime() + last.stepHours * 3600_000;

  // Compress the chart horizontally once MET drops to 6-hourly data. The break
  // is the first midnight after 6-hourly data begins, so the hourly region and
  // the transition day stay full width; only whole 6-hourly days shrink.
  const firstSixHourly = points.find((p) => p.stepHours === 6);
  const breakTime = firstSixHourly ? new Date(firstSixHourly.time).setHours(24, 0, 0, 0) : Infinity;
  const xAtBreak = breakTime === Infinity ? Infinity : marginLeft + ((breakTime - firstTime) / 3600_000) * pxPerHour;

  const xScale = (t: number) =>
    t <= breakTime
      ? marginLeft + ((t - firstTime) / 3600_000) * pxPerHour
      : xAtBreak + ((t - breakTime) / 3600_000) * pxPerHourLong;

  const width = Math.ceil(xScale(lastTime) + marginRight);

  // --- temperature scale (range fits the data, so the line fills the pane) ---
  const temps = points.map((p) => p.temperature).filter((v): v is number => v !== null);
  if (temps.length === 0) {
    container.innerHTML = `<p class="status">No temperature data available.</p>`;
    return;
  }
  // Enforce a minimum span so a nearly-flat day isn't zoomed into noise.
  // A higher target favours 2° gridlines for typical day-to-day ranges.
  const tempStep = niceStep(Math.max(6, Math.max(...temps) - Math.min(...temps)), 8);
  let minTemp = Math.floor(Math.min(...temps) / tempStep) * tempStep;
  let maxTemp = Math.ceil(Math.max(...temps) / tempStep) * tempStep;
  if (maxTemp - minTemp < 2 * tempStep) maxTemp = minTemp + 2 * tempStep; // keep >=2 gridlines
  const tempIntervals = Math.round((maxTemp - minTemp) / tempStep);

  // --- pane heights derive from the gridline count (dynamic to the data) ---
  const tempPlot = tempIntervals * pxPerTempTick;
  const tempTop = headerHeight + panePadTop + iconClearance;
  const tempBottom = tempTop + tempPlot;
  const tempPaneHeight = panePadTop + iconClearance + tempPlot + precipBandHeight;
  const yTemp = (t: number) => tempBottom - ((t - minTemp) / (maxTemp - minTemp)) * (tempBottom - tempTop);

  // --- precipitation scale (bars grow up from the bottom of the temp pane) ---
  const precipVals = points.map((p) => p.precipitation ?? 0);
  const maxPrecip = Math.max(2, ...precipVals) * 1.35; // *1.35 = headroom above the tallest bar
  const precipBase = headerHeight + tempPaneHeight - panePadBottom;
  const precipTop = tempBottom + 10;
  const yPrecip = (mm: number) => precipBase - (mm / maxPrecip) * (precipBase - precipTop);

  // --- wind scale (0-based, top fits the data) ---
  const windVals = points.flatMap((p) => [p.windSpeed ?? 0, p.windGust ?? 0]);
  const windStep = niceStep(Math.max(4, Math.max(...windVals)), 5);
  let maxWind = Math.ceil(Math.max(4, ...windVals) / windStep) * windStep;
  if (maxWind < 2 * windStep) maxWind = 2 * windStep;
  const windIntervals = Math.round(maxWind / windStep);
  const windPlot = windIntervals * pxPerWindTick;
  const windTop = headerHeight + tempPaneHeight + panePadTop;
  const windBottom = windTop + windPlot;
  const windPaneHeight = panePadTop + windPlot + panePadBottom;
  const yWind = (v: number) => windBottom - (v / maxWind) * (windBottom - windTop);

  const totalHeight = headerHeight + tempPaneHeight + windPaneHeight + arrowRowHeight + axisHeight;

  // --- build line paths (smoothed with monotone cubic interpolation) ---
  const tempPts: { x: number; y: number }[] = [];
  const windPts: { x: number; y: number }[] = [];
  const gustPts: { x: number; y: number }[] = [];
  for (const p of points) {
    const x = xScale(p.time.getTime());
    if (p.temperature !== null) tempPts.push({ x, y: yTemp(p.temperature) });
    if (p.windSpeed !== null) windPts.push({ x, y: yWind(p.windSpeed) });
    if (p.windGust !== null) gustPts.push({ x, y: yWind(p.windGust) });
  }
  const tempPath = smoothPath(tempPts);
  const windPath = smoothPath(windPts);
  const gustPath = smoothPath(gustPts);

  // --- precipitation bars ---
  const precipBars = points
    .filter((p) => (p.precipitation ?? 0) > 0)
    .map((p) => {
      const x = xScale(p.time.getTime());
      const barWidth = Math.max(2, xScale(p.time.getTime() + p.stepHours * 3600_000) - x - 2);
      const yTop = yPrecip(p.precipitation!);
      const h = precipBase - yTop;
      return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" fill="var(--precip)" opacity="0.85" />`;
    })
    .join("");

  // --- day separators + labels ---
  const dayLines: string[] = [];
  const dayLabels: string[] = [];
  const cursor = new Date(firstTime);
  cursor.setHours(24, 0, 0, 0); // first midnight strictly after start
  while (cursor.getTime() < lastTime) {
    const x = xScale(cursor.getTime());
    dayLines.push(
      `<line x1="${x.toFixed(1)}" y1="${headerHeight}" x2="${x.toFixed(1)}" y2="${totalHeight - axisHeight}" stroke="var(--primary-text-color, #333)" stroke-width="1" />`
    );
    const nextMidnight = new Date(cursor);
    nextMidnight.setDate(cursor.getDate() + 1);
    const labelCenter = xScale((cursor.getTime() + Math.min(nextMidnight.getTime(), lastTime)) / 2);
    dayLabels.push(
      `<text x="${labelCenter.toFixed(1)}" y="${dayLabelHeight - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--primary-text-color, #222)">${dayLabelFmt.format(cursor)}</text>`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  // Label for the first (partial) day segment
  const firstMidnight = new Date(firstTime).setHours(24, 0, 0, 0);
  const firstDayCenter = xScale((firstTime + Math.min(firstMidnight, lastTime)) / 2);
  dayLabels.unshift(
    `<text x="${firstDayCenter.toFixed(1)}" y="${dayLabelHeight - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--primary-text-color, #222)">${dayLabelFmt.format(new Date(firstTime))}</text>`
  );

  // --- hour tick labels ---
  const hourLabels: string[] = [];
  const hourTickEvery = pxPerHour < 14 ? 3 : pxPerHour < 20 ? 2 : 1;
  let hourCursor = new Date(firstTime);
  hourCursor.setMinutes(0, 0, 0);
  let i = 0;
  while (hourCursor.getTime() < lastTime) {
    const t = hourCursor.getTime();
    // Full cadence in the hourly region; only every 6h in the compressed tail.
    const show = t >= firstTime && (t <= breakTime ? i % hourTickEvery === 0 : hourCursor.getHours() % 6 === 0);
    if (show) {
      const x = xScale(t);
      hourLabels.push(
        `<text x="${x.toFixed(1)}" y="${totalHeight - 6}" text-anchor="middle" font-size="10" fill="var(--secondary-text-color, #666)">${hourLabelFmt.format(hourCursor)}</text>`
      );
    }
    hourCursor = new Date(hourCursor.getTime() + 3600_000);
    i++;
  }

  // --- weather icons (ride just above the temperature line, yr.no style) ---
  const icons: string[] = [];
  const minIconSpacing = iconSize + 6;
  const iconTopLimit = headerHeight + iconSize / 2 + 2; // don't overlap day labels
  let lastIconX = -Infinity;
  for (const p of points) {
    if (!p.symbol || p.temperature === null) continue;
    const x = xScale(p.time.getTime());
    if (x - lastIconX < minIconSpacing) continue;
    const iconY = Math.max(iconTopLimit, yTemp(p.temperature) - iconSize / 2 - 4);
    icons.push(iconAt(p.symbol, x, iconY, iconSize));
    lastIconX = x;
  }

  // --- wind-direction arrows (row below the wind pane, same cadence as icons) ---
  const arrows: string[] = [];
  const arrowY = headerHeight + tempPaneHeight + windPaneHeight + arrowRowHeight / 2;
  let lastArrowX = -Infinity;
  for (const p of points) {
    if (p.windDirection === null) continue;
    const x = xScale(p.time.getTime());
    if (x - lastArrowX < minIconSpacing) continue;
    arrows.push(windArrow(p.windDirection, x, arrowY));
    lastArrowX = x;
  }

  // --- y-axis: gridlines scroll with the chart; the value labels live in a
  // separate overlay so they stay frozen on the left while you scroll ---
  const gridLines: string[] = [];
  const leftLabels: string[] = [];
  for (let t = minTemp; t <= maxTemp; t += tempStep) {
    const y = yTemp(t).toFixed(1);
    gridLines.push(`<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="var(--divider-color, #eee)" stroke-width="1" />`);
    leftLabels.push(`<text x="${marginLeft - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--temp)">${t}°</text>`);
  }
  for (let w = 0; w <= maxWind; w += windStep) {
    const y = yWind(w).toFixed(1);
    gridLines.push(`<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="var(--divider-color, #f2f2f2)" stroke-width="1" />`);
    leftLabels.push(`<text x="${marginLeft - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--wind)">${w}</text>`);
  }
  // Precip (mm) labels — frozen on the left. Label round tick values within the
  // scale (0, step, 2·step…) instead of 0/half/max, which produced decimals like
  // 1.4/2.7. Bars keep their scaling; only the label positions are rounded.
  const precipStep = niceStep(maxPrecip, 4);
  const precipFmt = (v: number) => (precipStep % 1 === 0 ? String(v) : v.toFixed(1));
  for (let i = 0; i * precipStep <= maxPrecip + 1e-9; i++) {
    const mm = i * precipStep;
    const y = yPrecip(mm).toFixed(1);
    leftLabels.push(`<text x="${marginLeft - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--precip)">${precipFmt(mm)}</text>`);
  }

  const svg = `
    <svg width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">
      <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="var(--ha-card-background, var(--card-background-color, #fff))" />
      ${gridLines.join("")}
      ${precipBars}
      ${dayLines.join("")}
      ${dayLabels.join("")}
      ${icons.join("")}
      <path d="${tempPath}" fill="none" stroke="var(--temp)" stroke-width="2.5" />
      <path d="${windPath}" fill="none" stroke="var(--wind)" stroke-width="2" />
      <path d="${gustPath}" fill="none" stroke="var(--wind)" stroke-width="1.5" stroke-dasharray="5,4" />
      ${arrows.join("")}
      ${hourLabels.join("")}
      <line x1="0" y1="${dayLabelHeight}" x2="${width}" y2="${dayLabelHeight}" stroke="var(--divider-color, #eee)" stroke-width="1" />
      <line x1="0" y1="${headerHeight + tempPaneHeight}" x2="${width}" y2="${headerHeight + tempPaneHeight}" stroke="var(--divider-color, #ccc)" stroke-width="1" />
    </svg>
  `;

  // Frozen left axis: a narrow SVG overlaid on the scroll area (a sibling of the
  // scrolling element, so it doesn't scroll) — the value labels stay put while
  // the chart scrolls, like freezing a column in a spreadsheet. The opaque
  // background hides the scrolled chart behind the numbers.
  const axisW = marginLeft;
  const axisTop = headerHeight; // leave the icon/day-label header scrolling
  const axisOverlay = `
    <svg class="meteogram-axis" width="${axisW}" height="${totalHeight}" viewBox="0 0 ${axisW} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" style="position:absolute;top:0;left:0;pointer-events:none;">
      <rect x="0" y="${axisTop}" width="${axisW}" height="${totalHeight - axisTop}" fill="var(--ha-card-background, var(--card-background-color, #fff))" />
      <line x1="0" y1="${headerHeight + tempPaneHeight}" x2="${axisW}" y2="${headerHeight + tempPaneHeight}" stroke="var(--divider-color, #ccc)" stroke-width="1" />
      <line x1="${axisW - 0.5}" y1="${headerHeight}" x2="${axisW - 0.5}" y2="${totalHeight - axisHeight}" stroke="var(--divider-color, #e5e5e5)" stroke-width="1" />
      ${leftLabels.join("")}
    </svg>
  `;

  container.innerHTML = `<div class="meteogram-wrap" style="position:relative;"><div class="meteogram-scroll">${svg}</div>${axisOverlay}</div>`;
}
