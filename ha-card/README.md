# Meteogram Card for Home Assistant

A custom Home Assistant card that displays a scrollable, multi-day weather meteogram using MET Norway's free Locationforecast API.

## Features

- 📊 Scrollable chart with temperature, precipitation, and wind data
- 🌍 Uses free MET Norway weather data (CC BY 4.0 licensed)
- 📱 Mobile-friendly interface for Home Assistant Companion
- ⚙️ Configurable location and forecast duration
- 🎨 Respects Home Assistant color schemes

## Installation

### 1. Build the card

```bash
npm install
npm run build:card
```

This generates `ha-card/dist/meteogram-card.js`.

### 2. Copy to Home Assistant

Copy the built file to your Home Assistant config directory:

```
~/.homeassistant/www/community/yr-meteogram/meteogram-card.js
```

(Create the directory if it doesn't exist)

### 3. Add to your dashboard

In your Home Assistant UI:
1. Go to Settings → Dashboards
2. Create or edit a dashboard
3. Click **+ Create card** → **Custom card**
4. Add this YAML:

```yaml
type: custom:meteogram-card
latitude: 59.9139
longitude: 10.7522
days: 5
proxy_url: http://homeassistant.local:8123/api/custom/meteogram/forecast
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `latitude` | number | Home Assistant config latitude | Forecast location latitude |
| `longitude` | number | Home Assistant config longitude | Forecast location longitude |
| `days` | integer | 5 | Number of forecast days to display (1-14) |
| `proxy_url` | string | — | **Required**: URL to your proxy endpoint that adds MET User-Agent header |

## Important: MET API Proxy

MET Norway requires a `User-Agent` header identifying your app and providing a contact email. Browsers cannot set custom headers from client-side JavaScript, so you **must** provide a proxy endpoint.

### Option A: Use Home Assistant's built-in proxy (Recommended)

If you have a Home Assistant integration or custom API endpoint that proxies MET requests with the proper User-Agent header, point `proxy_url` to that endpoint.

### Option B: Set up a simple Node.js proxy (for testing)

Create a small Express server on your Home Assistant machine:

```javascript
// proxy-server.js
import express from "express";

const app = express();
const MET_USER_AGENT = "yr-meteogram-ha (your-email@example.com)";

app.get("/forecast", async (req, res) => {
  const { lat, lon } = req.query;
  try {
    const response = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/classic?lat=${lat}&lon=${lon}`,
      { headers: { "User-Agent": MET_USER_AGENT } }
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log("Proxy running on port 3000"));
```

Run it:
```bash
node proxy-server.js
```

Then use: `proxy_url: http://homeassistant.local:3000/forecast?lat=59.9139&lon=10.7522`

### Option C: Cloudflare Worker (for production)

Deploy a Cloudflare Worker that adds the User-Agent header, then point `proxy_url` to your worker URL.

## Usage

Once installed and configured, the card will:
1. Fetch the latest forecast for your configured location
2. Render a scrollable meteogram with:
   - **Top pane**: Temperature line and precipitation bars
   - **Bottom pane**: Wind speed and gust dashed lines
   - **Day separators**: Vertical lines marking midnight in your timezone

Scroll horizontally to see more forecast days on mobile.

## Troubleshooting

### "Error loading forecast: API error: 403"

Your proxy isn't being used or isn't including the MET User-Agent header. Check:
- `proxy_url` is configured correctly
- Your proxy endpoint includes `User-Agent: yr-meteogram-ha (your-email@example.com)` or similar

### "Error loading forecast: Fetch failed"

You may have a CORS issue. Use a proxy endpoint on your Home Assistant machine or a Cloudflare Worker, not direct MET API calls.

### Card doesn't appear

1. Clear your browser cache
2. Hard reload your Home Assistant dashboard (Ctrl+Shift+R)
3. Check the browser console for errors (F12)

## Data Attribution

Forecast data is from [MET Norway](https://api.met.no/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). You must provide attribution to MET Norway when using this data.

## Development

To modify the card:

```bash
# Watch mode (rebuilds on changes)
npm run build:card:watch

# Then reload your Home Assistant dashboard to see changes
```

Edit `ha-card/src/meteogram-card.ts` to customize the card behavior.

## License

This card is provided under the same license as the main yr-meteogram project.
