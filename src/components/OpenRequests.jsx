import { useState, useEffect } from 'react';
import { FileText, Truck, MapPin, Calendar, RefreshCw, Bell, Edit, Trash2, X, CheckCircle, Clock, ChevronRight } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BackhaulResults } from './BackhaulResults';
import { findBackhaulOpportunities } from '../utils/backhaulMatching';
import { parseDatumPoint } from '../utils/geocoding';

export const OpenRequests = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedFleet, setSelectedFleet] = useState(null);
  const [backhaulMatches, setBackhaulMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const requestsData = await db.requests.getAll(user.id);
      setRequests(requestsData || []);
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = async (request) => {
    setLoadingMatches(true);
    setSelectedRequest(request);

    try {
      // Load fleet data
      const fleet = await db.fleets.getById(request.fleet_id);
      setSelectedFleet(fleet);

      // Get fleet profile for equipment specs
      const fleetProfile = fleet.fleet_profiles?.[0] || {
        trailerType: 'Dry Van',
        trailerLength: 53,
        weightLimit: 45000
      };

      // Try to geocode the datum point, fall back to fleet home if we can't
      const geocoded = parseDatumPoint(request.datum_point);
      
      const finalStop = geocoded ? {
        address: geocoded.city,
        lat: geocoded.lat,
        lng: geocoded.lng
      } : {
        address: request.datum_point,
        lat: fleet.home_lat,
        lng: fleet.home_lng
      };

      const fleetHome = {
        lat: fleet.home_lat,
        lng: fleet.home_lng
      };

      console.log('Matching with:', {
        datumPoint: request.datum_point,
        geocoded: geocoded || 'Using fleet home',
        finalStop,
        fleetHome,
        fleetProfile,
        searchRadius: 200,
        isRelay: request.is_relay
      });

      // Find matches with 200 mile search radius
      const matches = findBackhaulOpportunities(
        finalStop,
        fleetHome,
        fleetProfile,
        200, // search radius
        request.is_relay
      );

      console.log('Found matches:', matches.length);

      setBackhaulMatches(matches);
    } catch (error) {
      console.error('Error loading matches:', error);
      setBackhaulMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.cyan}40`, borderTop: `4px solid ${colors.accent.cyan}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      <header style={{ padding: '24px 32px', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color={colors.accent.orange} strokeWidth={2.5} />
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em', background: `linear-gradient(135deg, ${colors.accent.orange} 0%, ${colors.accent.cyan} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BACKHAUL</h1>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary, fontWeight: 500, letterSpacing: '0.05em' }}>SMART RETURN ROUTE OPTIMIZATION</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="open-requests" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>Open Requests</h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            {selectedRequest ? 'Backhaul opportunities for your request' : 'Click a request to view matching backhaul opportunities'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {selectedRequest ? (
          loadingMatches ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.cyan}40`, borderTop: `4px solid ${colors.accent.cyan}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: colors.text.secondary }}>Finding backhaul opportunities...</p>
            </div>
          ) : (
            <BackhaulResults 
              request={selectedRequest}
              fleet={selectedFleet}
              matches={backhaulMatches}
              onBack={() => setSelectedRequest(null)}
            />
          )
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <FileText size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Requests Yet</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              Create your first backhaul request to start finding opportunities.
            </p>
            <button onClick={() => onMenuNavigate('start-request')} style={{ padding: '14px 28px', background: `linear-gradient(135deg, ${colors.accent.cyan} 0%, #00a8cc 100%)`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} />
              Start Request
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                Your Requests ({requests.length})
              </h3>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                Click a request card to view matching backhaul opportunities
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
              {requests.filter(r => r.status === 'active' || r.status === 'paused').map((request) => (
                <div key={request.id} onClick={() => handleSelectRequest(request)} style={{ background: colors.background.card, border: `2px solid ${request.status === 'active' ? colors.accent.green + '40' : colors.border.primary}`, borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accent.cyan}30`; e.currentTarget.style.borderColor = colors.accent.cyan; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = request.status === 'active' ? colors.accent.green + '40' : colors.border.primary; }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                          {request.request_name}
                        </h4>
                        <div style={{ padding: '4px 12px', background: request.status === 'active' ? `${colors.accent.green}20` : `${colors.text.tertiary}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: request.status === 'active' ? colors.accent.green : colors.text.tertiary, textTransform: 'uppercase' }}>
                          {request.status === 'active' ? '● Active' : '○ Paused'}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                        {request.fleets?.name || 'Unknown Fleet'}
                      </div>
                    </div>
                    <ChevronRight size={24} color={colors.accent.cyan} />
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
                  </div>

                  {request.is_relay && (
                    <div style={{ marginTop: '12px', padding: '8px 12px', background: `${colors.accent.orange}10`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: colors.accent.orange }}>
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
