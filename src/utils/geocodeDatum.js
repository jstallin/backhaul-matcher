/**
 * Canonical datum-point geocoder — the SINGLE source of truth shared by v1
 * (OpenRequests), v2 (SearchView), and the server cron (refresh-requests.js).
 *
 * Before this existed the three paths used three different geocoders (v1: Mapbox,
 * v2: PC*MILER, cron: Mapbox+hardcoded), so the same request could return wildly
 * different match counts depending on entry path. See the 0-vs-71 divergence.
 *
 * Provider chain (per product decision 2026-06-10):
 *   1. PC*MILER Locations — strategic partner, SAME provider as routing/distance,
 *      so the datum coords agree with the leg distances.
 *   2. Mapbox            — reliable fallback when PC*MILER returns no hit.
 *   3. local city/ZIP    — last-resort offline tables (inside mapbox geocodeAddress).
 *
 * Isomorphic: both underlying geocoders detect client vs server context, so this
 * runs unchanged in the browser (proxy + JWT / VITE_ env) and in the cron
 * (direct PC*MILER + process.env). Returns { lat, lng, label } or null.
 */
import { geocodeAddress as pcmilerGeocode } from './pcMilerClient';
import { geocodeAddress as mapboxGeocode } from './mapboxGeocoding';

const normalize = (r, fallbackLabel) =>
  (r && r.lat != null && r.lng != null)
    ? { lat: Number(r.lat), lng: Number(r.lng), label: r.label || r.city || fallbackLabel }
    : null;

export const geocodeDatum = async (address) => {
  if (!address || !String(address).trim()) return null;
  const addr = String(address).trim();

  // 1. PC*MILER Locations (strategic; matches the routing provider)
  try {
    const pc = normalize(await pcmilerGeocode(addr), addr);
    if (pc) return pc;
  } catch (e) {
    console.warn('geocodeDatum: PC*MILER step failed, falling back to Mapbox:', e?.message || e);
  }

  // 2. Mapbox → 3. local tables (mapboxGeocode already chains these internally)
  try {
    const mb = normalize(await mapboxGeocode(addr), addr);
    if (mb) return mb;
  } catch (e) {
    console.warn('geocodeDatum: Mapbox step failed:', e?.message || e);
  }

  return null;
};
