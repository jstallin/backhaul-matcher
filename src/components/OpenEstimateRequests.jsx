import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect } from 'react';
import { FileText, Truck, MapPin, Calendar, DollarSign, TrendingUp, ChevronRight } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const OpenEstimateRequests = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await db.estimateRequests.getAll(user.id);
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading estimate requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (value) => {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading estimate requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      <header style={{ padding: '24px 32px', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <HaulMonitorLogo size="medium" />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="open-estimate-requests" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>
            Open Estimate Requests
          </h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            {selectedRequest
              ? `Viewing: ${selectedRequest.request_name}`
              : 'Click an estimate request to view details'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {selectedRequest ? (
          /* ── Detail placeholder ── */
          <div>
            <button
              onClick={() => setSelectedRequest(null)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', padding: '10px 20px', background: 'transparent', border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.secondary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              ← Back to Estimate Requests
            </button>

            <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '26px', fontWeight: 900, color: colors.text.primary }}>
                    {selectedRequest.request_name}
                  </h3>
                  <div style={{ fontSize: '14px', color: colors.text.secondary }}>
                    {selectedRequest.fleets?.name || 'Unknown Fleet'}
                  </div>
                </div>
                <div style={{ padding: '6px 16px', background: `${colors.accent.success}20`, borderRadius: '12px', fontSize: '13px', fontWeight: 700, color: colors.accent.success, textTransform: 'uppercase' }}>
                  ● Active
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px', paddingTop: '24px', borderTop: `1px solid ${colors.border.secondary}` }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase', marginBottom: '6px' }}>Datum Point</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>{selectedRequest.datum_point}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase', marginBottom: '6px' }}>Available</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>{formatDate(selectedRequest.equipment_available_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase', marginBottom: '6px' }}>Needed Back</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>{formatDate(selectedRequest.equipment_needed_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase', marginBottom: '6px' }}>Annual Volume</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>{selectedRequest.annual_volume != null ? `${selectedRequest.annual_volume} loads/yr` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase', marginBottom: '6px' }}>Min Net Credit</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>{formatCurrency(selectedRequest.min_net_credit)}</div>
                </div>
                {selectedRequest.is_relay && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase', marginBottom: '6px' }}>Type</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: colors.accent.primary }}>Relay</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : requests.length === 0 ? (
          /* ── Empty state ── */
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <FileText size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Estimate Requests Yet</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              Create your first estimate request to start projecting revenue and costs.
            </p>
            <button onClick={() => onMenuNavigate('start-estimate-request')} style={{ padding: '14px 28px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} />
              Create Estimate Request
            </button>
          </div>
        ) : (
          /* ── Tile grid ── */
          <>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                Your Estimate Requests ({requests.filter(r => r.status === 'active').length})
              </h3>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                Click a tile to view details
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
              {requests.filter(r => r.status === 'active').map((request) => (
                <div
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  style={{ background: colors.background.card, border: `2px solid ${colors.accent.success}40`, borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accent.primary}30`; e.currentTarget.style.borderColor = colors.accent.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = colors.accent.success + '40'; }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                          {request.request_name}
                        </h4>
                        <div style={{ padding: '4px 12px', background: `${colors.accent.success}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: colors.accent.success, textTransform: 'uppercase' }}>
                          ● Active
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                        {request.fleets?.name || 'Unknown Fleet'}
                      </div>
                    </div>
                    <ChevronRight size={24} color={colors.accent.primary} />
                  </div>

                  {/* Fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', paddingTop: '16px', borderTop: `1px solid ${colors.border.secondary}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={16} color={colors.text.tertiary} />
                      <div>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Datum Point</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>{request.datum_point}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} color={colors.text.tertiary} />
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Available</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>{formatDate(request.equipment_available_date)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} color={colors.text.tertiary} />
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Needed Back</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>{formatDate(request.equipment_needed_date)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Estimate-specific fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px', background: `${colors.accent.primary}08`, border: `1px solid ${colors.accent.primary}20`, borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={16} color={colors.accent.primary} />
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Annual Volume</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: colors.text.primary }}>
                            {request.annual_volume != null ? `${request.annual_volume} loads/yr` : '—'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <DollarSign size={16} color={colors.accent.primary} />
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Min Net Credit</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: colors.text.primary }}>
                            {formatCurrency(request.min_net_credit)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {request.is_relay && (
                    <div style={{ marginTop: '12px', padding: '8px 12px', background: `${colors.accent.primary}10`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: colors.accent.primary }}>
                      RELAY REQUEST
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
