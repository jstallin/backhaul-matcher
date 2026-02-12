import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox access token from environment variable
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export const RouteHomeMap = ({ datumPoint, fleetHome, backhauls, selectedLoadId, routeData }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const mapLoaded = useRef(false);

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [datumPoint.lng, datumPoint.lat],
      zoom: 6
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      mapLoaded.current = true;
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        mapLoaded.current = false;
      }
    };
  }, []);

  // Update map data when props change
  useEffect(() => {
    if (!map.current) return;

    const updateMap = () => {
      // Clear existing markers
      markers.current.forEach(marker => marker.remove());
      markers.current = [];

      const bounds = new mapboxgl.LngLatBounds();

      // Update or add corridor
      if (routeData && routeData.corridor) {
        const corridorData = {
          type: 'Feature',
          geometry: routeData.corridor
        };

        if (map.current.getSource('route-corridor')) {
          map.current.getSource('route-corridor').setData(corridorData);
        } else {
          map.current.addSource('route-corridor', {
            type: 'geojson',
            data: corridorData
          });

          map.current.addLayer({
            id: 'route-corridor-fill',
            type: 'fill',
            source: 'route-corridor',
            paint: {
              'fill-color': '#D89F38',
              'fill-opacity': 0.15
            }
          });

          map.current.addLayer({
            id: 'route-corridor-outline',
            type: 'line',
            source: 'route-corridor',
            paint: {
              'line-color': '#D89F38',
              'line-width': 2,
              'line-opacity': 0.5,
              'line-dasharray': [4, 4]
            }
          });
        }
      }

      // Update or add route line
      if (routeData && routeData.route) {
        const routeLineData = {
          type: 'Feature',
          geometry: routeData.route
        };

        if (map.current.getSource('actual-route')) {
          map.current.getSource('actual-route').setData(routeLineData);
        } else {
          map.current.addSource('actual-route', {
            type: 'geojson',
            data: routeLineData
          });

          map.current.addLayer({
            id: 'actual-route-line',
            type: 'line',
            source: 'actual-route',
            paint: {
              'line-color': '#6B7280',
              'line-width': 3,
              'line-opacity': 0.7
            }
          });
        }
      } else if (!map.current.getSource('actual-route')) {
        // Fallback: fetch route if not provided
        fetchActualRoute();
      }

      // Add datum marker (Point A - red)
      const datumEl = document.createElement('div');
      datumEl.innerHTML = `
        <div style="
          background: #EF4444;
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 18px;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">A</div>
      `;
      const datumMarker = new mapboxgl.Marker({ element: datumEl })
        .setLngLat([datumPoint.lng, datumPoint.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="padding: 8px;">
            <strong>Datum Point</strong><br/>
            Current Location
          </div>
        `))
        .addTo(map.current);
      markers.current.push(datumMarker);
      bounds.extend([datumPoint.lng, datumPoint.lat]);

      // Add fleet home marker (Point B - green)
      const homeEl = document.createElement('div');
      homeEl.innerHTML = `
        <div style="
          background: #10B981;
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 18px;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">B</div>
      `;
      const homeMarker = new mapboxgl.Marker({ element: homeEl })
        .setLngLat([fleetHome.lng, fleetHome.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
          <div style="padding: 8px;">
            <strong>Fleet Home</strong><br/>
            ${fleetHome.address || 'Base Location'}
          </div>
        `))
        .addTo(map.current);
      markers.current.push(homeMarker);
      bounds.extend([fleetHome.lng, fleetHome.lat]);

      // Add top 10 backhaul markers
      const top10 = backhauls.slice(0, 10);
      top10.forEach((load, index) => {
        const loadNum = index + 1;
        const isSelected = load.load_id === selectedLoadId;

        // Pickup marker (golden amber)
        const pickupEl = document.createElement('div');
        pickupEl.innerHTML = `
          <div style="
            background: ${isSelected ? '#F59E0B' : '#D89F38'};
            color: white;
            width: ${isSelected ? '32px' : '28px'};
            height: ${isSelected ? '32px' : '28px'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            font-size: ${isSelected ? '14px' : '12px'};
            border: ${isSelected ? '3px' : '2px'} solid white;
            box-shadow: 0 2px ${isSelected ? '8' : '4'}px rgba(0,0,0,0.3);
            cursor: pointer;
          ">${loadNum}</div>
        `;
        const pickupMarker = new mapboxgl.Marker({ element: pickupEl })
          .setLngLat([load.pickup_lng, load.pickup_lat])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="padding: 8px;">
              <strong>#${loadNum} Pickup</strong><br/>
              ${load.pickup_city}, ${load.pickup_state}<br/>
              <span style="font-size: 11px; color: #666;">
                ${load.datum_to_pickup_miles} mi from datum
              </span>
            </div>
          `))
          .addTo(map.current);
        markers.current.push(pickupMarker);
        bounds.extend([load.pickup_lng, load.pickup_lat]);

        // Delivery marker (blue)
        const deliveryEl = document.createElement('div');
        deliveryEl.innerHTML = `
          <div style="
            background: ${isSelected ? '#3B82F6' : '#5EA0DB'};
            color: white;
            width: ${isSelected ? '28px' : '24px'};
            height: ${isSelected ? '28px' : '24px'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: ${isSelected ? '12px' : '11px'};
            border: 2px solid white;
            box-shadow: 0 2px ${isSelected ? '6' : '4'}px rgba(0,0,0,0.3);
            cursor: pointer;
          ">${loadNum}</div>
        `;
        const deliveryMarker = new mapboxgl.Marker({ element: deliveryEl })
          .setLngLat([load.delivery_lng, load.delivery_lat])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="padding: 8px;">
              <strong>#${loadNum} Delivery</strong><br/>
              ${load.delivery_city}, ${load.delivery_state}<br/>
              <span style="font-size: 11px; color: #666;">
                ${load.delivery_to_home_miles} mi to home<br/>
                ${load.formatted_revenue} • ${load.formatted_rpm}/mi
              </span>
            </div>
          `))
          .addTo(map.current);
        markers.current.push(deliveryMarker);
        bounds.extend([load.delivery_lng, load.delivery_lat]);
      });

      // Fit map to show all markers
      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 8
        });
      }
    };

    // Fallback: Fetch actual driving route from Mapbox Directions API
    const fetchActualRoute = async () => {
      try {
        if (map.current.getSource('actual-route')) return;

        const coordinates = `${datumPoint.lng},${datumPoint.lat};${fleetHome.lng},${fleetHome.lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes[0] && !map.current.getSource('actual-route')) {
          const route = data.routes[0].geometry;

          map.current.addSource('actual-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: route
            }
          });

          map.current.addLayer({
            id: 'actual-route-line',
            type: 'line',
            source: 'actual-route',
            paint: {
              'line-color': '#9CA3AF',
              'line-width': 3,
              'line-opacity': 0.6
            }
          });
        }
      } catch (error) {
        console.error('Error fetching route:', error);
      }
    };

    // Wait for map to load before updating
    if (map.current.loaded()) {
      updateMap();
    } else {
      map.current.on('load', updateMap);
    }

  }, [datumPoint, fleetHome, backhauls, selectedLoadId, routeData]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: '100%',
        height: '400px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #E5E7EB'
      }}
    />
  );
};
