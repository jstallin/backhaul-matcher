import { useState, useRef } from 'react';
import { MapPin, Navigation, TrendingUp, Truck, Package, Edit, X, Map } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { RouteMap } from './RouteMap';
import { CoDriver } from './CoDriver';
import { generateTop10Report } from '../utils/generateReport';

// Equipment type → DirectFreight path segment
const DF_EQUIP_PATH = {
  'Dry Van':    'van',
  'Van':        'van',
  'Flatbed':    'flatbed',
  'Refrigerated': 'reefer',
  'Reefer':     'reefer',
  'Step Deck':  'stepdeck',
  'Power Only': 'poweronly',
  'Hot Shot':   'hotshot',
};

const LOAD_BOARD_CONFIG = {
  directfreight: {
    name: 'Direct Freight',
    // DF uses a Vue SPA — no per-load deep link. Build the most targeted search URL
    // possible using confirmed URL path params (equipment, origin state) and query
    // params from the DF API (origin_state, destination_state, radii, ship_date).
    url: (id, match) => {
      const equip   = DF_EQUIP_PATH[match?.equipmentType] || 'all';
      const oState  = match?.pickup_state   || '';
      const dState  = match?.delivery_state || '';
      const oCity   = match?.pickup_city    || '';
      const dCity   = match?.delivery_city  || '';
      const date    = match?.pickupDate
        ? String(match.pickupDate).split('T')[0]
        : '';

      // Path: /find/loads/{equipment}/{origin_state}
      let url = `https://www.directfreight.com/home/boards/find/loads/${equip}`;
      if (oState) url += `/${oState}`;

      const params = new URLSearchParams();
      if (oState)  params.set('origin_state',        oState);
      if (dState)  params.set('destination_state',   dState);
      if (oCity)   params.set('origin_city',          oCity);
      if (dCity)   params.set('destination_city',     dCity);
      if (date)    params.set('ship_date',             date);
      params.set('origin_radius',      '100');
      params.set('destination_radius', '100');
      params.set('sort_parameter',     'age');

      return `${url}?${params.toString()}`;
    },
  },
  truckerpath: {
    name: 'TruckerPath',
    // TP numeric IDs are stored as "TP:251862330" — strip the prefix for the URL.
    url: (id) => {
      const numeric = id ? String(id).replace(/^TP:/i, '') : null;
      return numeric
        ? `https://loadboard.truckerpath.com/loads/${numeric}`
        : 'https://loadboard.truckerpath.com/';
    },
  },
  dat: {
    name: 'DAT',
    url: (id) => id ? `https://www.dat.com/load/${id}` : 'https://www.dat.com/',
  },
  truckstop: {
    name: 'Truckstop',
    url: (id) => id ? `https://main.truckstop.com/PostingDetails/Loads/${id}` : 'https://main.truckstop.com/',
  },
};

export const BackhaulResults = ({ request, fleet, matches, datumCoordinates, fleetHome, routeData, onBack, onEdit, onCancel, onComplete }) => {
  const { colors } = useTheme();
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [mapMatch, setMapMatch] = useState(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [haulMatch, setHaulMatch] = useState(null); // load selected for "haul this" confirmation
  const [completing, setCompleting] = useState(false);
  // const [aiAnalysis, setAiAnalysis] = useState({});
  // const [aiLoading, setAiLoading] = useState({});
  // const [aiFeedback, setAiFeedback] = useState({});
  const [pendingLoads, setPendingLoads] = useState(new Set());
  const [toastLoad, setToastLoad] = useState(null);
  const toastTimerRef = useRef(null);

  // const handleAiAnalyze = async (match) => { ... };
  // const handleAiFeedback = async (match, rating) => { ... };
  // const submitAiFeedback = async (match, rating, comment) => { ... };

  const handleCancelRequest = async () => {
    if (!cancelReason.trim()) {
      alert('Please select a cancellation reason');
      return;
    }

    setCancelling(true);
    try {
      await onCancel(cancelReason);
      setShowCancelDialog(false);
    } catch (error) {
      console.error('Error cancelling request:', error);
      alert('Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const handleHaulConfirm = async () => {
    if (!haulMatch || !onComplete) return;
    setCompleting(true);
    try {
      await onComplete(haulMatch);
      const id = haulMatch.load_id || haulMatch.id;
      setPendingLoads(prev => { const next = new Set(prev); next.delete(id); return next; });
      setHaulMatch(null);
      setSelectedMatch(null);
    } catch (error) {
      console.error('Error completing haul:', error);
      alert('Failed to record haul');
    } finally {
      setCompleting(false);
    }
  };

  const handleTruckstopLinkClick = (match, href) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    const id = match.load_id || match.id;
    setPendingLoads(prev => { const next = new Set(prev); next.add(id); return next; });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastLoad(match);
    toastTimerRef.current = setTimeout(() => setToastLoad(null), 5000);
  };

  const dismissPending = (id) => {
    setPendingLoads(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const fmtAge = (hours) => {
    if (!hours) return null;
    return hours < 24 ? `${hours}h old` : `${Math.floor(hours / 24)}d old`;
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getRankColor = (index) => {
    if (index === 0) return colors.accent.success;
    if (index === 1) return colors.accent.primary;
    if (index === 2) return colors.accent.primary;
    return colors.text.tertiary;
  };

  const getRankLabel = (index) => {
    if (index === 0) return '🥇 Best';
    if (index === 1) return '🥈 2nd';
    if (index === 2) return '🥉 3rd';
    return `#${index + 1}`;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div className="br-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ padding: '8px 16px', minHeight: '44px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            ← Back to Backhaul Requests
          </button>
          <div className="br-header-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {matches.length > 0 && (
              <button
                onClick={() => generateTop10Report({ request, fleet, matches, datumCoordinates, fleetHome, routeData })}
                style={{ padding: '10px 20px', minHeight: '44px', background: colors.background.secondary, border: `2px solid ${colors.accent.success}`, borderRadius: '8px', color: colors.accent.success, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ⬇ Download Report
              </button>
            )}
            <button onClick={onEdit} style={{ padding: '10px 20px', minHeight: '44px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Edit size={16} />
              Edit Backhaul Request
            </button>
            <button onClick={() => setShowCancelDialog(true)} style={{ padding: '10px 20px', minHeight: '44px', background: colors.background.secondary, border: `2px solid ${colors.accent.danger}`, borderRadius: '8px', color: colors.accent.danger, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <X size={16} />
              Cancel Backhaul Request
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: colors.text.tertiary, fontStyle: 'italic' }}>
          Estimates Only. Validate with your specific mileage engines.
        </p>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 900, color: colors.text.primary }}>
          {request.request_name}
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px', color: colors.text.secondary }}>
          <div><strong>Fleet:</strong> {fleet.name}</div>
          <div><strong>Datum Point:</strong> {request.datum_point}</div>
          <div><strong>Matches Found:</strong> {matches.length}</div>
        </div>
      </div>

      {matches.length === 0 ? (
        /* No Matches */
        <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
          <Package size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
          <h4 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
            No Matches Found
          </h4>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            No backhaul opportunities match your criteria at this time.
          </p>
        </div>
      ) : (
        /* Matches List */
        <div>
          {/* Pending loads banner */}
          {pendingLoads.size > 0 && (() => {
            const pending = matches.filter(m => pendingLoads.has(m.load_id || m.id));
            if (!pending.length) return null;
            return (
              <div style={{ marginBottom: '16px', padding: '14px 16px', background: `${colors.accent.success}12`, border: `1px solid ${colors.accent.success}50`, borderRadius: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: colors.text.primary, marginBottom: '10px' }}>Did you book one of these?</div>
                {pending.map(m => {
                  const id = m.load_id || m.id;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: '160px', fontSize: '13px', color: colors.text.secondary }}>
                        {m.origin.address} → {m.destination.address}
                      </span>
                      <button onClick={() => { setHaulMatch(m); dismissPending(id); }} style={{ padding: '4px 12px', background: colors.accent.success, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Mark as Hauled
                      </button>
                      <button onClick={() => dismissPending(id)} style={{ padding: '4px 8px', background: 'none', border: `1px solid ${colors.border.accent}`, borderRadius: '6px', color: colors.text.tertiary, fontSize: '12px', cursor: 'pointer' }}>✕</button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {matches.map((match, index) => (
            <div key={match.id} style={{ marginBottom: '16px', background: colors.background.card, border: `2px solid ${index < 3 ? getRankColor(index) + '40' : colors.border.primary}`, borderRadius: '16px', padding: '24px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${getRankColor(index)}30`; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
              
              {/* Rank Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ padding: '6px 16px', background: `${getRankColor(index)}20`, borderRadius: '20px', fontSize: '14px', fontWeight: 800, color: getRankColor(index) }}>
                    {getRankLabel(index)}
                  </div>
                  {match.source === 'truckstop' && (() => {
                    const href = LOAD_BOARD_CONFIG.truckstop.url(match.load_id || match.id);
                    return href ? (
                      <button onClick={e => { e.stopPropagation(); handleTruckstopLinkClick(match, href); }} title="View load on Truckstop" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                        <img src="/Waypoint%20Default.png" alt="View on Truckstop" style={{ height: '20px', display: 'block' }} />
                      </button>
                    ) : (
                      <img src="/Waypoint%20Default.png" alt="Truckstop load" style={{ height: '20px', display: 'block' }} />
                    );
                  })()}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {match.has_rate_config ? (
                    <>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: match.customer_net_credit >= 0 ? colors.accent.success : colors.accent.danger }}>
                        {formatCurrency(match.customer_net_credit)}
                      </div>
                      <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '2px' }}>
                        Customer Net Credit
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                        Gross: {formatCurrency(match.totalRevenue)} | {formatCurrency(match.revenuePerMile)}/mi
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: colors.accent.success }}>
                        {formatCurrency(match.totalRevenue)}
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                        {formatCurrency(match.revenuePerMile)}/mile
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Route Info */}
              <div className="br-route-info" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <MapPin size={16} color={colors.accent.primary} />
                    <span style={{ fontSize: '12px', color: colors.text.tertiary, textTransform: 'uppercase', fontWeight: 600 }}>Pickup</span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: colors.text.primary }}>
                    {match.origin.address}
                  </div>
                  <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                    {formatDate(match.pickupDate)}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <Navigation size={24} color={colors.accent.primary} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                    {match.distance} mi
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <MapPin size={16} color={colors.accent.success} />
                    <span style={{ fontSize: '12px', color: colors.text.tertiary, textTransform: 'uppercase', fontWeight: 600 }}>Delivery</span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: colors.text.primary }}>
                    {match.destination.address}
                  </div>
                  <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                    {formatDate(match.deliveryDate)}
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', paddingTop: '16px', borderTop: `1px solid ${colors.border.secondary}` }}>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Equipment</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: match.trailer_type_match === false ? colors.text.secondary : colors.text.primary }}>
                      {match.equipmentType}
                    </span>
                    {match.trailer_type_match === false && (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#f59e0b', background: '#f59e0b18', border: '1px solid #f59e0b40', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' }}>
                        type mismatch
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Weight</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>{formatNumber(match.weight)} lbs</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Length</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>{match.trailerLength} ft</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>OOR Miles</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.accent.primary }}>{match.additionalMiles} mi</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>To Pickup</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>{match.finalToPickup} mi</div>
                </div>
                {match.days_to_pay != null && (
                  <div>
                    <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Pay Terms</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>Net {match.days_to_pay}</div>
                  </div>
                )}
                {fmtAge(match.age_hours) && (
                  <div>
                    <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Posted</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: match.age_hours > 48 ? colors.accent.danger : colors.text.secondary }}>{fmtAge(match.age_hours)}</div>
                  </div>
                )}
                {match.fuel_cost != null && (
                  <div>
                    <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Est. Fuel</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>${match.fuel_cost.toFixed(0)}</div>
                  </div>
                )}
                {match.experience_factor && (
                  <div>
                    <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Broker</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: match.experience_factor === 'A' ? colors.accent.success : colors.text.primary }}>{match.experience_factor}</div>
                  </div>
                )}
              </div>

              {/* Financial Breakdown (when rate config available) */}
              {match.has_rate_config && (
                <div style={{ marginTop: '12px', padding: '16px', background: `${colors.background.secondary}`, border: `1px solid ${colors.border.accent}`, borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: colors.accent.primary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Financial Breakdown
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Customer Share</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>{formatCurrency(match.customer_share)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Mileage Exp</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(match.mileage_expense)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Stop Exp ({match.stop_count})</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(match.stop_expense)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Fuel Surcharge</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(match.fuel_surcharge)}</div>
                    </div>
                    {match.other_charges > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Other Charges</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(match.other_charges)}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Carrier Revenue</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.primary }}>{formatCurrency(match.carrier_revenue)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${colors.border.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: colors.text.tertiary }}>
                      FSC: ({match.fsc_per_mile?.toFixed(3)}/mi × {match.additionalMiles} OOR mi) = {formatCurrency(match.fuel_surcharge)}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: match.customer_net_credit >= 0 ? colors.accent.success : colors.accent.danger }}>
                      Net: {formatCurrency(match.customer_net_credit)}
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div style={{ marginTop: '12px', padding: '12px', background: colors.background.secondary, borderRadius: '8px', fontSize: '12px', color: colors.text.secondary }}>
                <div className="br-addl-info" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div><strong>Broker:</strong> {match.broker}</div>
                  <div><strong>Shipper:</strong> {match.shipper}</div>
                  <div><strong>Freight:</strong> {match.freightType}</div>
                  {match.credit && <div><strong>Credit:</strong> {match.credit}</div>}
                  {match.experience_factor && <div><strong>Rating:</strong> {match.experience_factor}</div>}
                </div>
                {match.contactPhone && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${colors.border.secondary}`, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: colors.text.tertiary, fontWeight: 600 }}>Contact Broker:</span>
                    <a href={`tel:${match.contactPhone}`} onClick={e => e.stopPropagation()} style={{ color: colors.accent.primary, fontWeight: 700, textDecoration: 'none', padding: '3px 10px', border: `1px solid ${colors.accent.primary}`, borderRadius: '6px', fontSize: '12px' }}>Call</a>
                    <a href={`sms:${match.contactPhone}`} onClick={e => e.stopPropagation()} style={{ color: colors.accent.primary, fontWeight: 700, textDecoration: 'none', padding: '3px 10px', border: `1px solid ${colors.accent.primary}`, borderRadius: '6px', fontSize: '12px' }}>Text</a>
                    <span style={{ color: colors.text.secondary }}>{match.contactPhone}</span>
                    {match.companyEmail && <a href={`mailto:${match.companyEmail}`} onClick={e => e.stopPropagation()} style={{ color: colors.accent.primary, fontWeight: 700, textDecoration: 'none', padding: '3px 10px', border: `1px solid ${colors.accent.primary}`, borderRadius: '6px', fontSize: '12px' }}>Email</a>}
                  </div>
                )}
                {match.special_info && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${colors.border.secondary}`, fontStyle: 'italic', color: colors.text.primary }}>
                    <strong style={{ fontStyle: 'normal', color: colors.text.tertiary }}>Special Instructions: </strong>{match.special_info}
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              {(() => {
                const gross = Number(match.total_revenue ?? match.totalRevenue ?? 0);
                const carrier = Number(match.carrier_revenue ?? 0);
                const netCredit = match.has_rate_config ? Number(match.customer_net_credit ?? 0) : null;
                const rpm = Number(match.revenue_per_mile ?? match.revenuePerMile ?? 0);
                const fmt = (n) => Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

                let summary;
                if (match.has_rate_config && netCredit !== null) {
                  const outcome = netCredit >= 0
                    ? `Your customer nets ${fmt(netCredit)} after route charges — this load works for both parties.`
                    : `Your customer is ${fmt(netCredit)} short after route charges — consider negotiating a higher rate.`;
                  summary = `This load grosses ${fmt(gross)}. Your carrier earns ${fmt(carrier)} off the top. ${outcome}`;
                } else if (gross > 0) {
                  summary = `This load grosses ${fmt(gross)}${rpm > 0 ? ` at $${rpm.toFixed(2)}/mi` : ''}. Add rate configuration in Fleet Setup to see the full financial picture.`;
                } else {
                  return null;
                }

                return (
                  <div style={{ marginTop: '12px', padding: '16px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: colors.accent.primary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Financial Summary
                    </div>
                    <div style={{ fontSize: '13px', color: colors.text.primary, lineHeight: 1.6 }}>
                      {summary}
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setSelectedMatch(match)} style={{ flex: 1, padding: '12px 20px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.secondary; }} onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primary; }}>
                    <Package size={16} />
                    View Details
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setMapMatch(match); }} style={{ flex: 1, padding: '12px 20px', background: colors.background.secondary, border: `2px solid ${colors.accent.primary}`, borderRadius: '8px', color: colors.accent.primary, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.accent.primary}10`; }} onMouseLeave={(e) => { e.currentTarget.style.background = colors.background.secondary; }}>
                    <Map size={16} />
                    View on Map
                  </button>
                </div>
                <button
                  onClick={() => setHaulMatch(match)}
                  style={{ width: '100%', padding: '11px 20px', background: colors.accent.success, border: 'none', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <TrendingUp size={16} />
                  Haul This Load
                  {pendingLoads.has(match.load_id || match.id) && (
                    <span style={{ marginLeft: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>viewed on TS</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CoDriver
        context="results"
        contextData={{ matches, fleet, request }}
      />

      {/* Route Details Modal */}
      {selectedMatch && (() => {
        const m = selectedMatch;
        const directMiles = m.direct_return_miles ?? m.additionalMiles ?? 0;
        const datumToPickup = m.datum_to_pickup_miles ?? m.finalToPickup ?? 0;
        const pickupToDelivery = m.pickup_to_delivery_miles ?? m.distance ?? 0;
        const deliveryToHome = m.delivery_to_home_miles ?? 0;
        const totalWithBackhaul = m.total_miles ?? m.oorMiles ?? 0;
        const extraMiles = m.additional_miles ?? m.additionalMiles ?? 0;
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setSelectedMatch(null)}>
            <div style={{ background: colors.background.overlay, borderRadius: '16px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflow: 'auto', border: `1px solid ${colors.border.accent}`, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }} onClick={(e) => e.stopPropagation()}>

              {/* Modal Header */}
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${colors.border.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                    {m.origin.address} → {m.destination.address}
                  </h3>
                  <div style={{ fontSize: '13px', color: colors.text.tertiary }}>
                    {m.equipmentType} · {formatNumber(m.weight)} lbs · {m.trailerLength} ft · {m.freightType}
                  </div>
                </div>
                <button onClick={() => setSelectedMatch(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: colors.text.secondary, fontSize: '20px', lineHeight: 1 }}>
                  ✕
                </button>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Route Comparison */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: colors.accent.primary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                    Route Comparison
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Empty Return */}
                    <div style={{ padding: '16px', background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: colors.text.secondary, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Truck size={14} color={colors.text.secondary} />
                        EMPTY RETURN
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: colors.text.secondary }}>{request.datum_point}</span>
                          <span style={{ color: colors.text.tertiary }}>→</span>
                          <span style={{ color: colors.text.secondary }}>Home</span>
                        </div>
                        <div style={{ borderTop: `1px solid ${colors.border.secondary}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, color: colors.text.primary }}>{formatNumber(directMiles)} mi</span>
                          <span style={{ fontWeight: 700, color: colors.accent.danger }}>$0</span>
                        </div>
                      </div>
                    </div>

                    {/* With Backhaul */}
                    <div style={{ padding: '16px', background: colors.background.card, border: `2px solid ${colors.accent.success}`, borderRadius: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: colors.accent.success, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TrendingUp size={14} color={colors.accent.success} />
                        WITH BACKHAUL
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: colors.text.secondary }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Datum → Pickup</span>
                          <span style={{ fontWeight: 600 }}>{formatNumber(datumToPickup)} mi</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Load ({m.origin.address} → {m.destination.address})</span>
                          <span style={{ fontWeight: 600 }}>{formatNumber(pickupToDelivery)} mi</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Delivery → Home</span>
                          <span style={{ fontWeight: 600 }}>{formatNumber(deliveryToHome)} mi</span>
                        </div>
                        <div style={{ borderTop: `1px solid ${colors.border.secondary}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: colors.text.primary }}>{formatNumber(totalWithBackhaul)} mi</span>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: colors.accent.success }}>+{formatCurrency(m.totalRevenue)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Net Impact Bar */}
                  <div style={{ marginTop: '10px', padding: '12px 16px', background: `${colors.accent.success}15`, border: `1px solid ${colors.accent.success}40`, borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: colors.accent.success }}>+{formatCurrency(m.totalRevenue)}</div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Extra Revenue</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: extraMiles > 0 ? colors.accent.warning : colors.accent.success }}>
                        {extraMiles > 0 ? '+' : ''}{formatNumber(extraMiles)} mi
                      </div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Extra Miles</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: colors.accent.success }}>+{formatCurrency(m.revenuePerMile)}/mi</div>
                      <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Revenue Per Mile</div>
                    </div>
                  </div>
                </div>

                {/* Financial Breakdown */}
                {m.has_rate_config && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: colors.accent.primary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                      Financial Breakdown
                    </div>
                    <div style={{ padding: '16px', background: colors.background.card, border: `1px solid ${colors.border.accent}`, borderRadius: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Gross Revenue</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>{formatCurrency(m.totalRevenue)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Customer Share</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>{formatCurrency(m.customer_share)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Carrier Revenue</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.accent.primary }}>{formatCurrency(m.carrier_revenue)}</div>
                        </div>
                      </div>
                      <div style={{ borderTop: `1px solid ${colors.border.secondary}`, paddingTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Mileage Exp</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(m.mileage_expense)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Stop Exp ({m.stop_count})</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(m.stop_expense)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Fuel Surcharge</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(m.fuel_surcharge)}</div>
                          <div style={{ fontSize: '10px', color: colors.text.tertiary }}>{m.fsc_per_mile?.toFixed(3)}/mi × {extraMiles} mi</div>
                        </div>
                        {m.other_charges > 0 && (
                          <div>
                            <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Other Charges</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>-{formatCurrency(m.other_charges)}</div>
                          </div>
                        )}
                      </div>
                      <div style={{ borderTop: `2px solid ${colors.border.primary}`, paddingTop: '12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '14px', color: colors.text.secondary }}>Customer Net Credit:</span>
                        <span style={{ fontSize: '22px', fontWeight: 900, color: m.customer_net_credit >= 0 ? colors.accent.success : colors.accent.danger }}>
                          {formatCurrency(m.customer_net_credit)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Load Details */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: colors.accent.primary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                    Load Details
                  </div>
                  <div style={{ padding: '16px', background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '13px' }}>
                      {m.source && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Load Source</div>
                          <div style={{ fontWeight: 600, color: colors.text.primary }}>
                            {m.source === 'truckstop'
                              ? <img src="/Waypoint%20Default.png" alt="Truckstop Waypoint" title="Truckstop load" style={{ height: '16px', display: 'block' }} />
                              : ({ directfreight: 'DirectFreight', truckerpath: 'TruckerPath', dat: 'DAT' }[m.source] || m.source)}
                          </div>
                        </div>
                      )}
                      {(m.df_load_number || (m.source !== 'directfreight' && (m.source_load_id || m.load_id))) && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>
                            Load Number
                          </div>
                          {m.source === 'truckstop' && (m.source_load_id || m.load_id) ? (
                            <a
                              href={LOAD_BOARD_CONFIG.truckstop.url(m.source_load_id || m.load_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontWeight: 600, color: colors.accent.primary, fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', textDecoration: 'none' }}
                            >
                              {m.source_load_id || m.load_id} ↗
                            </a>
                          ) : (
                            <div style={{ fontWeight: 600, color: colors.text.primary, fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                              {m.df_load_number || m.source_load_id || m.load_id}
                            </div>
                          )}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Pickup Date</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{formatDate(m.pickupDate)}{m.pickup_time ? <span style={{ fontWeight: 400, color: colors.text.secondary }}> · {m.pickup_time}</span> : null}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Delivery Date</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{formatDate(m.deliveryDate)}{m.delivery_time ? <span style={{ fontWeight: 400, color: colors.text.secondary }}> · {m.delivery_time}</span> : null}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Broker</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{m.broker}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Shipper</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{m.shipper}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Freight Type</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{m.freightType}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Distance Source</div>
                        <div style={{ fontWeight: 600, color: m.distance_source === 'pcmiler' ? colors.accent.success : colors.text.secondary }}>
                          {m.distance_source === 'pcmiler' ? 'PC*Miler' : 'Estimated'}
                        </div>
                      </div>
                      {m.posted_rate_per_mile > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Posted $/mi</div>
                          <div style={{ fontWeight: 600, color: colors.text.primary }}>${m.posted_rate_per_mile.toFixed(2)}</div>
                        </div>
                      )}
                      {m.days_to_pay != null && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Pay Terms</div>
                          <div style={{ fontWeight: 600, color: colors.text.primary }}>Net {m.days_to_pay}</div>
                        </div>
                      )}
                      {fmtAge(m.age_hours) && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Posted</div>
                          <div style={{ fontWeight: 600, color: m.age_hours > 48 ? colors.accent.danger : colors.text.secondary }}>{fmtAge(m.age_hours)}</div>
                        </div>
                      )}
                      {m.fuel_cost != null && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Est. Fuel Cost</div>
                          <div style={{ fontWeight: 600, color: colors.text.primary }}>${m.fuel_cost.toFixed(2)}</div>
                        </div>
                      )}
                      {m.experience_factor && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Broker Rating</div>
                          <div style={{ fontWeight: 700, color: m.experience_factor === 'A' ? colors.accent.success : colors.text.primary }}>{m.experience_factor}</div>
                        </div>
                      )}
                      {m.credit && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Broker Credit</div>
                          <div style={{ fontWeight: 700, color: colors.text.primary }}>{m.credit}</div>
                        </div>
                      )}
                      {m.equipment_options && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Equip. Options</div>
                          <div style={{ fontWeight: 600, color: colors.accent.primary }}>{m.equipment_options}</div>
                        </div>
                      )}
                      {m.contactPhone && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Contact Broker</div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <a href={`tel:${m.contactPhone}`} style={{ color: colors.accent.primary, fontWeight: 700, fontSize: '12px', textDecoration: 'none', padding: '2px 10px', border: `1px solid ${colors.accent.primary}`, borderRadius: '6px', whiteSpace: 'nowrap' }}>Call</a>
                            <a href={`sms:${m.contactPhone}`} style={{ color: colors.accent.primary, fontWeight: 700, fontSize: '12px', textDecoration: 'none', padding: '2px 10px', border: `1px solid ${colors.accent.primary}`, borderRadius: '6px', whiteSpace: 'nowrap' }}>Text</a>
                            <span style={{ fontWeight: 600, color: colors.text.secondary, fontSize: '12px' }}>{m.contactPhone}</span>
                          </div>
                        </div>
                      )}
                      {m.companyEmail && (
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Broker Email</div>
                          <a href={`mailto:${m.companyEmail}`} onClick={e => e.stopPropagation()} style={{ fontWeight: 600, color: colors.accent.primary, fontSize: '12px', textDecoration: 'none', wordBreak: 'break-all' }}>{m.companyEmail}</a>
                        </div>
                      )}
                    </div>
                    {m.special_info && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${colors.border.secondary}` }}>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>Special Instructions</div>
                        <div style={{ fontSize: '12px', color: colors.text.primary, fontStyle: 'italic' }}>{m.special_info}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Haul This Load CTA */}
                <div style={{ paddingTop: '4px', display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => { setHaulMatch(m); setSelectedMatch(null); }}
                    style={{ flex: 1, padding: '14px 24px', background: colors.accent.success, border: 'none', borderRadius: '10px', color: '#ffffff', fontSize: '15px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <TrendingUp size={18} />
                    Haul This Load
                  </button>
                  <button
                    onClick={() => { setSelectedMatch(null); setMapMatch(m); }}
                    style={{ padding: '14px 20px', background: colors.background.secondary, border: `2px solid ${colors.accent.primary}`, borderRadius: '10px', color: colors.accent.primary, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Map size={16} />
                    View on Map
                  </button>
                  <button
                    onClick={() => setSelectedMatch(null)}
                    style={{ padding: '14px 20px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '10px', color: colors.text.secondary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Close
                  </button>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* Haul This Load Confirmation Dialog */}
      {haulMatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => !completing && setHaulMatch(null)}>
          <div style={{ background: colors.background.overlay, borderRadius: '16px', padding: '32px', maxWidth: '480px', width: '100%', border: `1px solid ${colors.border.primary}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>Haul This Load</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: colors.text.secondary }}>
              Book the load on Truckstop, then confirm here to log it to your dashboard.
            </p>
            <div style={{ background: colors.background.secondary, borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', color: colors.text.primary }}>{haulMatch.origin.address} → {haulMatch.destination.address}</div>
              <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '12px' }}>{haulMatch.additionalMiles} out-of-route miles</div>
              <div style={{ display: 'flex', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Gross Revenue</div>
                  <div style={{ fontWeight: 700, color: colors.text.primary }}>${haulMatch.totalRevenue?.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Net Revenue</div>
                  <div style={{ fontWeight: 700, color: colors.accent.success }}>${(haulMatch.customer_net_credit ?? haulMatch.netRevenue ?? 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleHaulConfirm}
                disabled={completing}
                style={{ flex: 1, padding: '12px 20px', background: colors.accent.success, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 800, cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.7 : 1 }}
              >
                {completing ? 'Recording...' : 'Mark as Hauled'}
              </button>
              <button
                onClick={() => setHaulMatch(null)}
                disabled={completing}
                style={{ padding: '12px 20px', background: 'none', border: `1px solid ${colors.border.accent}`, borderRadius: '10px', color: colors.text.secondary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {mapMatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.9)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setMapMatch(null)}>
          <div style={{ width: '100%', maxWidth: '1400px', height: '80vh', background: colors.background.overlay, borderRadius: '16px', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{mapMatch.origin.address} → {mapMatch.destination.address}</h4>
              <button onClick={() => setMapMatch(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.secondary, fontSize: '24px' }}>✕</button>
            </div>
            <div style={{ height: 'calc(100% - 60px)' }}>
              <RouteMap
                route={{
                  origin_lat: mapMatch.origin.lat,
                  origin_lng: mapMatch.origin.lng,
                  dest_lat: mapMatch.destination.lat,
                  dest_lng: mapMatch.destination.lng,
                  origin_city: mapMatch.origin.address,
                  dest_city: mapMatch.destination.address,
                  distance_miles: mapMatch.distance
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cancel Request Dialog */}
      {showCancelDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => !cancelling && setShowCancelDialog(false)}>
          <div style={{ background: colors.background.overlay, borderRadius: '16px', maxWidth: '500px', width: '100%', border: `1px solid ${colors.border.accent}`, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.accent.danger }}>Cancel Backhaul Request?</h3>
                <button onClick={() => setShowCancelDialog(false)} disabled={cancelling} style={{ background: 'none', border: 'none', cursor: cancelling ? 'not-allowed' : 'pointer', padding: '4px', color: colors.text.secondary, opacity: cancelling ? 0.5 : 1 }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 20px 0', fontSize: '15px', color: colors.text.primary, lineHeight: '1.6' }}>
                This will cancel <strong>{request.request_name}</strong>. Please select a reason:
              </p>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Cancellation Reason *</label>
                <select 
                  value={cancelReason} 
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={cancelling}
                  style={{ width: '100%', padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', cursor: cancelling ? 'not-allowed' : 'pointer' }}
                >
                  <option value="">-- Select a reason --</option>
                  <option value="accident">ACCIDENT</option>
                  <option value="weather">WEATHER</option>
                  <option value="illness">ILLNESS</option>
                  <option value="returns">RETURNS</option>
                  <option value="hours_of_service">HOURS OF SERVICE</option>
                  <option value="no_load_avail">NO LOAD AVAIL</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCancelDialog(false)} disabled={cancelling} style={{ padding: '12px 24px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.5 : 1 }}>
                  Keep Backhaul Request
                </button>
                <button onClick={handleCancelRequest} disabled={cancelling || !cancelReason} style={{ padding: '12px 24px', background: colors.accent.danger, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: (cancelling || !cancelReason) ? 'not-allowed' : 'pointer', opacity: (cancelling || !cancelReason) ? 0.5 : 1 }}>
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel Backhaul Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Truckstop nudge toast */}
      {toastLoad && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 20000, background: colors.background.overlay, border: `1px solid ${colors.accent.success}60`, borderRadius: '12px', padding: '16px', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'fadeInUp 0.2s ease' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: colors.text.primary, marginBottom: '2px' }}>
            {toastLoad.origin.address} → {toastLoad.destination.address}
          </div>
          <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '12px' }}>
            If you book it, mark it as hauled to track your revenue.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setHaulMatch(toastLoad); setToastLoad(null); }} style={{ flex: 1, padding: '8px 12px', background: colors.accent.success, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              Mark as Hauled
            </button>
            <button onClick={() => setToastLoad(null)} style={{ padding: '8px 12px', background: 'none', border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.secondary, fontSize: '12px', cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 560px) {
          .br-header-actions { width: 100%; }
          .br-header-actions button { flex: 1; justify-content: center; }
          .br-route-info { grid-template-columns: 1fr !important; }
          .br-route-info > div:nth-child(2) { display: flex; flex-direction: row; justify-content: flex-start; gap: 8px; }
          .br-addl-info { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 380px) {
          .br-addl-info { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};
