/**
 * Generate a printable Top 10 Backhaul Report in a new browser tab.
 * Opens a self-contained HTML page with a Leaflet map + formatted load cards,
 * then auto-triggers the print dialog once tiles have loaded.
 */

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0);

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function generateTop10Report({ request, fleet, matches, datumCoordinates, fleetHome, routeData }) {
  const top10 = matches.slice(0, 10);
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Build markers JSON for the Leaflet script inside the report
  const mapData = {
    datum: datumCoordinates,
    home: fleetHome,
    corridor: routeData?.corridor ?? null,
    route: routeData?.route ?? null,
    loads: top10.map((m, i) => ({
      num: i + 1,
      pickupLat: m.pickup_lat,
      pickupLng: m.pickup_lng,
      pickupCity: m.origin?.address || `${m.pickup_city}, ${m.pickup_state}`,
      deliveryLat: m.delivery_lat,
      deliveryLng: m.delivery_lng,
      deliveryCity: m.destination?.address || `${m.delivery_city}, ${m.delivery_state}`,
    }))
  };

  // Build load card rows
  const loadRows = top10.map((m, i) => {
    const rank = ['🥇 Best Match', '🥈 2nd', '🥉 3rd'][i] ?? `#${i + 1}`;
    const pickup = m.origin?.address || `${m.pickup_city}, ${m.pickup_state}`;
    const delivery = m.destination?.address || `${m.delivery_city}, ${m.delivery_state}`;
    const revenue = m.totalRevenue ?? m.total_revenue ?? 0;
    const rpm = m.revenuePerMile ?? m.revenue_per_mile ?? 0;
    const addlMiles = m.additionalMiles ?? m.additional_miles ?? 0;
    const pickupToDelivery = m.pickup_to_delivery_miles ?? m.distance_miles ?? 0;
    const datumToPickup = m.datum_to_pickup_miles ?? m.finalToPickup ?? 0;
    const deliveryToHome = m.delivery_to_home_miles ?? 0;
    const equipType = m.equipment_type ?? m.equipmentType ?? '';
    const weight = m.weight_lbs ?? m.weight ?? '';
    const shipDate = formatDate(m.ship_date ?? m.pickupDate);
    const netCredit = m.has_rate_config ? m.customer_net_credit : null;

    return `
    <div class="load-card ${i === 0 ? 'best' : i < 3 ? 'top3' : ''}">
      <div class="load-header">
        <div class="rank-badge">${rank}</div>
        <div class="load-number">${i + 1}</div>
      </div>
      <div class="route-row">
        <div class="stop">
          <div class="stop-label">Pickup</div>
          <div class="stop-city">${pickup}</div>
          ${shipDate ? `<div class="stop-date">${shipDate}</div>` : ''}
        </div>
        <div class="arrow">→</div>
        <div class="stop">
          <div class="stop-label">Delivery</div>
          <div class="stop-city">${delivery}</div>
        </div>
      </div>
      <div class="metrics-row">
        <div class="metric">
          <div class="metric-value revenue">${formatCurrency(revenue)}</div>
          <div class="metric-label">Gross Revenue</div>
        </div>
        <div class="metric">
          <div class="metric-value">${formatCurrency(rpm)}/mi</div>
          <div class="metric-label">Rate/Mile</div>
        </div>
        <div class="metric">
          <div class="metric-value">${Math.round(pickupToDelivery)} mi</div>
          <div class="metric-label">Load Miles</div>
        </div>
        <div class="metric">
          <div class="metric-value oor">${Math.round(addlMiles)} mi</div>
          <div class="metric-label">OOR Miles</div>
        </div>
        ${netCredit !== null ? `
        <div class="metric">
          <div class="metric-value ${netCredit >= 0 ? 'revenue' : 'negative'}">${formatCurrency(netCredit)}</div>
          <div class="metric-label">Net Credit</div>
        </div>` : ''}
      </div>
      <div class="legs-row">
        <span>Datum → Pickup: ${Math.round(datumToPickup)} mi</span>
        <span>Delivery → Home: ${Math.round(deliveryToHome)} mi</span>
        ${equipType ? `<span>${equipType}</span>` : ''}
        ${weight ? `<span>${Number(weight).toLocaleString()} lbs</span>` : ''}
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Backhaul Report – ${request.request_name}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 32px; }
  h1 { font-size: 26px; font-weight: 900; margin-bottom: 4px; }
  .subtitle { font-size: 14px; color: #555; margin-bottom: 4px; }
  .meta-row { display: flex; gap: 24px; font-size: 13px; color: #444; margin-bottom: 24px; margin-top: 8px; flex-wrap: wrap; }
  .meta-row strong { color: #111; }
  #map { width: 100%; height: 400px; border-radius: 10px; border: 1px solid #ddd; margin-bottom: 28px; }
  .legend { display: flex; gap: 20px; font-size: 12px; color: #555; margin-top: 10px; margin-bottom: 28px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); flex-shrink: 0; }
  .section-title { font-size: 18px; font-weight: 800; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  .load-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; margin-bottom: 14px; break-inside: avoid; }
  .load-card.best { border-color: #10b981; border-width: 2px; }
  .load-card.top3 { border-color: #3b82f6; }
  .load-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .rank-badge { font-size: 13px; font-weight: 700; color: #555; }
  .load-card.best .rank-badge { color: #10b981; }
  .load-card.top3 .rank-badge { color: #3b82f6; }
  .load-number { width: 28px; height: 28px; border-radius: 50%; background: #008b00; color: white; font-weight: 900; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .route-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .stop { flex: 1; }
  .stop-label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #888; letter-spacing: 0.5px; margin-bottom: 2px; }
  .stop-city { font-size: 15px; font-weight: 700; color: #111; }
  .stop-date { font-size: 12px; color: #666; margin-top: 2px; }
  .arrow { font-size: 20px; color: #999; flex-shrink: 0; }
  .metrics-row { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 10px; }
  .metric { min-width: 80px; }
  .metric-value { font-size: 15px; font-weight: 800; color: #111; }
  .metric-value.revenue { color: #059669; }
  .metric-value.negative { color: #dc2626; }
  .metric-value.oor { color: #d97706; }
  .metric-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 1px; }
  .legs-row { font-size: 11px; color: #777; display: flex; gap: 16px; flex-wrap: wrap; border-top: 1px solid #f3f4f6; padding-top: 8px; }
  .disclaimer { font-size: 11px; color: #aaa; margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print {
    body { padding: 16px; }
    #map { height: 320px; }
    .no-print { display: none !important; }
    .load-card { break-inside: avoid; }
  }
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
  <div>
    <h1>${request.request_name}</h1>
    <div class="subtitle">Top 10 Backhaul Opportunities</div>
  </div>
  <button id="printBtn" class="no-print" style="padding:10px 20px;background:#10b981;border:none;border-radius:8px;color:white;font-size:14px;font-weight:700;cursor:pointer;">
    ⬇ Save as PDF
  </button>
</div>
<div class="meta-row">
  <div><strong>Fleet:</strong> ${fleet.name}</div>
  <div><strong>Datum Point:</strong> ${request.datum_point}</div>
  <div><strong>Fleet Home:</strong> ${fleetHome?.address || 'Home Base'}</div>
  <div><strong>Report Date:</strong> ${reportDate}</div>
  <div><strong>Matches Shown:</strong> ${top10.length} of ${matches.length}</div>
</div>

<div id="map"></div>
<div class="legend">
  <div class="legend-item"><div class="dot" style="background:#ef4444"></div> A = Datum Point</div>
  <div class="legend-item"><div class="dot" style="background:#10b981"></div> B = Fleet Home</div>
  <div class="legend-item"><div class="dot" style="background:#008b00"></div> 1–10 = Pickup Locations</div>
  <div class="legend-item"><div class="dot" style="background:#5ea0db"></div> 1–10 = Delivery Locations</div>
</div>

<div class="section-title">Top ${top10.length} Routes</div>
${loadRows}

<div class="disclaimer">
  Estimates only. Distances are approximate. Validate with your mileage engine before committing. Generated ${reportDate}.
</div>

<script>
(function() {
  var data = ${JSON.stringify(mapData)};

  // Use datum (or home, or US center) as initial view so map has a size before fitBounds
  var initLat = (data.datum && data.datum.lat != null) ? data.datum.lat
              : (data.home && data.home.lat != null) ? data.home.lat : 39;
  var initLng = (data.datum && data.datum.lng != null) ? data.datum.lng
              : (data.home && data.home.lng != null) ? data.home.lng : -86;

  var map = L.map('map', { center: [initLat, initLng], zoom: 6 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Corridor polygon
  if (data.corridor) {
    L.geoJSON({ type: 'Feature', geometry: data.corridor }, {
      style: { fillColor: '#008b00', fillOpacity: 0.12, color: '#008b00', weight: 2, opacity: 0.5, dashArray: '8 8' }
    }).addTo(map);
  }

  // Route line
  if (data.route) {
    L.geoJSON({ type: 'Feature', geometry: data.route }, {
      style: { color: '#6B7280', weight: 3, opacity: 0.7 }
    }).addTo(map);
  }

  function circleIcon(color, label, size) {
    size = size || 30;
    return L.divIcon({
      className: '',
      html: '<div style="background:' + color + ';color:white;width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:' + Math.round(size*0.45) + 'px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' + label + '</div>',
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor: [0, -size/2]
    });
  }

  var bounds = [];

  if (data.datum && data.datum.lat != null) {
    bounds.push([data.datum.lat, data.datum.lng]);
    L.marker([data.datum.lat, data.datum.lng], { icon: circleIcon('#ef4444', 'A', 34) })
      .addTo(map).bindPopup('<strong>Datum Point</strong><br>${request.datum_point}');
  }

  if (data.home && data.home.lat != null) {
    bounds.push([data.home.lat, data.home.lng]);
    L.marker([data.home.lat, data.home.lng], { icon: circleIcon('#10b981', 'B', 34) })
      .addTo(map).bindPopup('<strong>Fleet Home</strong><br>${fleetHome?.address || 'Home Base'}');
  }

  data.loads.forEach(function(load) {
    if (load.pickupLat != null) {
      bounds.push([load.pickupLat, load.pickupLng]);
      L.marker([load.pickupLat, load.pickupLng], { icon: circleIcon('#008b00', load.num, 28) })
        .addTo(map).bindPopup('<strong>#' + load.num + ' Pickup</strong><br>' + load.pickupCity);
    }
    if (load.deliveryLat != null) {
      bounds.push([load.deliveryLat, load.deliveryLng]);
      L.marker([load.deliveryLat, load.deliveryLng], { icon: circleIcon('#5ea0db', load.num, 24) })
        .addTo(map).bindPopup('<strong>#' + load.num + ' Delivery</strong><br>' + load.deliveryCity);
    }
  });

  // Fit bounds after container is sized
  function fitAll() {
    if (bounds.length > 0) {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 8, animate: false });
    }
  }
  setTimeout(fitAll, 150);

  // Save as PDF:
  // Lock the map div to its current pixel dimensions with inline styles before
  // calling window.print(). Inline styles beat @media print CSS, so the container
  // won't resize, Leaflet won't repaint, and the view stays exactly as on screen.
  document.getElementById('printBtn').addEventListener('click', function() {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Preparing...';
    fitAll();

    var mapEl = document.getElementById('map');

    // Wait for tiles to settle at the fitted view, then lock + print
    setTimeout(function() {
      var w = mapEl.offsetWidth;
      var h = mapEl.offsetHeight;
      mapEl.style.width  = w + 'px';
      mapEl.style.height = h + 'px';

      window.print();

      setTimeout(function() {
        mapEl.style.width  = '';
        mapEl.style.height = '';
        btn.disabled = false;
        btn.textContent = '\u2b07 Save as PDF';
      }, 500);
    }, 1500);
  });
})();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Clean up blob URL after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
