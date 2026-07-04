import type { ForecastPoint } from "./forecast";
import { iconAt } from "./icons";

interface Layout {
  pxPerHour: number;
  marginLeft: number;
  marginRight: number;
  dayLabelHeight: number;
  iconRowHeight: number;
  tempPaneHeight: number;
  windPaneHeight: number;
  axisHeight: number;
}

const LAYOUT: Layout = {
  pxPerHour: 16,
  marginLeft: 42,
  marginRight: 42,
  dayLabelHeight: 22,
  iconRowHeight: 34,
  tempPaneHeight: 230,
  windPaneHeight: 110,
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

export function renderMeteogram(container: HTMLElement, points: ForecastPoint[]): void {
  if (points.length === 0) {
    container.innerHTML = `<p class="status">No forecast data available.</p>`;
    return;
  }

  const { pxPerHour, marginLeft, marginRight, dayLabelHeight, iconRowHeight, tempPaneHeight, windPaneHeight, axisHeight } =
    LAYOUT;
  const headerHeight = dayLabelHeight + iconRowHeight;

  const firstTime = points[0].time.getTime();
  const last = points[points.length - 1];
  const lastTime = last.time.getTime() + last.stepHours * 3600_000;
  const totalHours = (lastTime - firstTime) / 3600_000;
  const width = Math.ceil(marginLeft + marginRight + totalHours * pxPerHour);
  const totalHeight = headerHeight + tempPaneHeight + windPaneHeight + axisHeight;

  const xScale = (t: number) => marginLeft + ((t - firstTime) / 3600_000) * pxPerHour;

  // --- temperature scale ---
  const temps = points.map((p) => p.temperature).filter((v): v is number => v !== null);
  const tempStep = niceStep(Math.max(4, Math.max(...temps) - Math.min(...temps)), 5);
  const minTemp = Math.floor(Math.min(...temps, 0) / tempStep) * tempStep - tempStep;
  const maxTemp = Math.ceil(Math.max(...temps) / tempStep) * tempStep + tempStep;
  const tempTop = headerHeight + 8;
  const tempBottom = headerHeight + tempPaneHeight - 46;
  const yTemp = (t: number) => tempBottom - ((t - minTemp) / (maxTemp - minTemp)) * (tempBottom - tempTop);

  // --- precipitation scale (bars grow up from the bottom of the temp pane) ---
  const precipVals = points.map((p) => p.precipitation ?? 0);
  const maxPrecip = Math.max(2, ...precipVals) * 1.35;
  const precipBase = headerHeight + tempPaneHeight - 4;
  const precipTop = tempBottom + 8;
  const yPrecip = (mm: number) => precipBase - (mm / maxPrecip) * (precipBase - precipTop);

  // --- wind scale ---
  const windVals = points.flatMap((p) => [p.windSpeed ?? 0, p.windGust ?? 0]);
  const windStep = niceStep(Math.max(4, Math.max(...windVals)), 3);
  const maxWind = Math.ceil(Math.max(4, ...windVals) / windStep) * windStep + windStep;
  const windTop = headerHeight + tempPaneHeight + 8;
  const windBottom = headerHeight + tempPaneHeight + windPaneHeight - 4;
  const yWind = (v: number) => windBottom - (v / maxWind) * (windBottom - windTop);

  // --- build line paths ---
  let tempPath = "";
  let windPath = "";
  let gustPath = "";
  for (const p of points) {
    const x = xScale(p.time.getTime());
    if (p.temperature !== null) tempPath += `${tempPath ? "L" : "M"}${x.toFixed(1)},${yTemp(p.temperature).toFixed(1)} `;
    if (p.windSpeed !== null) windPath += `${windPath ? "L" : "M"}${x.toFixed(1)},${yWind(p.windSpeed).toFixed(1)} `;
    if (p.windGust !== null) gustPath += `${gustPath ? "L" : "M"}${x.toFixed(1)},${yWind(p.windGust).toFixed(1)} `;
  }

  // --- precipitation bars ---
  const precipBars = points
    .filter((p) => (p.precipitation ?? 0) > 0)
    .map((p) => {
      const x = xScale(p.time.getTime());
      const barWidth = Math.max(2, p.stepHours * pxPerHour - 2);
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
      `<line x1="${x.toFixed(1)}" y1="${headerHeight}" x2="${x.toFixed(1)}" y2="${totalHeight - axisHeight}" stroke="#333" stroke-width="1" />`
    );
    const nextMidnight = new Date(cursor);
    nextMidnight.setDate(cursor.getDate() + 1);
    const labelCenter = xScale(cursor.getTime()) + (Math.min(nextMidnight.getTime(), lastTime) - cursor.getTime()) / 3600_000 / 2 * pxPerHour;
    dayLabels.push(
      `<text x="${labelCenter.toFixed(1)}" y="${dayLabelHeight - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="#222">${dayLabelFmt.format(cursor)}</text>`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  // Label for the first (partial) day segment
  const firstDayCenter = xScale(firstTime) + Math.min(new Date(firstTime).setHours(24, 0, 0, 0) - firstTime, lastTime - firstTime) / 3600_000 / 2 * pxPerHour;
  dayLabels.unshift(
    `<text x="${firstDayCenter.toFixed(1)}" y="${dayLabelHeight - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="#222">${dayLabelFmt.format(new Date(firstTime))}</text>`
  );

  // --- hour tick labels ---
  const hourLabels: string[] = [];
  const hourTickEvery = pxPerHour < 14 ? 3 : pxPerHour < 20 ? 2 : 1;
  let hourCursor = new Date(firstTime);
  hourCursor.setMinutes(0, 0, 0);
  let i = 0;
  while (hourCursor.getTime() < lastTime) {
    if (hourCursor.getTime() >= firstTime && i % hourTickEvery === 0) {
      const x = xScale(hourCursor.getTime());
      hourLabels.push(
        `<text x="${x.toFixed(1)}" y="${totalHeight - 6}" text-anchor="middle" font-size="10" fill="#666">${hourLabelFmt.format(hourCursor)}</text>`
      );
    }
    hourCursor = new Date(hourCursor.getTime() + 3600_000);
    i++;
  }

  // --- weather icons (spaced to avoid overlapping, following the data's own resolution) ---
  const icons: string[] = [];
  const iconSize = Math.min(26, iconRowHeight - 6);
  const minIconSpacing = iconSize + 6;
  const iconY = dayLabelHeight + iconRowHeight / 2;
  let lastIconX = -Infinity;
  for (const p of points) {
    if (!p.symbol) continue;
    const x = xScale(p.time.getTime());
    if (x - lastIconX < minIconSpacing) continue;
    icons.push(iconAt(p.symbol, x, iconY, iconSize));
    lastIconX = x;
  }

  // --- y-axis labels ---
  const tempAxis: string[] = [];
  for (let t = minTemp; t <= maxTemp; t += tempStep) {
    const y = yTemp(t);
    tempAxis.push(`<text x="${marginLeft - 8}" y="${y.toFixed(1) }" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--temp)">${t}°</text>`);
    tempAxis.push(`<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}" stroke="#eee" stroke-width="1" />`);
  }
  const windAxis: string[] = [];
  for (let w = 0; w <= maxWind; w += windStep) {
    const y = yWind(w);
    windAxis.push(`<text x="${marginLeft - 8}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--wind)">${w}</text>`);
    windAxis.push(`<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}" stroke="#f2f2f2" stroke-width="1" />`);
  }
  const precipAxis: string[] = [0, maxPrecip / 2, maxPrecip].map(
    (mm) =>
      `<text x="${width - marginRight + 8}" y="${yPrecip(mm).toFixed(1)}" text-anchor="start" dominant-baseline="middle" font-size="10" fill="var(--precip)">${mm.toFixed(1)}</text>`
  );

  const svg = `
    <svg width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">
      <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#fff" />
      ${tempAxis.join("")}
      ${windAxis.join("")}
      ${precipBars}
      ${dayLines.join("")}
      ${dayLabels.join("")}
      ${icons.join("")}
      <path d="${tempPath}" fill="none" stroke="var(--temp)" stroke-width="2.5" />
      <path d="${windPath}" fill="none" stroke="var(--wind)" stroke-width="2" />
      <path d="${gustPath}" fill="none" stroke="var(--wind)" stroke-width="1.5" stroke-dasharray="5,4" />
      ${precipAxis.join("")}
      ${hourLabels.join("")}
      <line x1="0" y1="${dayLabelHeight}" x2="${width}" y2="${dayLabelHeight}" stroke="#eee" stroke-width="1" />
      <line x1="0" y1="${headerHeight + tempPaneHeight}" x2="${width}" y2="${headerHeight + tempPaneHeight}" stroke="#ccc" stroke-width="1" />
    </svg>
  `;

  container.innerHTML = `<div class="meteogram-scroll">${svg}</div>`;
}
