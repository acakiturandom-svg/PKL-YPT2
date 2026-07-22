
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Haversine formula to calculate distance between two coordinates in meters
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  // formatted as: (latitude)(comma or space)(longitude)
  // Latitude ranges between -90 and 90, Longitude ranges between -180 and 180.
  // This scanner will evaluate patterns of the form: (-?\d+\.\d+)[,\s]+(-?\d+\.\d+)
  const globalRegex = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/g;
  let match;
  while ((match = globalRegex.exec(decoded)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    // Validate typical geographic coordinate ranges
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export function isAppLocked(): boolean {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 18 || hours < 6;
}

export function getNextOpenTime(): Date {
  const now = new Date();
  const openTime = new Date(now);
  openTime.setHours(6, 0, 0, 0);
  if (now.getHours() >= 18) {
    openTime.setDate(openTime.getDate() + 1);
  }
  return openTime;
}


