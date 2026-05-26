import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';

// Module-level cache — shared across all cards, persists across re-runs
const geocodeCache = new Map();

const geocodeCityState = async (city, state) => {
  if (!city || !state) return null;
  const key = `${city.toLowerCase()},${state.toLowerCase()}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&countrycodes=us&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data?.[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(key, coords);
      return coords;
    }
  } catch {}
  geocodeCache.set(key, null);
  return null;
};

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [18, 18] });
    }
  }, [map, points]);
  return null;
}

export function ChainRouteMap({ chain, fleetHome, height = 150, eager = false }) {
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(eager);
  const [points, setPoints] = useState(null);

  // Trigger geocoding when card scrolls within 300px of viewport
  useEffect(() => {
    if (eager) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible) return;
    const { outboundLoad, connectorLoad, returnLoad, is3Load } = chain;
    const home = { lat: fleetHome.lat, lng: fleetHome.lng };

    const resolve = async (load, end) => {
      const lat = end === 'pickup' ? load.pickup_lat : load.delivery_lat;
      const lng = end === 'pickup' ? load.pickup_lng : load.delivery_lng;
      if (lat != null && lng != null) return { lat, lng };
      const city = end === 'pickup' ? load.pickup_city : load.delivery_city;
      const state = end === 'pickup' ? load.pickup_state : load.delivery_state;
      return geocodeCityState(city, state);
    };

    const load = async () => {
      const raw = [
        home,
        await resolve(outboundLoad, 'pickup'),
        await resolve(outboundLoad, 'delivery'),
        ...(is3Load && connectorLoad ? [
          await resolve(connectorLoad, 'pickup'),
          await resolve(connectorLoad, 'delivery'),
        ] : []),
        await resolve(returnLoad, 'pickup'),
        await resolve(returnLoad, 'delivery'),
        home,
      ];
      setPoints(raw.filter(Boolean));
    };
    load();
  }, [visible, chain, fleetHome]);

  const polyLine = useMemo(() => points?.map(p => [p.lat, p.lng]) ?? [], [points]);

  // Unique points for bounds (remove duplicate closing home)
  const uniquePoints = useMemo(() => {
    if (!points || points.length < 2) return [];
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const p = points[i], prev = points[i - 1];
      if (p.lat !== prev.lat || p.lng !== prev.lng) out.push(p);
    }
    return out;
  }, [points]);

  if (!visible) {
    return <div ref={containerRef} style={{ height, background: '#f1f5f9' }} />;
  }

  if (!points || uniquePoints.length < 2) {
    return (
      <div ref={containerRef} style={{ height, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Loading map…</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height }}>
      <MapContainer
        center={[uniquePoints[0].lat, uniquePoints[0].lng]}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={uniquePoints} />
        <Polyline positions={polyLine} color="#3b82f6" weight={2.5} opacity={0.8} dashArray="8,5" />
        {/* Home — filled blue */}
        <CircleMarker
          center={[fleetHome.lat, fleetHome.lng]}
          radius={7} fillColor="#3b82f6" color="#fff" weight={2.5} fillOpacity={1}
        />
        {/* Intermediate stops — white with gray border */}
        {uniquePoints.slice(1).map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={5} fillColor="#fff" color="#64748b" weight={2} fillOpacity={1}
          />
        ))}
      </MapContainer>
    </div>
  );
}
