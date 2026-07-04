import type { HomeAssistant } from "custom-card-helpers";

// Import core functions from the main app
import { fetchForecast, type ForecastPoint } from "../../src/forecast";
import { renderMeteogram } from "../../src/meteogram";

interface CardConfig {
  type: string;
  latitude?: number;
  longitude?: number;
  days?: number;
  user_agent?: string;
  proxy_url?: string; // URL to your proxy endpoint
}

class MeteogramCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: CardConfig;
  private _container?: HTMLDivElement;
  private _statusEl?: HTMLParagraphElement;

  connectedCallback() {
    // Card lifecycle setup
  }

  disconnectedCallback() {
    // Card cleanup
  }

  setConfig(config: CardConfig) {
    this._config = config;
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.requestUpdate();
  }

  private requestUpdate() {
    if (!this._hass || !this._config) return;

    const latitude = this._config.latitude ?? this._hass.config.latitude;
    const longitude = this._config.longitude ?? this._hass.config.longitude;
    const days = this._config.days ?? 5;

    if (!this._container) {
      this.innerHTML = "";
      this._container = document.createElement("div");
      this._container.className = "meteogram-container";
      this.appendChild(this._container);

      this._statusEl = document.createElement("p");
      this._statusEl.className = "status";
      this._statusEl.textContent = "Loading forecast…";
      this._container.appendChild(this._statusEl);
    }

    this.updateForecast(latitude, longitude, days);
  }

  private async updateForecast(latitude: number, longitude: number, days: number) {
    if (!this._statusEl) return;

    try {
      this._statusEl.textContent = "Loading forecast…";

      // Determine the API URL
      // If proxy_url is configured, use that; otherwise call MET directly
      // Note: Direct MET calls from browser will fail without proper headers
      const endpoint = this._config?.proxy_url
        ? this._config.proxy_url
        : `https://api.met.no/weatherapi/locationforecast/2.0/classic?lat=${latitude}&lon=${longitude}`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const points = this.toForecastPoints(data, days);

      if (!this._container) return;
      this._container.innerHTML = "";
      renderMeteogram(this._container, points);
    } catch (error) {
      if (!this._statusEl) return;
      this._statusEl.textContent = `Error loading forecast: ${error instanceof Error ? error.message : String(error)}`;
      console.error("Meteogram card error:", error);
    }
  }

  private toForecastPoints(data: any, maxDays: number): ForecastPoint[] {
    // Simplified version of the forecast.ts logic
    // You may want to import and use the actual function instead
    const points: ForecastPoint[] = [];
    const timeseries = data.properties?.timeseries ?? [];
    const maxTime = Date.now() + maxDays * 24 * 3600_000;

    for (const entry of timeseries) {
      const time = new Date(entry.time);
      if (time.getTime() > maxTime) break;

      const step1h = entry.data?.next_1_hours;
      const step6h = entry.data?.next_6_hours;
      const instant = entry.data?.instant?.details ?? {};

      points.push({
        time,
        temperature: instant.air_temperature ?? null,
        precipitation: step1h?.precipitation_amount ?? step6h?.precipitation_amount ?? 0,
        windSpeed: instant.wind_speed ?? 0,
        windGust: instant.wind_speed_of_gust ?? 0,
        symbol: step1h?.summary?.symbol_code ?? step6h?.summary?.symbol_code ?? "unknown",
        stepHours: step1h ? 1 : 6,
      });
    }

    return points;
  }

  static get styles() {
    return `
      :host {
        --temp: #ff6b35;
        --precip: #4a90e2;
        --wind: #7b68ee;
      }
      
      .meteogram-container {
        width: 100%;
        overflow-x: auto;
        background: var(--ha-card-background, #fff);
        border-radius: 4px;
        padding: 16px;
      }

      .status {
        text-align: center;
        color: var(--ha-text-color, #000);
        font-size: 14px;
        margin: 20px 0;
      }

      svg {
        display: block;
      }
    `;
  }

  getCardSize() {
    return 3; // Approximate card height in units
  }
}

customElements.define("meteogram-card", MeteogramCard);

// Required for HA to recognize this
declare global {
  interface Window {
    customCards: any[];
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "meteogram-card",
  name: "Meteogram",
  description: "Scrollable weather meteogram using MET Norway data",
});
