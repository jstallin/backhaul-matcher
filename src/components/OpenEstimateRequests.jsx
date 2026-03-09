import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect } from 'react';
import { FileText, MapPin, Calendar, TrendingUp, DollarSign, ChevronRight } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { EstimateResults } from './EstimateResults';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { findRouteHomeBackhauls } from '../utils/routeHomeMatching';
import { parseDatumPoint } from '../utils/mapboxGeocoding';
import { geocodeFleetAddress, updateFleetCoordinates } from '../utils/geocodeFleetAddress';
import { getLoadsForMatching } from '../utils/getLoadsForMatching';

export const OpenEstimateRequests = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedFleet, setSelectedFleet] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

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

  const handleSelectRequest = async (request) => {
    setLoadingMatches(true);
    setSelectedRequest(request);
    setMatches([]);

    try {
      let fleet = await db.fleets.getById(request.fleet_id);

      if (!fleet.home_lat || !fleet.home_lng) {
        const success = await updateFleetCoordinates(db, fleet.id, fleet.home_address);
        if (success) {
          fleet = await db.fleets.getById(request.fleet_id);
        } else {
          console.error('Failed to geocode fleet address');
          setLoadingMatches(false);
          return;
        }
      }

      setSelectedFleet(fleet);

      const rawProfile = Array.isArray(fleet.fleet_profiles)
        ? fleet.fleet_profiles[0]
        : fleet.fleet_profiles;

      const fleetProfile = rawProfile
        ? {
            trailerType:   rawProfile.trailer_type   || 'Dry Van',
            trailerLength: rawProfile.trailer_length || 53,
            weightLimit:   rawProfile.weight_limit   || 45000,
          }
        : { trailerType: 'Dry Van', trailerLength: 53, weightLimit: 45000 };

      const hasRateConfig = rawProfile && (rawProfile.revenue_split_carrier != null || rawProfile.mileage_rate != null);
      const rateConfig = hasRateConfig ? {
        revenueSplitCarrier: rawProfile.revenue_split_carrier || 20,
        mileageRate:         rawProfile.mileage_rate          ? parseFloat(rawProfile.mileage_rate)          : 0,
        stopRate:            rawProfile.stop_rate             ? parseFloat(rawProfile.stop_rate)             : 0,
        otherCharge1Amount:  rawProfile.other_charge_1_amount ? parseFloat(rawProfile.other_charge_1_amount) : 0,
        otherCharge2Amount:  rawProfile.other_charge_2_amount ? parseFloat(rawProfile.other_charge_2_amount) : 0,
        fuelPeg:             rawProfile.fuel_peg              ? parseFloat(rawProfile.fuel_peg)              : 0,
        fuelMpg:             rawProfile.fuel_mpg              ? parseFloat(rawProfile.fuel_mpg)              : 6,
        doePaddRate:         rawProfile.doe_padd_rate         ? parseFloat(rawProfile.doe_padd_rate)         : 0,
      } : null;

      const geocoded = await parseDatumPoint(request.datum_point);
      const fleetHome = { lat: fleet.home_lat, lng: fleet.home_lng, address: fleet.home_address };

      const datumPoint = geocoded
        ? { address: geocoded.city, lat: geocoded.lat, lng: geocoded.lng }
        : { address: request.datum_point, lat: fleet.home_lat, lng: fleet.home_lng };

      const geocodeFailed = datumPoint.lat === fleet.home_lat && datumPoint.lng === fleet.home_lng;
      const homeRadiusMiles   = geocodeFailed ? 200 : 50;
      const corridorWidthMiles = geocodeFailed ? 300 : 100;

      const { loads: loadsForMatching, isLive } = await getLoadsForMatching(user.id, request.fleet_id);
      if (isLive) {
        console.log(`Using ${loadsForMatching.length} live imported loads for matching`);
      } else {
        console.log('No imported loads found — using demo data');
      }

      const result = await findRouteHomeBackhauls(
        datumPoint,
        fleetHome,
        fleetProfile,
        loadsForMatching,
        homeRadiusMiles,
        corridorWidthMiles,
        rateConfig,
        request.is_relay || false
      );

      setMatches(result.opportunities);
    } catch (error) {
      console.error('Error loading estimate matches:', error);
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleEditRequest = () => {
    localStorage.setItem('editingEstimateRequest', JSON.stringify(selectedRequest));
    onMenuNavigate('start-estimate-request');
  };

  const handleCancelRequest = async (cancelReason) => {
    try {
      await db.estimateRequests.update(selectedRequest.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason,
      });
      alert('Estimate request cancelled successfully!');
      setSelectedRequest(null);
      setSelectedFleet(null);
      setMatches([]);
      loadRequests();
    } catch (error) {
      console.error('Error cancelling estimate request:', error);
      throw error;
    }
  };

  const formatCurrency = (value) => {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading estimate requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      <header style={{ padding: '24px 32px', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 1001 }} className="no-print">
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <HaulMonitorLogo size="medium" />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="open-estimate-requests" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }} className="no-print">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>
            Open Estimate Requests
          </h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            {selectedRequest
              ? `Report: ${selectedRequest.request_name}`
              : 'Click an estimate request to generate a revenue report'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {selectedRequest ? (
          loadingMatches ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: colors.text.secondary }}>Finding opportunities and building report...</p>
            </div>
          ) : (
            <EstimateResults
              request={selectedRequest}
              fleet={selectedFleet}
              matches={matches}
              onBack={() => { setSelectedRequest(null); setSelectedFleet(null); setMatches([]); }}
              onEdit={handleEditRequest}
              onCancel={handleCancelRequest}
            />
          )
        ) : requests.length === 0 ? (
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
          <>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                Your Estimate Requests ({requests.filter(r => r.status === 'active').length})
              </h3>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                Click a tile to generate the revenue report
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
              {requests.filter(r => r.status === 'active').map((request) => (
                <div
                  key={request.id}
                  onClick={() => handleSelectRequest(request)}
                  style={{ background: colors.background.card, border: `2px solid ${colors.accent.success}40`, borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accent.primary}30`; e.currentTarget.style.borderColor = colors.accent.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = `${colors.accent.success}40`; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>{request.request_name}</h4>
                        <div style={{ padding: '4px 12px', background: `${colors.accent.success}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: colors.accent.success, textTransform: 'uppercase' }}>
                          ● Active
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>{request.fleets?.name || 'Unknown Fleet'}</div>
                    </div>
                    <ChevronRight size={24} color={colors.accent.primary} />
                  </div>

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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
};
