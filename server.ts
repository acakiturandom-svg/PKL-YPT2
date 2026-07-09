import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// System for extracting coordinates with high accuracy from any Google Maps link, iframe embed, or raw coordinates
export function extractCoordinates(input: string): { lat: number; lng: number } | null {
  if (!input || typeof input !== 'string') return null;
  
  // 1. Decode URL so we can process query strings with %2C, %20, etc.
  let decoded = input.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch (e) {
    // If decoding fails, continue with raw input
  }

  // 2. Exact match check: coordinates input directly like "-7.250445, 112.768845" (whitespace allowed)
  const rawLatLngRegex = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/;
  const matchRaw = decoded.match(rawLatLngRegex);
  if (matchRaw) {
    const lat = parseFloat(matchRaw[1]);
    const lng = parseFloat(matchRaw[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 3. Scan for common Google Maps patterns first to ensure highest accuracy:
  // PRIORITY 1: q=lat,lng or query=lat,lng or ll=lat,lng (Exact Place Pinpoint)
  const urlQueryCoords = decoded.match(/[?&](q|ll|query|dir_line|saddr|daddr)=(-?\d+\.\d+),(-?\d+\.\d+)/i);
  if (urlQueryCoords) {
    const lat = parseFloat(urlQueryCoords[2]);
    const lng = parseFloat(urlQueryCoords[3]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // PRIORITY 2: !3dlatitude and !4dlongitude in Google maps (Exact Pinpoint)
  // Matching them independently makes extraction highly resilient to parameter sequence/spacing
  const lat3d = decoded.match(/!3d(-?\d+\.\d+)/i);
  const lng4d = decoded.match(/!4d(-?\d+\.\d+)/i);
  if (lat3d && lng4d) {
    const lat = parseFloat(lat3d[1]);
    const lng = parseFloat(lng4d[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // PRIORITY 3: !2dlongitude and !3dlatitude in some alternate embed maps
  const lat3dAlt = decoded.match(/!3d(-?\d+\.\d+)/i);
  const lng2dAlt = decoded.match(/!2d(-?\d+\.\d+)/i);
  if (lat3dAlt && lng2dAlt) {
    const lat = parseFloat(lat3dAlt[1]);
    const lng = parseFloat(lng2dAlt[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // PRIORITY 4: /search/lat,lng or /place/lat,lng or /dir/lat,lng (Specific place paths)
  const pathCoords = decoded.match(/\/(search|place|dir|maps)\/(-?\d+\.\d+),(-?\d+\.\d+)/i);
  if (pathCoords) {
    const lat = parseFloat(pathCoords[2]);
    const lng = parseFloat(pathCoords[3]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // PRIORITY 5: @lat,lng,zoom or @lat,lng (Camera view center. Google Maps shifts this by 30-50m to show detail sidebar. Use ONLY as fallback!)
  const urlAtCoords = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (urlAtCoords) {
    const lat = parseFloat(urlAtCoords[1]);
    const lng = parseFloat(urlAtCoords[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 4. Ultimate Fallback Scanner: Match ANY occurrence of pair of numbers (latitude, longitude)
  const globalRegex = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/g;
  let match;
  while ((match = globalRegex.exec(decoded)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to resolve Google Maps redirect URLs
  app.get("/api/resolve-maps", async (req, res) => {
    const urlStr = req.query.url;
    if (!urlStr || typeof urlStr !== 'string') {
      return res.status(400).json({ error: "URL query parameter is required" });
    }

    try {
      console.log(`Resolving URL: ${urlStr}`);
      const response = await fetch(urlStr, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
        }
      });
      const finalUrl = response.url;
      const htmlText = await response.text();

      // Determine initial coordinates from final redirected URL path/parameters
      let coords = extractCoordinates(finalUrl);
      console.log(`Initial extract from URL path [${finalUrl}]:`, coords);

      // Now fetch and parse the HTML page for the pinpoint og:image staticmap center metadata coordinate.
      // This centers perfectly on the exact search result pinpoint, as opposed to the camera's center coords which are offset 30-50m!
      const staticMapRegexes = [
        /staticmap\?center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i,
        /[\?&]center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i,
        /maps\.google\.com\/maps\/api\/staticmap\?[^"']*(?:center|cbll)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i
      ];

      for (const rx of staticMapRegexes) {
        const match = htmlText.match(rx);
        if (match) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);
          if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            console.log(`Found high-precision PIN center in HTML staticmap metadata: lat=${lat}, lng=${lng}`);
            coords = { lat, lng };
            break;
          }
        }
      }

      console.log(`Final precision coordinate resolved:`, coords);

      res.json({
        success: true,
        originalUrl: urlStr,
        resolvedUrl: finalUrl,
        coords: coords || null
      });
    } catch (error: any) {
      console.error("Error resolving Google Maps URL:", error);
      res.status(500).json({ error: "Failed to resolve link: " + error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
