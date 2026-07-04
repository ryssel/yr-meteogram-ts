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
