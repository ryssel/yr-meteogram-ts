/**
 * Simple proxy server for MET Norway API
 * 
 * Use this as a template to run on your Home Assistant machine.
 * This adds the required User-Agent header that MET Norway needs.
 * 
 * Install dependencies:
 *   npm install express
 * 
 * Run:
 *   node proxy-server.js
 * 
 * Then configure the card with:
 *   proxy_url: http://homeassistant.local:3000/forecast?lat=59.9139&lon=10.7522
 */

import express from "express";
import fetch from "node-fetch";

const app = express();

// MET Norway requires a User-Agent identifying your app and a contact email
// See: https://api.met.no/doc/TermsOfService
const MET_USER_AGENT = "yr-meteogram-ha (your-email@example.com)";

app.get("/forecast", async (req, res) => {
  const { lat, lon } = req.query;

  // Validate input
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat and lon query parameters required" });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: "lat and lon must be valid numbers" });
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "lat must be -90 to 90, lon must be -180 to 180" });
  }

  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/classic?lat=${latitude}&lon=${longitude}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": MET_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`MET API returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Forecast error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Meteogram proxy running on http://localhost:${PORT}`);
  console.log(`Call it with: http://localhost:${PORT}/forecast?lat=59.9139&lon=10.7522`);
});
