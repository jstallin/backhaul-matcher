import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRouteGeometry } from '../utils/pcMilerClient';

// Create a colored circle icon for markers
const createCircleIcon = (color, label, size = 36) => L.divIcon({
  className: '',
  html: `<div style="
    background: ${color};
    color: white;
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: ${Math.round(size * 0.45)}px;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    cursor: pointer;
  ">${label}</div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  popupAnchor: [0, -size / 2]
});

// Component to fit map bounds
const FitBounds = ({ bounds, initialFitDone }) => {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (bounds && bounds.length > 0 && !fitted.current) {
      const leafletBounds = L.latLngBounds(bounds.map(([lat, lng]) => [lat, lng]));
      if (leafletBounds.isValid()) {
        map.fitBounds(leafletBounds, { padding: [50, 50], maxZoom: 8 });
        fitted.current = true;
      }
    }
  }, [bounds, map]);

  // Reset fit flag when route changes
  useEffect(() => {
    if (initialFitDone === false) {
      fitted.current = false;
    }
  }, [initialFitDone]);

  return null;
};

// Component to fetch fallback route if not provided
const FallbackRoute = ({ datumPoint, fleetHome, routeData, onRouteLoaded }) => {
  const loaded = useRef(false);

  useEffect(() => {
    if (routeData?.route || loaded.current) return;
    loaded.current = true;

    const fetchRoute = async () => {
      const geometry = await getRouteGeometry([datumPoint, fleetHome]);
      if (geometry) {
        onRouteLoaded(geometry);
      }
    };
    fetchRoute();
  }, [datumPoint, fleetHome, routeData]);

  return null;
};

export const RouteHomeMap = ({ datumPoint, fleetHome, backhauls, selectedLoadId, routeData }) => {
  const fallbackRouteRef = useRef(null);

  // Collect all bounds points
  const boundsPoints = useMemo(() => {
    const points = [];
    if (datumPoint) points.push([datumPoint.lat, datumPoint.lng]);
    if (fleetHome) points.push([fleetHome.lat, fleetHome.lng]);
    const top10 = (backhauls || []).slice(0, 10);
    top10.forEach(load => {
      if (load.pickup_lat && load.pickup_lng) points.push([load.pickup_lat, load.pickup_lng]);
      if (load.delivery_lat && load.delivery_lng) points.push([load.delivery_lat, load.delivery_lng]);
    });
    return points;
  }, [datumPoint, fleetHome, backhauls]);

  // Corridor GeoJSON style
  const corridorStyle = {
    fillColor: '#008b00',
    fillOpacity: 0.15,
    color: '#008b00',
    weight: 2,
    opacity: 0.5,
    dashArray: '8 8'
  };

  // Route line GeoJSON style
  const routeStyle = {
    color: '#6B7280',
    weight: 3,
    opacity: 0.7
  };

  const top10 = (backhauls || []).slice(0, 10);

  // Route key for detecting changes
  const routeKey = datumPoint && fleetHome
    ? `${datumPoint.lat},${datumPoint.lng}->${fleetHome.lat},${fleetHome.lng}`
    : '';

  // Prepare GeoJSON features
  const corridorFeature = routeData?.corridor ? {
    type: 'Feature',
    geometry: routeData.corridor
  } : null;

  const routeFeature = routeData?.route ? {
    type: 'Feature',
    geometry: routeData.route
  } : (fallbackRouteRef.current ? {
    type: 'Feature',
    geometry: fallbackRouteRef.current
  } : null);

  if (!datumPoint) return null;

  return (
    <div style={{
      width: '100%',
      height: '400px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid #E5E7EB'
    }}>
      <MapContainer
        center={[datumPoint.lat, datumPoint.lng]}
        zoom={6}
        minZoom={3}
        maxZoom={18}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <FitBounds bounds={boundsPoints} initialFitDone={null} />

        <FallbackRoute
          datumPoint={datumPoint}
          fleetHome={fleetHome}
          routeData={routeData}
          onRouteLoaded={(geom) => { fallbackRouteRef.current = geom; }}
        />

        {/* Corridor polygon */}
        {corridorFeature && (
          <GeoJSON key={`corridor-${routeKey}`} data={corridorFeature} style={corridorStyle} />
        )}

        {/* Route line */}
        {routeFeature && (
          <GeoJSON key={`route-${routeKey}`} data={routeFeature} style={routeStyle} />
        )}

        {/* Datum marker (Point A - red) */}
        <Marker
          position={[datumPoint.lat, datumPoint.lng]}
          icon={createCircleIcon('#EF4444', 'A', 36)}
        >
          <Popup>
            <div style={{ padding: '4px' }}>
              <strong>Datum Point</strong><br/>
              Current Location
            </div>
          </Popup>
        </Marker>

        {/* Fleet home marker (Point B - green) */}
        {fleetHome && (
          <Marker
            position={[fleetHome.lat, fleetHome.lng]}
            icon={createCircleIcon('#10B981', 'B', 36)}
          >
            <Popup>
              <div style={{ padding: '4px' }}>
                <strong>Fleet Home</strong><br/>
                {fleetHome.address || 'Base Location'}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Top 10 backhaul markers */}
        {top10.map((load, index) => {
          const loadNum = index + 1;
          const isSelected = load.load_id === selectedLoadId;
          const pickupSize = isSelected ? 32 : 28;
          const deliverySize = isSelected ? 28 : 24;

          return (
            <span key={`backhaul-${load.load_id}`}>
              {/* Pickup marker (golden amber) */}
              <Marker
                position={[load.pickup_lat, load.pickup_lng]}
                icon={createCircleIcon(
                  isSelected ? '#00a300' : '#008b00',
                  String(loadNum),
                  pickupSize
                )}
              >
                <Popup>
                  <div style={{ padding: '4px' }}>
                    <strong>#{loadNum} Pickup</strong><br/>
                    {load.pickup_city}, {load.pickup_state}<br/>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {load.datum_to_pickup_miles} mi from datum
                    </span>
                  </div>
                </Popup>
              </Marker>

              {/* Delivery marker (blue) */}
              <Marker
                position={[load.delivery_lat, load.delivery_lng]}
                icon={createCircleIcon(
                  isSelected ? '#3B82F6' : '#5EA0DB',
                  String(loadNum),
                  deliverySize
                )}
              >
                <Popup>
                  <div style={{ padding: '4px' }}>
                    <strong>#{loadNum} Delivery</strong><br/>
                    {load.delivery_city}, {load.delivery_state}<br/>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {load.delivery_to_home_miles} mi to home<br/>
                      {load.formatted_revenue} &middot; {load.formatted_rpm}/mi
                    </span>
                  </div>
                </Popup>
              </Marker>
            </span>
          );
        })}
      </MapContainer>
    </div>
  );
};
