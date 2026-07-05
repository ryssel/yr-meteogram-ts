import "./style.css";
import { fetchForecastPoints, DEFAULT_SOURCE, PROVIDERS, type SourceId } from "./forecast";
import { renderMeteogram } from "./meteogram";

const form = document.querySelector<HTMLFormElement>("#location-form")!;
const latInput = document.querySelector<HTMLInputElement>("#lat")!;
const lonInput = document.querySelector<HTMLInputElement>("#lon")!;
const daysSelect = document.querySelector<HTMLSelectElement>("#days")!;
const sourceSelect = document.querySelector<HTMLSelectElement>("#source")!;
const geolocateBtn = document.querySelector<HTMLButtonElement>("#geolocate")!;
const chartContainer = document.querySelector<HTMLElement>("#chart-container")!;

// Populate the source picker from the registry — one option per provider.
for (const provider of Object.values(PROVIDERS)) {
  const opt = document.createElement("option");
  opt.value = provider.id;
  opt.textContent = provider.label;
  sourceSelect.appendChild(opt);
}
sourceSelect.value = DEFAULT_SOURCE;

async function loadAndRender(): Promise<void> {
  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);
  const days = Number(daysSelect.value);
  const source = (sourceSelect.value || DEFAULT_SOURCE) as SourceId;
  // MET goes through the /met dev proxy (which adds MET's User-Agent); DMI via
  // Open-Meteo is keyless + CORS-open, so it ignores the base.
  const proxyBase = source === "met" ? "/met" : "";

  chartContainer.innerHTML = `<p class="status">Loading forecast…</p>`;
  try {
    const points = await fetchForecastPoints(source, proxyBase, lat, lon, days);
    renderMeteogram(chartContainer, points);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    chartContainer.innerHTML = `<p class="status">Couldn't load forecast: ${message}</p>`;
  }
}

// --- theme toggle (dark mode) ---
// Default follows the OS via prefers-color-scheme (handled in CSS); the toggle
// forces a choice via data-theme on <html> and remembers it. The SVG reads CSS
// custom properties, so it recolours live without re-rendering.
const themeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle")!;
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark" || savedTheme === "light") {
  document.documentElement.setAttribute("data-theme", savedTheme);
}
function isDark(): boolean {
  const forced = document.documentElement.getAttribute("data-theme");
  return forced ? forced === "dark" : prefersDark.matches;
}
function updateThemeToggle(): void {
  themeToggle.textContent = isDark() ? "☀️" : "🌙";
}
updateThemeToggle();
prefersDark.addEventListener("change", updateThemeToggle);
themeToggle.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeToggle();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void loadAndRender();
});

sourceSelect.addEventListener("change", () => void loadAndRender());

geolocateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    latInput.value = pos.coords.latitude.toFixed(4);
    lonInput.value = pos.coords.longitude.toFixed(4);
    void loadAndRender();
  });
});

void loadAndRender();
