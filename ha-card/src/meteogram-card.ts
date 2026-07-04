import type { HomeAssistant } from "custom-card-helpers";

// Reuse the main app's fetch/normalize logic and renderer — single source of
// truth, no duplicated parsing here.
import { toForecastPoints, type ForecastPoint, type MetResponse } from "../../src/forecast";
import { renderMeteogram } from "../../src/meteogram";

interface CardConfig {
  type: string;
  latitude?: number;
  longitude?: number;
  days?: number;
  // Base URL of a proxy that forwards to api.met.no with the required
  // User-Agent header (browsers can't set it themselves). The card appends
  // the MET locationforecast path + lat/lon to this base. Example:
  //   https://ha.example.com/met
  proxy_url?: string;
}

// MET only serves hourly (next_1_hours) resolution for roughly the first ~2
// days, then 6-hourly. We show the full hourly window, so use a generous
// cutoff and filter to hourly points afterwards.
const HOURLY_WINDOW_DAYS = 15;

class MeteogramCard extends HTMLElement {
  private _root: ShadowRoot;
  private _hass?: HomeAssistant;
  private _config?: CardConfig;
  private _container?: HTMLDivElement;
  private _statusEl?: HTMLParagraphElement;

  constructor() {
    super();
    // Shadow DOM so the styles below (including the --temp/--precip/--wind
    // custom properties the SVG references) actually apply. HA theme
    // variables still pierce the shadow boundary via CSS var inheritance.
    this._root = this.attachShadow({ mode: "open" });
  }

  setConfig(config: CardConfig) {
    this._config = config;
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.requestUpdate();
  }

  private ensureDom() {
    if (this._container) return;

    const style = document.createElement("style");
    style.textContent = MeteogramCard.styles;
    this._root.appendChild(style);

    this._container = document.createElement("div");
    this._container.className = "meteogram-container";
    this._root.appendChild(this._container);

    this._statusEl = document.createElement("p");
    this._statusEl.className = "status";
    this._statusEl.textContent = "Loading forecast…";
    this._container.appendChild(this._statusEl);
  }

  private requestUpdate() {
    if (!this._hass || !this._config) return;

    const latitude = this._config.latitude ?? this._hass.config.latitude;
    const longitude = this._config.longitude ?? this._hass.config.longitude;

    this.ensureDom();
    this.updateForecast(latitude, longitude, this._config.days);
  }

  private async updateForecast(latitude: number, longitude: number, maxDays?: number) {
    if (!this._statusEl || !this._container) return;

    const proxyBase = this._config?.proxy_url?.replace(/\/+$/, "");
    if (!proxyBase) {
      this._container.innerHTML = "";
      this._statusEl = document.createElement("p");
      this._statusEl.className = "status";
      this._statusEl.textContent =
        "Configuration error: proxy_url is required (a proxy that adds MET's User-Agent header — see the card README).";
      this._container.appendChild(this._statusEl);
      return;
    }

    try {
      this._statusEl.textContent = "Loading forecast…";

      // proxy_url is the base that maps to api.met.no; append the MET path.
      const endpoint = `${proxyBase}/weatherapi/locationforecast/2.0/complete?lat=${latitude}&lon=${longitude}`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = (await response.json()) as MetResponse;

      // Full hourly window MET publishes; drop the coarser 6-hourly tail.
      let points = toForecastPoints(data, HOURLY_WINDOW_DAYS).filter(
        (p: ForecastPoint) => p.stepHours === 1
      );

      // Optional cap on how far ahead to show.
      if (maxDays && maxDays > 0) {
        const cutoff = Date.now() + maxDays * 24 * 60 * 60 * 1000;
        points = points.filter((p) => p.time.getTime() <= cutoff);
      }

      this._container.innerHTML = "";
      renderMeteogram(this._container, points);
    } catch (error) {
      this._container.innerHTML = "";
      const msg = document.createElement("p");
      msg.className = "status";
      msg.textContent = `Error loading forecast: ${error instanceof Error ? error.message : String(error)}`;
      this._container.appendChild(msg);
      this._statusEl = msg;
      console.error("Meteogram card error:", error);
    }
  }

  static get styles() {
    return `
      :host {
        --temp: #d62c2c;
        --precip: #3d8bd4;
        --wind: #8e44ad;
        display: block;
      }

      .meteogram-container {
        width: 100%;
        overflow-x: auto;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        border-radius: var(--ha-card-border-radius, 12px);
        padding: 16px;
      }

      .status {
        text-align: center;
        color: var(--primary-text-color, #000);
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
