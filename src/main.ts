import "./style.css";
import { fetchForecast, toForecastPoints } from "./forecast";
import { renderMeteogram } from "./meteogram";

const form = document.querySelector<HTMLFormElement>("#location-form")!;
const latInput = document.querySelector<HTMLInputElement>("#lat")!;
const lonInput = document.querySelector<HTMLInputElement>("#lon")!;
const daysSelect = document.querySelector<HTMLSelectElement>("#days")!;
const geolocateBtn = document.querySelector<HTMLButtonElement>("#geolocate")!;
const chartContainer = document.querySelector<HTMLElement>("#chart-container")!;

async function loadAndRender(): Promise<void> {
  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);
  const days = Number(daysSelect.value);

  chartContainer.innerHTML = `<p class="status">Loading forecast…</p>`;
  try {
    const response = await fetchForecast(lat, lon);
    const points = toForecastPoints(response, days);
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

geolocateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    latInput.value = pos.coords.latitude.toFixed(4);
    lonInput.value = pos.coords.longitude.toFixed(4);
    void loadAndRender();
  });
});

void loadAndRender();
