import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect, useRef } from 'react';
import { FileText, Truck, MapPin, Calendar, RefreshCw, Bell, Edit, Trash2, X, CheckCircle, Clock, ChevronRight } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { RouteHomeMap } from './RouteHomeMap';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BackhaulResults } from './BackhaulResults';
import { findRouteHomeBackhauls } from '../utils/routeHomeMatching';
import { parseDatumPoint } from '../utils/mapboxGeocoding';
import { geocodeFleetAddress, updateFleetCoordinates } from '../utils/geocodeFleetAddress';
import { sendBackhaulChangeNotification, detectBackhaulChanges } from '../utils/notificationService';
import backhaulLoadsData from '../data/backhaul_loads_data.json';

export const OpenRequests = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedFleet, setSelectedFleet] = useState(null);
  const [datumCoordinates, setDatumCoordinates] = useState(null); // Store geocoded datum coords
  const [backhaulMatches, setBackhaulMatches] = useState([]);
  const [routeData, setRouteData] = useState(null); // Store route and corridor data for map
  const [previousMatches, setPreviousMatches] = useState([]); // Track previous matches for change detection
  const previousMatchesRef = useRef([]); // Ref to avoid stale closure in auto-refresh interval
  const [loadingMatches, setLoadingMatches] = useState(false);
  
  // Auto-refresh state - read from request, not local
  const [nextRefreshTime, setNextRefreshTime] = useState(null);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('');

  useEffect(() => {
    loadRequests();
  }, []);

  // Auto-refresh timer - uses settings from the request itself
  useEffect(() => {
    if (!selectedRequest || !selectedRequest.auto_refresh) {
      setNextRefreshTime(null);
      return;
    }

    // Database stores interval in MINUTES (not hours)
    const refreshIntervalMinutes = selectedRequest.auto_refresh_interval || 240; // Default 240 min (4 hours)
    const refreshIntervalMs = refreshIntervalMinutes * 60 * 1000;

    // Set initial refresh time
    const now = new Date();
    const nextRefresh = new Date(now.getTime() + refreshIntervalMs);
    setNextRefreshTime(nextRefresh);

    console.log(`🔄 Auto-refresh enabled: every ${refreshIntervalMinutes} minutes (${refreshIntervalMinutes / 60} hours)`);

    // Set up interval to refresh matches
    const refreshTimer = setInterval(() => {
      console.log('🔄 Auto-refreshing backhaul matches...');
      handleSelectRequest(selectedRequest);
      
      // Update next refresh time
      const newNextRefresh = new Date(Date.now() + refreshIntervalMs);
      setNextRefreshTime(newNextRefresh);
    }, refreshIntervalMs);

    return () => clearInterval(refreshTimer);
  }, [selectedRequest?.id, selectedRequest?.auto_refresh, selectedRequest?.auto_refresh_interval]);

  // Update countdown display every second
  useEffect(() => {
    if (!nextRefreshTime) {
      setTimeUntilRefresh('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = nextRefreshTime - now;

      if (diff <= 0) {
        setTimeUntilRefresh('Refreshing...');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      if (minutes > 0) {
        setTimeUntilRefresh(`${minutes}m ${seconds}s`);
      } else {
        setTimeUntilRefresh(`${seconds}s`);
      }
    };

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);

    return () => clearInterval(countdownInterval);
  }, [nextRefreshTime]);

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
      let fleet = await db.fleets.getById(request.fleet_id);
      
      console.log('🚛 Fleet loaded:', fleet.name);
      console.log('📦 Fleet profiles:', fleet.fleet_profiles);
      console.log('🚚 Fleet trucks:', fleet.trucks);
      
      // FIX: If fleet home coordinates are missing, geocode them now
      if (!fleet.home_lat || !fleet.home_lng) {
        console.warn('⚠️ Fleet home coordinates missing! Attempting to geocode...');
        const success = await updateFleetCoordinates(db, fleet.id, fleet.home_address);
        if (success) {
          // Reload fleet with updated coordinates
          fleet = await db.fleets.getById(request.fleet_id);
          console.log('✅ Fleet coordinates updated:', fleet.home_lat, fleet.home_lng);
        } else {
          console.error('❌ Failed to geocode fleet address. Cannot find matches.');
          setBackhaulMatches([]);
          setLoadingMatches(false);
          return;
        }
      }
      
      setSelectedFleet(fleet);

      // Get fleet profile for equipment specs
      const fleetProfile = fleet.fleet_profiles?.[0] || {
        trailerType: 'Dry Van',
        trailerLength: 53,
        weightLimit: 45000
      };

      // Extract rate configuration for net revenue calculations
      // fleet_profiles comes as array from Supabase join, or could be object
      const rawProfile = Array.isArray(fleet.fleet_profiles)
        ? fleet.fleet_profiles[0]
        : fleet.fleet_profiles;

      console.log('📋 Raw fleet profile data:', JSON.stringify(rawProfile, null, 2));

      const hasRateConfig = rawProfile && (rawProfile.revenue_split_carrier != null || rawProfile.mileage_rate != null);
      const rateConfig = hasRateConfig ? {
        revenueSplitCarrier: rawProfile.revenue_split_carrier || 20,
        mileageRate: rawProfile.mileage_rate ? parseFloat(rawProfile.mileage_rate) : 0,
        stopRate: rawProfile.stop_rate ? parseFloat(rawProfile.stop_rate) : 0,
        otherCharge1Amount: rawProfile.other_charge_1_amount ? parseFloat(rawProfile.other_charge_1_amount) : 0,
        otherCharge2Amount: rawProfile.other_charge_2_amount ? parseFloat(rawProfile.other_charge_2_amount) : 0,
        fuelPeg: rawProfile.fuel_peg ? parseFloat(rawProfile.fuel_peg) : 0,
        fuelMpg: rawProfile.fuel_mpg ? parseFloat(rawProfile.fuel_mpg) : 6,
        doePaddRate: rawProfile.doe_padd_rate ? parseFloat(rawProfile.doe_padd_rate) : 0
      } : null;

      console.log('⚙️ Fleet profile used for matching:', fleetProfile);
      console.log('💰 Rate config:', rateConfig || 'Not configured — fleet profile has no rate fields');

      // Geocode the datum point using Mapbox API (with fallback to local lookup)
      const geocoded = await parseDatumPoint(request.datum_point);
      
      console.log('📍 Geocoding input:', request.datum_point);
      console.log('📍 Geocoding result:', geocoded);

      const datumPoint = geocoded ? {
        address: geocoded.city,
        lat: geocoded.lat,
        lng: geocoded.lng
      } : {
        address: request.datum_point,
        lat: fleet.home_lat,
        lng: fleet.home_lng
      };

      console.log('🎯 Datum point coordinates:', datumPoint);
      console.log('⚠️ WARNING: If datum === home, geocoding failed!');
      
      if (datumPoint.lat === fleet.home_lat && datumPoint.lng === fleet.home_lng) {
        console.error('❌ GEOCODING FAILED - Using home as datum (this will find 0 matches!)');
        console.error('Try entering datum as: "Alachua, FL" or "Alachua, Florida" or zip "32615"');
      }

      // Store the geocoded datum coordinates for the map
      setDatumCoordinates({
        lat: datumPoint.lat,
        lng: datumPoint.lng
      });

      const fleetHome = {
        lat: fleet.home_lat,
        lng: fleet.home_lng,
        address: fleet.home_address
      };

      console.log('🏠 Fleet home coordinates:', fleetHome);

      console.log('🔍 Route-home matching with:', {
        datumPoint: request.datum_point,
        geocoded: geocoded || '⚠️ FAILED - using fleet home',
        datumPoint,
        fleetHome,
        fleetProfile,
        homeRadiusMiles: datumPoint.lat === fleet.home_lat ? 200 : 50, // Relaxed if geocoding failed
        corridorWidthMiles: datumPoint.lat === fleet.home_lat ? 300 : 100
      });

      // If geocoding failed (datum === home), use very relaxed criteria to still show some results
      const homeRadiusMiles = (datumPoint.lat === fleetHome.lat && datumPoint.lng === fleetHome.lng) ? 200 : 50;
      const corridorWidthMiles = (datumPoint.lat === fleetHome.lat && datumPoint.lng === fleetHome.lng) ? 300 : 100;

      // Find matches along route home (50 mile home radius, 50 mile corridor for geographic filtering)
      const result = await findRouteHomeBackhauls(
        datumPoint,
        fleetHome,
        fleetProfile,
        backhaulLoadsData,
        homeRadiusMiles,
        corridorWidthMiles,
        rateConfig
      );

      const matches = result.opportunities;

      // Store route data for map visualization
      setRouteData(result.routeData);

      console.log('✅ Found matches along route home:', matches.length);
      if (result.routeData?.corridor) {
        console.log('✅ Route corridor created for map visualization');
      }
      
      if (matches.length === 0) {
        console.warn('⚠️ NO MATCHES FOUND. Debugging info:');
        console.warn('  - Check if datum point geocoded correctly');
        console.warn('  - Try entering datum as "City, State" format');
        console.warn('  - Datum coordinates:', datumPoint);
        console.warn('  - Home coordinates:', fleetHome);
        console.warn('  - Equipment:', fleetProfile);
      } else {
        console.log('🎯 Top 5 matches:');
        matches.slice(0, 5).forEach((m, i) => {
          console.log(`  ${i+1}. ${m.pickup_city}, ${m.pickup_state} → ${m.delivery_city}, ${m.delivery_state}`);
          console.log(`     $${m.total_revenue} | ${m.total_miles}mi total | +${m.additional_miles}mi vs direct`);
        });

        // Detect material changes and send notifications
        // Use ref to avoid stale closure issue with auto-refresh interval
        if (request.notification_enabled && previousMatchesRef.current.length > 0) {
          const change = detectBackhaulChanges(previousMatchesRef.current, matches);
          
          if (change) {
            console.log('📬 Material change detected:', change.type);
            
            // Send notification
            sendBackhaulChangeNotification({
              method: request.notification_method || 'both',
              email: fleet.email,
              phone: fleet.phone_number,
              requestName: request.request_name,
              fleetName: fleet.name,
              oldTopMatch: change.oldMatch,
              newTopMatch: change.newMatch,
              changeType: change.type
            }).then(result => {
              if (result.success) {
                console.log('✅ Notification sent successfully');
              } else {
                console.error('❌ Notification failed:', result.error);
              }
            });
          } else {
            console.log('ℹ️ No material changes detected - no notification sent');
          }
        }

        // Store matches for next comparison (update both ref and state)
        previousMatchesRef.current = matches;
        setPreviousMatches(matches);
      }

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

  const handleEditRequest = () => {
    // Navigate to edit mode - pass request to StartRequest component
    // For now, we'll store in localStorage and navigate
    localStorage.setItem('editingRequest', JSON.stringify(selectedRequest));
    onMenuNavigate('start-request');
  };

  const handleCancelRequest = async (cancelReason) => {
    try {
      await db.requests.update(selectedRequest.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason
      });
      
      alert('Request cancelled successfully!');
      setSelectedRequest(null);
      loadRequests();
    } catch (error) {
      console.error('Error cancelling request:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading requests...</p>
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
            <HamburgerMenu currentView="open-requests" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>Open Requests</h2>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
                {selectedRequest ? 'Backhaul opportunities for your request' : 'Click a request to view matching backhaul opportunities'}
              </p>
            </div>
            
            {/* Auto-refresh controls - only show when request is selected */}
            {selectedRequest && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '16px',
                padding: '12px 20px',
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '12px'
              }}>
                {/* Manual Refresh Button */}
                <button
                  onClick={() => handleSelectRequest(selectedRequest)}
                  disabled={loadingMatches}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: 'transparent',
                    border: `1px solid ${colors.accent.primary}`,
                    borderRadius: '8px',
                    color: colors.accent.primary,
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: loadingMatches ? 'not-allowed' : 'pointer',
                    opacity: loadingMatches ? 0.5 : 1,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => !loadingMatches && (e.target.style.background = `${colors.accent.primary}10`)}
                  onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                >
                  <RefreshCw size={16} />
                  Refresh Now
                </button>

                {/* Separator */}
                <div style={{ width: '1px', height: '32px', background: colors.border.secondary }} />

                {/* Auto-refresh status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {selectedRequest.auto_refresh ? (
                    <>
                      {/* Auto-refresh is enabled */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: colors.accent.success
                      }}>
                        <CheckCircle size={16} />
                        Auto-refresh: Every {selectedRequest.auto_refresh_interval >= 60 
                          ? `${Math.round(selectedRequest.auto_refresh_interval / 60)}h` 
                          : `${selectedRequest.auto_refresh_interval}min`}
                      </div>

                      {/* Countdown display */}
                      {timeUntilRefresh && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: `${colors.accent.primary}10`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: colors.accent.primary,
                          fontWeight: 600
                        }}>
                          <Clock size={14} />
                          Next: {timeUntilRefresh}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Auto-refresh is disabled */
                    <div style={{
                      fontSize: '14px',
                      color: colors.text.tertiary
                    }}>
                      Auto-refresh: Disabled
                    </div>
                  )}

                  {/* Link to edit settings */}
                  <button
                    onClick={handleEditRequest}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      border: `1px solid ${colors.border.primary}`,
                      borderRadius: '6px',
                      color: colors.text.secondary,
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = colors.background.hover;
                      e.target.style.color = colors.text.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent';
                      e.target.style.color = colors.text.secondary;
                    }}
                  >
                    Edit Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {selectedRequest ? (
          loadingMatches ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: colors.text.secondary }}>Finding backhaul opportunities along your route home...</p>
            </div>
          ) : (
            <>
              {/* Route Home Map */}
              {selectedRequest && selectedFleet && backhaulMatches.length > 0 && datumCoordinates && (
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 900, color: colors.text.primary }}>
                      Route Home Map
                    </h3>
                    <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
                      Top 10 backhaul opportunities plotted along your route from <strong>{selectedRequest.datum_point}</strong> to <strong>home</strong>
                    </p>
                  </div>
                  <RouteHomeMap
                    datumPoint={datumCoordinates}
                    fleetHome={{
                      lat: selectedFleet.home_lat,
                      lng: selectedFleet.home_lng,
                      address: selectedFleet.home_address
                    }}
                    backhauls={backhaulMatches}
                    selectedLoadId={null}
                    routeData={routeData}
                  />
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: colors.background.secondary,
                    borderRadius: '8px',
                    display: 'flex',
                    gap: '24px',
                    flexWrap: 'wrap',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#EF4444', border: '2px solid white' }} />
                      <span><strong>A</strong> = Datum Point (Current Location)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#10B981', border: '2px solid white' }} />
                      <span><strong>B</strong> = Fleet Home</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#D89F38', border: '2px solid white' }} />
                      <span><strong>1-10</strong> = Pickup Locations</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#5EA0DB', border: '2px solid white' }} />
                      <span><strong>1-10</strong> = Delivery Locations</span>
                    </div>
                    {routeData?.corridor && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '20px', height: '12px', background: 'rgba(216, 159, 56, 0.15)', border: '2px dashed #D89F38', borderRadius: '2px' }} />
                        <span><strong>Search Corridor</strong> = 50-mile buffer along route</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <BackhaulResults 
                request={selectedRequest}
                fleet={selectedFleet}
                matches={backhaulMatches}
                onBack={() => setSelectedRequest(null)}
                onEdit={handleEditRequest}
                onCancel={handleCancelRequest}
              />
            </>
          )
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <FileText size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Requests Yet</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              Create your first backhaul request to start finding opportunities.
            </p>
            <button onClick={() => onMenuNavigate('start-request')} style={{ padding: '14px 28px', background: `colors.accent.primary`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
                <div key={request.id} onClick={() => handleSelectRequest(request)} style={{ background: colors.background.card, border: `2px solid ${request.status === 'active' ? colors.accent.success + '40' : colors.border.primary}`, borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accent.primary}30`; e.currentTarget.style.borderColor = colors.accent.primary; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = request.status === 'active' ? colors.accent.success + '40' : colors.border.primary; }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                          {request.request_name}
                        </h4>
                        <div style={{ padding: '4px 12px', background: request.status === 'active' ? `${colors.accent.success}20` : `${colors.text.tertiary}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: request.status === 'active' ? colors.accent.success : colors.text.tertiary, textTransform: 'uppercase' }}>
                          {request.status === 'active' ? '● Active' : '○ Paused'}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                        {request.fleets?.name || 'Unknown Fleet'}
                      </div>
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
