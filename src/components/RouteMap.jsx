import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, DollarSign } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { getRouteGeometry, geocodeAddress } from '../utils/pcMilerClient';

// Create a colored circle icon for markers
const createCircleIcon = (color, size = 32) => L.divIcon({
  className: '',
  html: `<div style="
    background: ${color};
    border-radius: 50%;
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  "><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  popupAnchor: [0, -size / 2]
});

const createLabeledIcon = (color, label, size = 32) => L.divIcon({
  className: '',
  html: `<div style="
    display: flex;
    flex-direction: column;
    align-items: center;
  ">
    <div style="
      background: ${color};
      border-radius: 50%;
      width: ${size}px;
      height: ${size}px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>
    <div style="
      margin-top: 4px;
      padding: 4px 8px;
      background: rgba(0,0,0,0.7);
      color: white;
      font-size: 11px;
      font-weight: 700;
      border-radius: 4px;
      white-space: nowrap;
    ">${label}</div>
  </div>`,
  iconSize: [size, size + 28],
  iconAnchor: [size / 2, size / 2],
  popupAnchor: [0, -size / 2]
});

// Component to fit bounds
const FitBounds = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (points && points.length >= 2) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], duration: 1.0 });
      }
    }
  }, [points, map]);

  return null;
};

export const RouteMap = ({ route, backhaul = null, showComparison = false }) => {
  const { colors, theme } = useTheme();
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [backhaulRouteGeoJSON, setBackhaulRouteGeoJSON] = useState(null);
  const [resolvedRoute, setResolvedRoute] = useState(null);
  const [geocoding, setGeocoding] = useState(false);

  // Geocode city strings when lat/lng coordinates are missing
  useEffect(() => {
    if (!route) { setResolvedRoute(null); return; }

    const needsGeocode = route.origin_lat == null || route.dest_lat == null;
    if (!needsGeocode) { setResolvedRoute(route); return; }

    const resolve = async () => {
      setGeocoding(true);
      const [originResult, destResult] = await Promise.all([
        route.origin_lat == null && route.origin_city ? geocodeAddress(route.origin_city) : Promise.resolve(null),
        route.dest_lat == null && route.dest_city     ? geocodeAddress(route.dest_city)   : Promise.resolve(null),
      ]);
      setResolvedRoute({
        ...route,
        origin_lat: originResult?.lat ?? route.origin_lat,
        origin_lng: originResult?.lng ?? route.origin_lng,
        dest_lat:   destResult?.lat   ?? route.dest_lat,
        dest_lng:   destResult?.lng   ?? route.dest_lng,
      });
      setGeocoding(false);
    };
    resolve();
  }, [route]);

  // Fetch primary route geometry from PC Miler
  useEffect(() => {
    const fetchRoute = async () => {
      if (!resolvedRoute) return;

      const geometry = await getRouteGeometry([
        { lat: resolvedRoute.origin_lat, lng: resolvedRoute.origin_lng },
        { lat: resolvedRoute.dest_lat, lng: resolvedRoute.dest_lng }
      ]);

      if (geometry) {
        setRouteGeoJSON({ type: 'Feature', geometry });
      } else {
        // Fallback to straight line
        setRouteGeoJSON({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [resolvedRoute.origin_lng, resolvedRoute.origin_lat],
              [resolvedRoute.dest_lng, resolvedRoute.dest_lat]
            ]
          }
        });
      }
    };
    fetchRoute();
  }, [resolvedRoute]);

  // Fetch backhaul route geometry from PC Miler
  useEffect(() => {
    const fetchBackhaulRoute = async () => {
      if (!backhaul || !resolvedRoute) return;

      const geometry = await getRouteGeometry([
        { lat: resolvedRoute.dest_lat, lng: resolvedRoute.dest_lng },
        { lat: backhaul.pickup_lat, lng: backhaul.pickup_lng },
        { lat: backhaul.delivery_lat, lng: backhaul.delivery_lng }
      ]);

      if (geometry) {
        setBackhaulRouteGeoJSON({ type: 'Feature', geometry });
      } else {
        // Fallback to straight lines
        setBackhaulRouteGeoJSON({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [resolvedRoute.dest_lng, resolvedRoute.dest_lat],
              [backhaul.pickup_lng, backhaul.pickup_lat],
              [backhaul.delivery_lng, backhaul.delivery_lat]
            ]
          }
        });
      }
    };
    fetchBackhaulRoute();
  }, [backhaul, resolvedRoute]);

  // Bounds points for fitting
  const boundsPoints = useMemo(() => {
    if (!resolvedRoute) return [];
    const pts = [
      [resolvedRoute.origin_lat, resolvedRoute.origin_lng],
      [resolvedRoute.dest_lat, resolvedRoute.dest_lng]
    ];
    if (backhaul) {
      pts.push([backhaul.pickup_lat, backhaul.pickup_lng]);
      pts.push([backhaul.delivery_lat, backhaul.delivery_lng]);
    }
    return pts;
  }, [resolvedRoute, backhaul]);

  if (!route) return null;
  if (geocoding) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF' }}>
        Locating route...
      </div>
    );
  }
  if (!resolvedRoute || resolvedRoute.origin_lat == null || resolvedRoute.origin_lng == null || resolvedRoute.dest_lat == null || resolvedRoute.dest_lng == null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF' }}>
        Map unavailable — coordinates not found for this load.
      </div>
    );
  }

  // OSM tile URLs — free, no API key needed
  const tileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = theme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  const routeLineStyle = {
    color: colors.accent.primary,
    weight: 4,
    opacity: 0.8
  };

  const backhaulLineStyle = {
    color: colors.accent.success,
    weight: 4,
    opacity: 0.8,
    dashArray: '8 8'
  };

  return (
    <div style={{
      width: '100%',
      height: showComparison ? '500px' : '600px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: `1px solid ${colors.border.primary}`
    }}>
      <MapContainer
        center={[(resolvedRoute.origin_lat + resolvedRoute.dest_lat) / 2, (resolvedRoute.origin_lng + resolvedRoute.dest_lng) / 2]}
        zoom={6}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url={tileUrl}
          attribution={tileAttribution}
        />

        <FitBounds points={boundsPoints} />

        {/* Primary Route Line */}
        {routeGeoJSON && (
          <GeoJSON
            key={`route-${resolvedRoute.origin_lat}-${resolvedRoute.dest_lat}`}
            data={routeGeoJSON}
            style={routeLineStyle}
          />
        )}

        {/* Backhaul Route Line */}
        {backhaulRouteGeoJSON && (
          <GeoJSON
            key={`backhaul-${backhaul?.pickup_lat}-${backhaul?.delivery_lat}`}
            data={backhaulRouteGeoJSON}
            style={backhaulLineStyle}
          />
        )}

        {/* Origin Marker */}
        <Marker
          position={[resolvedRoute.origin_lat, resolvedRoute.origin_lng]}
          icon={createLabeledIcon(colors.accent.primary, 'ORIGIN', 32)}
        >
          <Popup>
            <div style={{ padding: '4px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                Origin
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {resolvedRoute.origin_city}
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Destination Marker */}
        <Marker
          position={[resolvedRoute.dest_lat, resolvedRoute.dest_lng]}
          icon={createLabeledIcon(
            backhaul ? colors.accent.primary : colors.accent.info,
            'DELIVERY',
            32
          )}
        >
          <Popup>
            <div style={{ padding: '4px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                Primary Delivery
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                {resolvedRoute.dest_city}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>
                {resolvedRoute.distance} mi &middot; ${resolvedRoute.revenue?.toLocaleString()}
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Backhaul Pickup Marker */}
        {backhaul && (
          <Marker
            position={[backhaul.pickup_lat, backhaul.pickup_lng]}
            icon={createLabeledIcon(colors.accent.success, 'PICKUP', 32)}
          >
            <Popup>
              <div style={{ padding: '4px', minWidth: '200px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                  Backhaul Pickup
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {backhaul.pickup_city}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Backhaul Delivery Marker */}
        {backhaul && (
          <Marker
            position={[backhaul.delivery_lat, backhaul.delivery_lng]}
            icon={createLabeledIcon(colors.accent.success, 'BACKHAUL', 32)}
          >
            <Popup>
              <div style={{ padding: '4px', minWidth: '200px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                  Backhaul Delivery
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  {backhaul.delivery_city}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600 }}>
                  {backhaul.distance} mi &middot; ${backhaul.revenue?.toLocaleString()}
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
