import type { HomeAssistant } from "custom-card-helpers";

// Reuse the main app's fetch/normalize logic and renderer — single source of
// truth, no duplicated parsing here.
import { fetchForecastPoints, DEFAULT_SOURCE, PROVIDERS, type SourceId } from "../../src/forecast";
import { renderMeteogram } from "../../src/meteogram";

interface CardConfig {
  type: string;
  latitude?: number;
  longitude?: number;
  days?: number;
  // Which forecast source to use. Defaults to MET Norway; other providers are
  // opt-in (see src/forecast/). Each source needs a proxy_url pointed at its
  // matching proxy.
  source?: SourceId;
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
  private _reqSeq = 0;
  private _cardHeight?: number;

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
    const key = `${latitude},${longitude},${this._config.days ?? ""},${this._config.proxy_url ?? ""},${this._config.source ?? ""}`;
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

    const source = this._config?.source ?? DEFAULT_SOURCE;
    const provider = PROVIDERS[source] ?? PROVIDERS[DEFAULT_SOURCE];
    const proxyBase = this._config?.proxy_url?.replace(/\/+$/, "") ?? "";

    // Sources that inject auth (e.g. MET's User-Agent) need a proxy_url; keyless
    // ones (e.g. DMI via Open-Meteo) are called directly, so don't demand it.
    if (provider.requiresProxy && !proxyBase) {
      this._container.innerHTML = "";
      this._statusEl = document.createElement("p");
      this._statusEl.className = "status";
      this._statusEl.textContent =
        "Configuration error: proxy_url is required for this source (a proxy that adds MET's User-Agent header — see the card README).";
      this._container.appendChild(this._statusEl);
      return;
    }

    // Token so a slow fetch that's been superseded (config change or refresh
    // overlap) doesn't clobber a newer render.
    const reqId = ++this._reqSeq;

    try {
      // fetchForecastPoints builds the chosen provider's request URL against
      // proxyBase and normalizes the response. maxDays is the optional `days`
      // cap; MET_MAX_DAYS means "no cap" (exceeds MET's horizon → everything).
      const days = maxDays && maxDays > 0 ? maxDays : MET_MAX_DAYS;
      const points = await fetchForecastPoints(source, proxyBase, latitude, longitude, days);
      if (reqId !== this._reqSeq) return; // a newer request started; drop this one

      // Preserve horizontal scroll across the re-render (e.g. periodic refresh).
      const prevScroll = this._container.querySelector<HTMLElement>(".meteogram-scroll")?.scrollLeft ?? 0;
      this._container.innerHTML = "";
      renderMeteogram(this._container, points);
      const scroller = this._container.querySelector<HTMLElement>(".meteogram-scroll");
      if (scroller) scroller.scrollLeft = prevScroll;
      // Cache the rendered height so getCardSize() reflects the real card size.
      const h = Number(this._container.querySelector("svg")?.getAttribute("height"));
      if (h) this._cardHeight = h;
    } catch (error) {
      if (reqId !== this._reqSeq) return; // superseded; don't overwrite newer state
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
        /* Include padding in the width so the card matches the column width of
           sibling cards instead of overflowing it by 2*padding. */
        box-sizing: border-box;
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
    // HA treats one unit as ~50px. Derive from the rendered height (+ padding)
    // when we have it, otherwise a reasonable default.
    return this._cardHeight ? Math.ceil((this._cardHeight + 32) / 50) : 4;
  }

  // --- Lovelace visual editor hooks ---
  static getConfigElement(): HTMLElement {
    return document.createElement("meteogram-card-editor");
  }

  static getStubConfig(): CardConfig {
    // Sensible default when added via the UI: MET via the recommended
    // same-origin proxy path.
    return { type: "custom:meteogram-card", proxy_url: "/met" };
  }
}

// --- Visual editor (Lovelace UI) ---
// Plain-DOM config editor — no framework / ha-form dependency, matching the
// rest of the card. Emits `config-changed` so HA persists edits live.
class MeteogramCardEditor extends HTMLElement {
  private _root: ShadowRoot;
  private _config: CardConfig = { type: "custom:meteogram-card" };
  private _hass?: HomeAssistant;
  private _fields?: {
    source: HTMLSelectElement;
    proxyUrl: HTMLInputElement;
    proxyRow: HTMLElement;
    latitude: HTMLInputElement;
    longitude: HTMLInputElement;
    days: HTMLInputElement;
  };

  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
  }

  // HA assigns hass; the editor doesn't need it, but accept it cleanly.
  set hass(hass: HomeAssistant) {
    this._hass = hass;
  }

  setConfig(config: CardConfig): void {
    this._config = { ...config };
    this._ensureDom();
    this._syncFromConfig();
  }

  private _ensureDom(): void {
    if (this._fields) return;

    const style = document.createElement("style");
    style.textContent = MeteogramCardEditor.styles;
    this._root.appendChild(style);

    const form = document.createElement("div");
    form.className = "editor";

    const source = document.createElement("select");
    for (const provider of Object.values(PROVIDERS)) {
      const opt = document.createElement("option");
      opt.value = provider.id;
      opt.textContent = provider.label;
      source.appendChild(opt);
    }

    const proxyUrl = document.createElement("input");
    proxyUrl.type = "text";
    proxyUrl.placeholder = "/met";

    const latitude = document.createElement("input");
    latitude.type = "number";
    latitude.step = "0.0001";
    latitude.placeholder = "HA home latitude";

    const longitude = document.createElement("input");
    longitude.type = "number";
    longitude.step = "0.0001";
    longitude.placeholder = "HA home longitude";

    const days = document.createElement("input");
    days.type = "number";
    days.min = "1";
    days.placeholder = "full range";

    form.appendChild(this._row("Source", source, "Where the forecast comes from."));
    const proxyRow = this._row(
      "Proxy URL",
      proxyUrl,
      "Required for MET — a proxy that adds MET's User-Agent (e.g. /met). Not needed for DMI.",
    );
    form.appendChild(proxyRow);
    form.appendChild(this._row("Latitude", latitude, "Optional — defaults to your Home Assistant location."));
    form.appendChild(this._row("Longitude", longitude, "Optional — defaults to your Home Assistant location."));
    form.appendChild(this._row("Days", days, "Optional cap on days shown. Omit for the source's full range."));

    this._root.appendChild(form);
    this._fields = { source, proxyUrl, proxyRow, latitude, longitude, days };

    source.addEventListener("change", () => this._onInput());
    for (const el of [proxyUrl, latitude, longitude, days]) {
      el.addEventListener("input", () => this._onInput());
    }
  }

  private _row(labelText: string, control: HTMLElement, help: string): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = labelText;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = help;
    wrap.append(label, control, hint);
    return wrap;
  }

  // Populate fields from config without disturbing whichever one has focus
  // (setting .value on the focused input would jump the cursor).
  private _syncFromConfig(): void {
    if (!this._fields) return;
    const f = this._fields;
    this._setValue(f.source, this._config.source ?? DEFAULT_SOURCE);
    this._setValue(f.proxyUrl, this._config.proxy_url ?? "");
    this._setValue(f.latitude, this._config.latitude != null ? String(this._config.latitude) : "");
    this._setValue(f.longitude, this._config.longitude != null ? String(this._config.longitude) : "");
    this._setValue(f.days, this._config.days != null ? String(this._config.days) : "");
    this._updateProxyVisibility();
  }

  private _setValue(el: HTMLSelectElement | HTMLInputElement, value: string): void {
    if (this._root.activeElement === el) return; // don't clobber the field being edited
    el.value = value;
  }

  private _updateProxyVisibility(): void {
    if (!this._fields) return;
    const source = (this._fields.source.value || DEFAULT_SOURCE) as SourceId;
    const provider = PROVIDERS[source] ?? PROVIDERS[DEFAULT_SOURCE];
    this._fields.proxyRow.style.display = provider.requiresProxy ? "" : "none";
  }

  private _onInput(): void {
    if (!this._fields) return;
    const f = this._fields;
    const next: CardConfig = { type: this._config.type || "custom:meteogram-card" };

    const source = (f.source.value || DEFAULT_SOURCE) as SourceId;
    if (source !== DEFAULT_SOURCE) next.source = source;

    const proxyUrl = f.proxyUrl.value.trim();
    if (proxyUrl) next.proxy_url = proxyUrl;

    const lat = f.latitude.value.trim();
    if (lat !== "" && !Number.isNaN(Number(lat))) next.latitude = Number(lat);
    const lon = f.longitude.value.trim();
    if (lon !== "" && !Number.isNaN(Number(lon))) next.longitude = Number(lon);

    const days = f.days.value.trim();
    if (days !== "" && Number(days) > 0) next.days = Number(days);

    this._config = next;
    this._updateProxyVisibility();
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  static get styles(): string {
    return `
      .editor {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 8px 0;
        color: var(--primary-text-color, #212121);
        font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
      }
      .field { display: flex; flex-direction: column; gap: 4px; }
      .label { font-size: 13px; font-weight: 600; }
      .hint { font-size: 11px; color: var(--secondary-text-color, #727272); }
      select, input {
        padding: 8px;
        font-size: 14px;
        border: 1px solid var(--divider-color, #ccc);
        border-radius: 6px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #212121);
      }
    `;
  }
}

// Guard against double-registration — a module can get loaded more than once
// (e.g. after a HACS update), and a second define() would throw.
if (!customElements.get("meteogram-card")) {
  customElements.define("meteogram-card", MeteogramCard);
}
if (!customElements.get("meteogram-card-editor")) {
  customElements.define("meteogram-card-editor", MeteogramCardEditor);
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
  description: "Scrollable multi-day weather meteogram (MET Norway or DMI)",
  preview: true,
  documentationURL: "https://github.com/ryssel/yr-meteogram-ts/blob/main/ha-card/README.md",
});
