import { useState } from 'react';
import { MapPin, DollarSign, Navigation, TrendingUp, Truck, Calendar, Package, Edit, X, Map } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { RouteMap } from './RouteMap';
import { RouteStats } from './RouteStats';

export const BackhaulResults = ({ request, fleet, matches, onBack, onEdit, onCancel }) => {
  const { colors } = useTheme();
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ padding: '8px 16px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            ← Back to Requests
          </button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onEdit} style={{ padding: '10px 20px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Edit size={16} />
              Edit Request
            </button>
            <button onClick={() => setShowCancelDialog(true)} style={{ padding: '10px 20px', background: colors.background.secondary, border: `2px solid ${colors.accent.danger}`, borderRadius: '8px', color: colors.accent.danger, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <X size={16} />
              Cancel Request
            </button>
          </div>
        </div>
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
          {matches.map((match, index) => (
            <div key={match.id} style={{ marginBottom: '16px', background: colors.background.card, border: `2px solid ${index < 3 ? getRankColor(index) + '40' : colors.border.primary}`, borderRadius: '16px', padding: '24px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${getRankColor(index)}30`; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
              
              {/* Rank Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ padding: '6px 16px', background: `${getRankColor(index)}20`, borderRadius: '20px', fontSize: '14px', fontWeight: 800, color: getRankColor(index) }}>
                  {getRankLabel(index)}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
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
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>{match.equipmentType}</div>
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
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Out of Route</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.accent.primary }}>{match.oorMiles} mi</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Additional Miles</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>{match.additionalMiles} mi</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>To Pickup</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>{match.finalToPickup} mi</div>
                </div>
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
                      FSC: ${match.fsc_per_mile?.toFixed(3)}/mi | OOR: {match.additionalMiles} mi
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: match.customer_net_credit >= 0 ? colors.accent.success : colors.accent.danger }}>
                      Net: {formatCurrency(match.customer_net_credit)}
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div style={{ marginTop: '12px', padding: '12px', background: colors.background.secondary, borderRadius: '8px', fontSize: '12px', color: colors.text.secondary }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div><strong>Broker:</strong> {match.broker}</div>
                  <div><strong>Shipper:</strong> {match.shipper}</div>
                  <div><strong>Freight:</strong> {match.freightType}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                <button onClick={() => setSelectedMatch(match)} style={{ flex: 1, padding: '12px 20px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.secondary; }} onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primary; }}>
                  <Package size={16} />
                  View Details
                </button>
                <button onClick={(e) => { e.stopPropagation(); setSelectedMatch(match); setShowMap(true); }} style={{ flex: 1, padding: '12px 20px', background: colors.background.secondary, border: `2px solid ${colors.accent.primary}`, borderRadius: '8px', color: colors.accent.primary, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.accent.primary}10`; }} onMouseLeave={(e) => { e.currentTarget.style.background = colors.background.secondary; }}>
                  <Map size={16} />
                  View on Map
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Route Details Modal */}
      {selectedMatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setSelectedMatch(null)}>
          <div style={{ background: colors.background.overlay, borderRadius: '16px', maxWidth: '1200px', width: '100%', maxHeight: '90vh', overflow: 'auto', border: `1px solid ${colors.border.accent}`, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                Route Details - {selectedMatch.origin.address} → {selectedMatch.destination.address}
              </h3>
              <button onClick={() => setSelectedMatch(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: colors.text.secondary }}>
                ✕
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <RouteStats 
                routeData={{
                  origin: selectedMatch.origin.address,
                  destination: selectedMatch.destination.address,
                  distance: selectedMatch.distance,
                  revenue: selectedMatch.totalRevenue,
                  oorMiles: selectedMatch.oorMiles,
                  additionalMiles: selectedMatch.additionalMiles,
                  revenuePerMile: selectedMatch.revenuePerMile,
                  equipmentType: selectedMatch.equipmentType,
                  weight: selectedMatch.weight,
                  pickupDate: selectedMatch.pickupDate,
                  deliveryDate: selectedMatch.deliveryDate
                }}
                showMap={() => setShowMap(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {showMap && selectedMatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.9)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowMap(false)}>
          <div style={{ width: '100%', maxWidth: '1400px', height: '80vh', background: colors.background.overlay, borderRadius: '16px', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Route Map</h4>
              <button onClick={() => setShowMap(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.secondary, fontSize: '24px' }}>✕</button>
            </div>
            <div style={{ height: 'calc(100% - 60px)' }}>
              <RouteMap
                route={{
                  origin_lat: selectedMatch.origin.lat,
                  origin_lng: selectedMatch.origin.lng,
                  dest_lat: selectedMatch.destination.lat,
                  dest_lng: selectedMatch.destination.lng,
                  origin_city: selectedMatch.origin.address,
                  dest_city: selectedMatch.destination.address,
                  distance_miles: selectedMatch.distance
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
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.accent.danger }}>Cancel Request?</h3>
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
                  Keep Request
                </button>
                <button onClick={handleCancelRequest} disabled={cancelling || !cancelReason} style={{ padding: '12px 24px', background: colors.accent.danger, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: (cancelling || !cancelReason) ? 'not-allowed' : 'pointer', opacity: (cancelling || !cancelReason) ? 0.5 : 1 }}>
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
