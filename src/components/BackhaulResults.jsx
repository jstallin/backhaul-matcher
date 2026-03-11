import { useState } from 'react';
import { MapPin, Navigation, TrendingUp, Truck, Package, Edit, X, Map } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { RouteMap } from './RouteMap';

export const BackhaulResults = ({ request, fleet, matches, onBack, onEdit, onCancel }) => {
  const { colors } = useTheme();
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [mapMatch, setMapMatch] = useState(null);
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
        <div className="br-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ padding: '8px 16px', minHeight: '44px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            ← Back to Backhaul Requests
          </button>
          <div className="br-header-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>OOR Miles</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.accent.primary }}>{match.additionalMiles} mi</div>
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
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                <button onClick={() => setSelectedMatch(match)} style={{ flex: 1, padding: '12px 20px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.secondary; }} onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primary; }}>
                  <Package size={16} />
                  View Details
                </button>
                <button onClick={(e) => { e.stopPropagation(); setMapMatch(match); }} style={{ flex: 1, padding: '12px 20px', background: colors.background.secondary, border: `2px solid ${colors.accent.primary}`, borderRadius: '8px', color: colors.accent.primary, fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.accent.primary}10`; }} onMouseLeave={(e) => { e.currentTarget.style.background = colors.background.secondary; }}>
                  <Map size={16} />
                  View on Map
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Pickup Date</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{formatDate(m.pickupDate)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px' }}>Delivery Date</div>
                        <div style={{ fontWeight: 600, color: colors.text.primary }}>{formatDate(m.deliveryDate)}</div>
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
                    </div>
                  </div>
                </div>

                {/* Accept Route CTA */}
                <div style={{ paddingTop: '4px', display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      // TODO: Integrate with loadboard API to claim this route
                      alert(`Accept Route placeholder: Load ${m.load_id}\n${m.origin.address} → ${m.destination.address}\n\nThis will connect to the loadboard API to claim the route.`);
                    }}
                    style={{ flex: 1, padding: '14px 24px', background: colors.accent.success, border: 'none', borderRadius: '10px', color: '#ffffff', fontSize: '15px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <TrendingUp size={18} />
                    Accept Route
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
      <style>{`
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
