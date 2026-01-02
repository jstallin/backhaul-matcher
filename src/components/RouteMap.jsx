import { useEffect, useRef, useState } from 'react';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl';
import { MapPin, Navigation, DollarSign, TrendingUp } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox access token - you'll need to replace this with your own
const MAPBOX_TOKEN = 'pk.eyJ1IjoianN0YWxsaW5ncyIsImEiOiJjbWpobW5uMHoxMmFvM2Zwd3U2NjNnd2NmIn0.1NqksRspovws_BZmPhQWfQ';

export const RouteMap = ({ route, backhaul = null, showComparison = false }) => {
  const { colors, theme } = useTheme();
  const mapRef = useRef();
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [backhaulRouteGeoJSON, setBackhaulRouteGeoJSON] = useState(null);
  const [showOriginPopup, setShowOriginPopup] = useState(false);
  const [showDestPopup, setShowDestPopup] = useState(false);
  const [showBackhaulPickupPopup, setShowBackhaulPickupPopup] = useState(false);
  const [showBackhaulDeliveryPopup, setShowBackhaulDeliveryPopup] = useState(false);

  // Fetch route geometry from Mapbox Directions API
  useEffect(() => {
    const fetchRoute = async () => {
      if (!route) return;

      try {
        const coordinates = `${route.origin_lng},${route.origin_lat};${route.dest_lng},${route.dest_lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes[0]) {
          setRouteGeoJSON({
            type: 'Feature',
            geometry: data.routes[0].geometry
          });
        }
      } catch (error) {
        console.error('Error fetching route:', error);
        // Fallback to straight line if API fails
        setRouteGeoJSON({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [route.origin_lng, route.origin_lat],
              [route.dest_lng, route.dest_lat]
            ]
          }
        });
      }
    };

    fetchRoute();
  }, [route]);

  // Fetch backhaul route geometry
  useEffect(() => {
    const fetchBackhaulRoute = async () => {
      if (!backhaul || !route) return;

      try {
        // Route: original dest → backhaul pickup → backhaul delivery
        const coordinates = `${route.dest_lng},${route.dest_lat};${backhaul.pickup_lng},${backhaul.pickup_lat};${backhaul.delivery_lng},${backhaul.delivery_lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes[0]) {
          setBackhaulRouteGeoJSON({
            type: 'Feature',
            geometry: data.routes[0].geometry
          });
        }
      } catch (error) {
        console.error('Error fetching backhaul route:', error);
        // Fallback to straight lines
        setBackhaulRouteGeoJSON({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [route.dest_lng, route.dest_lat],
              [backhaul.pickup_lng, backhaul.pickup_lat],
              [backhaul.delivery_lng, backhaul.delivery_lat]
            ]
          }
        });
      }
    };

    fetchBackhaulRoute();
  }, [backhaul, route]);

  // Fit map to show all points
  useEffect(() => {
    if (mapRef.current && route) {
      const bounds = [
        [route.origin_lng, route.origin_lat],
        [route.dest_lng, route.dest_lat]
      ];

      if (backhaul) {
        bounds.push([backhaul.pickup_lng, backhaul.pickup_lat]);
        bounds.push([backhaul.delivery_lng, backhaul.delivery_lat]);
      }

      // Calculate bounds
      const lngs = bounds.map(b => b[0]);
      const lats = bounds.map(b => b[1]);
      const bbox = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ];

      mapRef.current.fitBounds(bbox, {
        padding: 60,
        duration: 1000
      });
    }
  }, [route, backhaul, routeGeoJSON, backhaulRouteGeoJSON]);

  if (!route) return null;

  const mapStyle = theme === 'dark' 
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11';

  return (
    <div style={{ 
      width: '100%', 
      height: showComparison ? '500px' : '600px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: `1px solid ${colors.border.primary}`
    }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: (route.origin_lng + route.dest_lng) / 2,
          latitude: (route.origin_lat + route.dest_lat) / 2,
          zoom: 6
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
      >
        {/* Primary Route Line */}
        {routeGeoJSON && (
          <Source type="geojson" data={routeGeoJSON}>
            <Layer
              id="route"
              type="line"
              paint={{
                'line-color': colors.accent.primary,
                'line-width': 4,
                'line-opacity': 0.8
              }}
            />
          </Source>
        )}

        {/* Backhaul Route Line */}
        {backhaulRouteGeoJSON && (
          <Source type="geojson" data={backhaulRouteGeoJSON}>
            <Layer
              id="backhaul-route"
              type="line"
              paint={{
                'line-color': colors.accent.success,
                'line-width': 4,
                'line-opacity': 0.8,
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}

        {/* Origin Marker */}
        <Marker
          longitude={route.origin_lng}
          latitude={route.origin_lat}
          anchor="bottom"
        >
          <div
            onClick={() => setShowOriginPopup(!showOriginPopup)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <div style={{
              background: colors.accent.primary,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              <MapPin size={18} color="white" />
            </div>
            <div style={{
              marginTop: '4px',
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '4px',
              whiteSpace: 'nowrap'
            }}>
              ORIGIN
            </div>
          </div>
        </Marker>

        {showOriginPopup && (
          <Popup
            longitude={route.origin_lng}
            latitude={route.origin_lat}
            anchor="top"
            onClose={() => setShowOriginPopup(false)}
            closeButton={true}
            closeOnClick={false}
          >
            <div style={{ padding: '8px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                Origin
              </div>
              <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                {route.origin_city}
              </div>
            </div>
          </Popup>
        )}

        {/* Destination Marker */}
        <Marker
          longitude={route.dest_lng}
          latitude={route.dest_lat}
          anchor="bottom"
        >
          <div
            onClick={() => setShowDestPopup(!showDestPopup)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <div style={{
              background: backhaul ? colors.accent.primary : colors.accent.info,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              <Navigation size={18} color="white" />
            </div>
            <div style={{
              marginTop: '4px',
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '4px',
              whiteSpace: 'nowrap'
            }}>
              DELIVERY
            </div>
          </div>
        </Marker>

        {showDestPopup && (
          <Popup
            longitude={route.dest_lng}
            latitude={route.dest_lat}
            anchor="top"
            onClose={() => setShowDestPopup(false)}
            closeButton={true}
            closeOnClick={false}
          >
            <div style={{ padding: '8px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                Primary Delivery
              </div>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '8px' }}>
                {route.dest_city}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>
                {route.distance} mi · ${route.revenue.toLocaleString()}
              </div>
            </div>
          </Popup>
        )}

        {/* Backhaul Pickup Marker */}
        {backhaul && (
          <Marker
            longitude={backhaul.pickup_lng}
            latitude={backhaul.pickup_lat}
            anchor="bottom"
          >
            <div
              onClick={() => setShowBackhaulPickupPopup(!showBackhaulPickupPopup)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
            >
              <div style={{
                background: colors.accent.success,
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}>
                <MapPin size={18} color="white" />
              </div>
              <div style={{
                marginTop: '4px',
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '4px',
                whiteSpace: 'nowrap'
              }}>
                PICKUP
              </div>
            </div>
          </Marker>
        )}

        {showBackhaulPickupPopup && backhaul && (
          <Popup
            longitude={backhaul.pickup_lng}
            latitude={backhaul.pickup_lat}
            anchor="top"
            onClose={() => setShowBackhaulPickupPopup(false)}
            closeButton={true}
            closeOnClick={false}
          >
            <div style={{ padding: '8px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                Backhaul Pickup
              </div>
              <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                {backhaul.pickup_city}
              </div>
            </div>
          </Popup>
        )}

        {/* Backhaul Delivery Marker */}
        {backhaul && (
          <Marker
            longitude={backhaul.delivery_lng}
            latitude={backhaul.delivery_lat}
            anchor="bottom"
          >
            <div
              onClick={() => setShowBackhaulDeliveryPopup(!showBackhaulDeliveryPopup)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
            >
              <div style={{
                background: colors.accent.success,
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}>
                <DollarSign size={18} color="white" />
              </div>
              <div style={{
                marginTop: '4px',
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '4px',
                whiteSpace: 'nowrap'
              }}>
                BACKHAUL
              </div>
            </div>
          </Marker>
        )}

        {showBackhaulDeliveryPopup && backhaul && (
          <Popup
            longitude={backhaul.delivery_lng}
            latitude={backhaul.delivery_lat}
            anchor="top"
            onClose={() => setShowBackhaulDeliveryPopup(false)}
            closeButton={true}
            closeOnClick={false}
          >
            <div style={{ padding: '8px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '14px' }}>
                Backhaul Delivery
              </div>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '8px' }}>
                {backhaul.delivery_city}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>
                {backhaul.distance} mi · ${backhaul.revenue.toLocaleString()}
              </div>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
};
