import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../lib/supabase';
import { parseDatCsv } from '../utils/datCsvParser';

const Step = ({ n, label, active, done }) => {
  const { colors } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: 800,
        background: done ? colors.accent.primary : active ? `${colors.accent.primary}20` : colors.background.secondary,
        border: `2px solid ${done || active ? colors.accent.primary : colors.border.secondary}`,
        color: done ? '#0d1117' : active ? colors.accent.primary : colors.text.muted,
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: '13px', fontWeight: active || done ? 700 : 500, color: active || done ? colors.text.primary : colors.text.muted }}>
        {label}
      </span>
    </div>
  );
};

const CopyButton = ({ value }) => {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} style={{
      padding: '3px 10px', fontSize: '11px', fontWeight: 700,
      background: copied ? `${colors.accent.primary}20` : colors.background.primary,
      border: `1px solid ${copied ? colors.accent.primary : colors.border.secondary}`,
      borderRadius: '5px', color: copied ? colors.accent.primary : colors.text.secondary,
      cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
    }}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

const ParamRow = ({ label, value, note }) => {
  const { colors } = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '11px 14px',
      background: colors.background.primary,
      border: `1px solid ${colors.border.secondary}`,
      borderRadius: '8px'
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>{value}</div>
        {note && <div style={{ fontSize: '11px', color: colors.text.muted, marginTop: '2px' }}>{note}</div>}
      </div>
      <CopyButton value={value} />
    </div>
  );
};

export const DatImportModal = ({ request, onClose, onImport }) => {
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [fleet, setFleet] = useState(null);
  const [parsedLoads, setParsedLoads] = useState(null);
  const [parseError, setParseError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const fileRef = useRef();

  const geocodeCities = async (loads) => {
    // Build deduplicated set of city/state pairs needing geocoding
    const unique = new Map();
    for (const load of loads) {
      if (load.pickup_city && load.pickup_state) {
        const key = `${load.pickup_city},${load.pickup_state}`;
        if (!unique.has(key)) unique.set(key, null);
      }
      if (load.delivery_city && load.delivery_state) {
        const key = `${load.delivery_city},${load.delivery_state}`;
        if (!unique.has(key)) unique.set(key, null);
      }
    }

    const keys = [...unique.keys()];

    // Try PC*Miler first (parallel)
    await Promise.all(keys.map(async (key) => {
      try {
        // PC*Miler expects "City, ST" format (e.g. "Davidson, NC")
        const [city, state] = key.split(',').map(s => s.trim());
        const address = `${city}, ${state}`;
        const res = await fetch(`/api/pcmiler/geocode?address=${encodeURIComponent(address)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.lat && data?.lng) {
            unique.set(key, { lat: data.lat, lng: data.lng });
          } else {
            console.warn('[DatImport] PC*Miler geocode: no coords in response for', key, data);
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.warn('[DatImport] PC*Miler geocode failed for', key, '- status', res.status, errText.slice(0, 200));
        }
      } catch (e) {
        console.warn('[DatImport] PC*Miler geocode error for', key, e.message);
      }
    }));

    // Fallback: use Nominatim (OSM) for any cities still missing coords
    const missing = keys.filter(k => !unique.get(k));
    if (missing.length > 0) {
      console.log('[DatImport] Falling back to Nominatim for', missing.length, 'cities:', missing);
      for (const key of missing) {
        try {
          const [city, state] = key.split(',').map(s => s.trim());
          const q = encodeURIComponent(`${city}, ${state}, United States`);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
            { headers: { 'User-Agent': 'HaulMonitor/1.0' } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data[0]?.lat && data[0]?.lon) {
              unique.set(key, { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
              console.log('[DatImport] Nominatim geocoded', key, '->', data[0].lat, data[0].lon);
            } else {
              console.warn('[DatImport] Nominatim: no result for', key);
            }
          }
        } catch (e) {
          console.warn('[DatImport] Nominatim error for', key, e.message);
        }
        // Nominatim rate limit: 1 req/sec
        await new Promise(r => setTimeout(r, 1100));
      }
    }

    const resolved = keys.filter(k => unique.get(k)).length;
    console.log(`[DatImport] Geocoded ${resolved}/${keys.length} unique cities`);

    // Attach coordinates to loads
    return loads.map(load => {
      const pickupKey = `${load.pickup_city},${load.pickup_state}`;
      const deliveryKey = `${load.delivery_city},${load.delivery_state}`;
      const pickupCoords = unique.get(pickupKey);
      const deliveryCoords = unique.get(deliveryKey);
      return {
        ...load,
        pickup_lat: pickupCoords?.lat ?? null,
        pickup_lng: pickupCoords?.lng ?? null,
        delivery_lat: deliveryCoords?.lat ?? null,
        delivery_lng: deliveryCoords?.lng ?? null,
      };
    });
  };

  useEffect(() => {
    db.fleets.getById(request.fleet_id).then(setFleet).catch(() => {});
  }, [request.fleet_id]);

  const equipmentType = fleet?.fleet_profiles?.[0]?.trailer_type || 'Dry Van';
  const datumCity = request.datum_point || '';
  const homeAddress = fleet?.home_address || 'Fleet home base';
  const pickupDate = request.equipment_available_date
    ? new Date(request.equipment_available_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Any';

  // Map equipment to DAT label
  const datEquipment = {
    'Dry Van': 'Van (V)',
    'Refrigerated': 'Reefer (R)',
    'Flatbed': 'Flatbed (F)',
    'Step Deck': 'Step Deck (SD)',
    'Lowboy': 'Lowboy (LB)',
  }[equipmentType] || equipmentType;

  const processFile = (file) => {
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const loads = parseDatCsv(e.target.result);
        setGeocoding(true);
        const geocodedLoads = await geocodeCities(loads);
        setParsedLoads(geocodedLoads);
        setStep(3);
      } catch (err) {
        setParseError(err.message);
      } finally {
        setGeocoding(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) processFile(file);
    else setParseError('Please upload a .csv file');
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div style={{
        background: colors.background.primary,
        border: `1px solid ${colors.border.secondary}`,
        borderRadius: '16px',
        width: '100%', maxWidth: '560px',
        maxHeight: '90vh', overflowY: 'auto',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${colors.border.secondary}`,
          position: 'sticky', top: 0,
          background: colors.background.primary,
          zIndex: 1
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                Import Loads from DAT
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary }}>
                {request.request_name}
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '2px 6px' }}>×</button>
          </div>

          {/* Step indicators */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
            <Step n={1} label="Search DAT" active={step === 1} done={step > 1} />
            <div style={{ width: '20px', height: '1px', background: colors.border.secondary, alignSelf: 'center' }} />
            <Step n={2} label="Upload CSV" active={step === 2} done={step > 2} />
            <div style={{ width: '20px', height: '1px', background: colors.border.secondary, alignSelf: 'center' }} />
            <Step n={3} label="Preview & Match" active={step === 3} done={false} />
          </div>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>

          {/* ── STEP 1: Search Guide ── */}
          {step === 1 && (
            <>
              <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: colors.text.secondary, lineHeight: 1.6 }}>
                Use these parameters in DAT One to search for loads that match this backhaul request. Then export the results as a CSV.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <ParamRow
                  label="Origin (pickup area)"
                  value={datumCity}
                  note="Search 150–200 mi radius for best coverage"
                />
                <ParamRow
                  label="Destination"
                  value={homeAddress}
                  note="Or search 'Any' and filter after matching"
                />
                <ParamRow label="Equipment" value={datEquipment} />
                <ParamRow label="Pick Up Date" value={pickupDate} />
              </div>

              <div style={{
                padding: '12px 14px',
                background: `${colors.accent.primary}08`,
                border: `1px solid ${colors.accent.primary}25`,
                borderRadius: '8px',
                fontSize: '13px', color: colors.text.secondary,
                lineHeight: 1.55, marginBottom: '20px'
              }}>
                <strong style={{ color: colors.text.primary }}>Tip:</strong> In DAT One, run your search, then click the <strong>Export</strong> button (top right of results) → <strong>Export to CSV</strong>. Export up to 100–200 rows for best results.
              </div>

              <button
                onClick={() => setStep(2)}
                style={{
                  width: '100%', padding: '12px',
                  background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.hover || colors.accent.primary} 100%)`,
                  border: 'none', borderRadius: '8px',
                  color: '#0d1117', fontSize: '14px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                I've Exported My CSV →
              </button>
            </>
          )}

          {/* ── STEP 2: Upload ── */}
          {step === 2 && (
            <>
              <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: colors.text.secondary }}>
                Upload the CSV file you exported from DAT One.
              </p>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? colors.accent.primary : colors.border.secondary}`,
                  borderRadius: '12px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? `${colors.accent.primary}08` : colors.background.secondary,
                  transition: 'all 0.15s',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary, marginBottom: '6px' }}>
                  Drop your CSV here or click to browse
                </div>
                <div style={{ fontSize: '13px', color: colors.text.muted }}>
                  .csv files only — exported from DAT One
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => processFile(e.target.files[0])}
                />
              </div>

              {geocoding && (
                <div style={{
                  padding: '12px 14px', borderRadius: '8px', marginBottom: '16px',
                  background: `${colors.accent.primary}08`, border: `1px solid ${colors.accent.primary}25`,
                  fontSize: '13px', color: colors.accent.primary, display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <div style={{ width: '14px', height: '14px', border: `2px solid ${colors.accent.primary}40`, borderTop: `2px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  Geocoding cities (this may take a few seconds)...
                </div>
              )}

              {parseError && !geocoding && (
                <div style={{
                  padding: '12px 14px', borderRadius: '8px', marginBottom: '16px',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  fontSize: '13px', color: '#ef4444'
                }}>
                  {parseError}
                </div>
              )}

              <button
                onClick={() => setStep(1)}
                style={{
                  background: 'none', border: 'none', color: colors.text.secondary,
                  fontSize: '13px', cursor: 'pointer', padding: 0
                }}
              >
                ← Back to search guide
              </button>
            </>
          )}

          {/* ── STEP 3: Preview ── */}
          {step === 3 && parsedLoads && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '8px', marginBottom: '16px',
                background: `${colors.accent.primary}10`,
                border: `1px solid ${colors.accent.primary}30`
              }}>
                <span style={{ fontSize: '20px' }}>✓</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                    {parsedLoads.length} load{parsedLoads.length !== 1 ? 's' : ''} parsed successfully
                  </div>
                  <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                    Ready to match against your route home
                  </div>
                </div>
              </div>

              {/* Preview table */}
              <div style={{
                border: `1px solid ${colors.border.secondary}`,
                borderRadius: '8px', overflow: 'hidden',
                marginBottom: '16px'
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 80px 70px',
                  padding: '8px 12px',
                  background: colors.background.secondary,
                  borderBottom: `1px solid ${colors.border.secondary}`,
                  fontSize: '11px', fontWeight: 700, color: colors.text.muted, textTransform: 'uppercase'
                }}>
                  <span>Origin</span><span>Destination</span><span>Miles</span><span>Rate</span>
                </div>
                {parsedLoads.slice(0, 6).map((load, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 80px 70px',
                    padding: '9px 12px',
                    borderBottom: i < Math.min(parsedLoads.length, 6) - 1 ? `1px solid ${colors.border.secondary}` : 'none',
                    fontSize: '13px', color: colors.text.primary
                  }}>
                    <span>{load.pickup_city}{load.pickup_state ? `, ${load.pickup_state}` : ''}</span>
                    <span>{load.delivery_city}{load.delivery_state ? `, ${load.delivery_state}` : ''}</span>
                    <span style={{ color: colors.text.secondary }}>{load.distance_miles ? `${load.distance_miles}mi` : '—'}</span>
                    <span style={{ color: colors.accent.primary }}>{load.pay_rate ? `$${load.pay_rate.toLocaleString()}` : '—'}</span>
                  </div>
                ))}
                {parsedLoads.length > 6 && (
                  <div style={{ padding: '8px 12px', fontSize: '12px', color: colors.text.muted, background: colors.background.secondary }}>
                    +{parsedLoads.length - 6} more loads
                  </div>
                )}
              </div>

              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '20px',
                background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)',
                fontSize: '12px', color: colors.text.secondary, lineHeight: 1.55
              }}>
                <strong>Note:</strong> These are point-in-time results from your DAT export. Loads may have been booked since you exported. Always verify availability before committing.
              </div>

              <button
                onClick={() => onImport(parsedLoads)}
                style={{
                  width: '100%', padding: '13px',
                  background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.hover || colors.accent.primary} 100%)`,
                  border: 'none', borderRadius: '8px',
                  color: '#0d1117', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                  marginBottom: '10px'
                }}
              >
                Run Matching with These {parsedLoads.length} Loads →
              </button>
              <button
                onClick={() => { setParsedLoads(null); setParseError(''); setStep(2); }}
                style={{ background: 'none', border: 'none', color: colors.text.secondary, fontSize: '13px', cursor: 'pointer', padding: 0 }}
              >
                ← Upload a different file
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
