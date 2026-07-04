import type { HomeAssistant } from "custom-card-helpers";

// Reuse the main app's fetch/normalize logic and renderer — single source of
// truth, no duplicated parsing here.
import { toForecastPoints, type MetResponse } from "../../src/forecast";
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

// MET's locationforecast covers ~10 days: hourly (next_1_hours) for roughly
// the first ~2 days, then 6-hourly (next_6_hours). By default we show whatever
// MET returns, so the available data determines the period. This cutoff just
// needs to exceed MET's horizon so nothing is trimmed.
const MET_MAX_DAYS = 11;

class MeteogramCard extends HTMLElement {
  private _root: ShadowRoot;
  private _hass?: HomeAssistant;
  private _config?: CardConfig;
  private _container?: HTMLDivElement;
  private _statusEl?: HTMLParagraphElement;
  private _lastKey?: string;
  private _refreshTimer?: number;

  constructor() {
    super();
    // Shadow DOM so the styles below (including the --temp/--precip/--wind
    // custom properties the SVG references) actually apply. HA theme
    // variables still pierce the shadow boundary via CSS var inheritance.
    this._root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    // Refresh on a timer so the forecast stays current without re-rendering
    // (and resetting the scroll position) on every Home Assistant state update.
    this._refreshTimer = window.setInterval(() => this.refresh(), 30 * 60 * 1000);
  }

  disconnectedCallback() {
    if (this._refreshTimer) window.clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;
  }

  setConfig(config: CardConfig) {
    this._config = config;
    this.maybeLoad();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // maybeLoad() no-ops unless the location/config actually changed, so the
    // frequent hass updates don't rebuild the chart and reset the scroll.
    this.maybeLoad();
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

  // Load only when the location/config changed — not on every hass update.
  private maybeLoad() {
    if (!this._hass || !this._config) return;

    const latitude = this._config.latitude ?? this._hass.config.latitude;
    const longitude = this._config.longitude ?? this._hass.config.longitude;
    const key = `${latitude},${longitude},${this._config.days ?? ""},${this._config.proxy_url ?? ""}`;
    if (key === this._lastKey) return;
    this._lastKey = key;

    this.ensureDom();
    this.updateForecast(latitude, longitude, this._config.days);
  }

  // Re-fetch without changing config (used by the periodic refresh timer);
  // updateForecast preserves the current scroll position.
  private refresh() {
    if (!this._hass || !this._config || !this._container) return;
    const latitude = this._config.latitude ?? this._hass.config.latitude;
    const longitude = this._config.longitude ?? this._hass.config.longitude;
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
      // proxy_url is the base that maps to api.met.no; append the MET path.
      const endpoint = `${proxyBase}/weatherapi/locationforecast/2.0/complete?lat=${latitude}&lon=${longitude}`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = (await response.json()) as MetResponse;

      // Show everything MET returns — hourly for the first ~2 days, then
      // 6-hourly further out. The available data determines the period.
      let points = toForecastPoints(data, MET_MAX_DAYS);

      // Optional cap on how far ahead to show.
      if (maxDays && maxDays > 0) {
        const cutoff = Date.now() + maxDays * 24 * 60 * 60 * 1000;
        points = points.filter((p) => p.time.getTime() <= cutoff);
      }

      // Preserve horizontal scroll across the re-render (e.g. periodic refresh).
      const prevScroll = this._container.querySelector<HTMLElement>(".meteogram-scroll")?.scrollLeft ?? 0;
      this._container.innerHTML = "";
      renderMeteogram(this._container, points);
      const scroller = this._container.querySelector<HTMLElement>(".meteogram-scroll");
      if (scroller) scroller.scrollLeft = prevScroll;
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
        background: var(--ha-card-background, var(--card-background-color, #fff));
        border-radius: var(--ha-card-border-radius, 12px);
        padding: 16px;
      }

      /* The inner element is the horizontal scroller; .meteogram-wrap around it
         stays put so the frozen left axis overlay doesn't scroll away. */
      .meteogram-scroll {
        overflow-x: auto;
        /* Match HA's themed scrollbars (dark thumb in dark mode). */
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb-color, #ccc) transparent;
      }
      .meteogram-scroll::-webkit-scrollbar {
        height: 8px;
      }
      .meteogram-scroll::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb-color, #ccc);
        border-radius: 4px;
      }
      .meteogram-scroll::-webkit-scrollbar-track {
        background: transparent;
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

// Guard against double-registration — a module can get loaded more than once
// (e.g. after a HACS update), and a second define() would throw.
if (!customElements.get("meteogram-card")) {
  customElements.define("meteogram-card", MeteogramCard);
}

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
