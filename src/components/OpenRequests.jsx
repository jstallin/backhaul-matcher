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
import { findRouteHomeBackhauls, effectivePickupDate } from '../utils/routeHomeMatching';
import { buildDeclineSnapshot } from '../utils/declineSnapshot';
import { logActivityEvent, ACTIVITY_EVENTS } from '../utils/activityEvents';
import { isRequestExpired, EXPIRED_HINT } from '../utils/requestExpiry';
import { geocodeAddress } from '../utils/pcMilerClient';
import { geocodeDatum } from '../utils/geocodeDatum';
import { geocodeFleetAddress, updateFleetCoordinates } from '../utils/geocodeFleetAddress';
import { sendBackhaulChangeNotification, detectBackhaulChanges } from '../utils/notificationService';
import { effectiveNotificationMethod } from '../utils/smsConsent';
import { getLoadsForMatching } from '../utils/getLoadsForMatching';
import { isExpiredInProgress, finishPayload } from '../utils/autoFinishRequests';
import { unionModes } from '../utils/fleetModes';
import { CoDriver } from './CoDriver';
import { useCredits } from '../hooks/useCredits';
import { BuyCreditsModal } from './BuyCreditsModal';
import { DatImportModal } from './DatImportModal';

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
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [datImportRequest, setDatImportRequest] = useState(null);
  const { balance, loading: creditsLoading, fetchBalance, deductCredit, openCheckout } = useCredits();

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
    const maxRefreshes = selectedRequest.max_auto_refreshes; // null = unlimited (item 006)
    let count = selectedRequest.auto_refresh_count || 0;

    // Set initial refresh time
    const now = new Date();
    const nextRefresh = new Date(now.getTime() + refreshIntervalMs);
    setNextRefreshTime(nextRefresh);

    console.log(`🔄 Auto-refresh enabled: every ${refreshIntervalMinutes} minutes (${refreshIntervalMinutes / 60} hours)`);

    // Set up interval to refresh matches
    const refreshTimer = setInterval(async () => {
      console.log('🔄 Auto-refreshing backhaul matches...');
      handleSelectRequest(selectedRequest);

      count += 1;
      // Persist the running count; self-disable once the cap is reached.
      const reachedLimit = maxRefreshes != null && count >= maxRefreshes;
      const updates = { auto_refresh_count: count, ...(reachedLimit ? { auto_refresh: false } : {}) };
      try {
        const updated = await db.requests.update(selectedRequest.id, updates);
        if (reachedLimit) {
          clearInterval(refreshTimer);
          setNextRefreshTime(null);
          setSelectedRequest(prev => (prev?.id === selectedRequest.id ? { ...prev, ...(updated || updates) } : prev));
          return;
        }
      } catch (err) {
        console.error('Failed to update auto-refresh count:', err?.message || err);
      }

      // Update next refresh time
      const newNextRefresh = new Date(Date.now() + refreshIntervalMs);
      setNextRefreshTime(newNextRefresh);
    }, refreshIntervalMs);

    return () => clearInterval(refreshTimer);
  }, [selectedRequest?.id, selectedRequest?.auto_refresh, selectedRequest?.auto_refresh_interval, selectedRequest?.max_auto_refreshes]);

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
      let requestsData = await db.requests.getAll(user.id) || [];
      // Item 008: auto-complete in_progress requests whose equipment-needed date has
      // passed, keeping the hauled load + revenue and stopping further auto-refresh.
      const expired = requestsData.filter(r => isExpiredInProgress(r));
      if (expired.length) {
        const patch = finishPayload();
        await Promise.all(expired.map(r => db.requests.update(r.id, patch).catch(err => console.error('Auto-finish failed:', err?.message || err))));
        const expiredIds = new Set(expired.map(r => r.id));
        requestsData = requestsData.map(r => expiredIds.has(r.id) ? { ...r, ...patch } : r);
      }
      setRequests(requestsData);
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishRequest = async (request) => {
    try {
      await db.requests.update(request.id, finishPayload());
      setSelectedRequest(null);
      loadRequests();
    } catch (error) {
      console.error('Error finishing request:', error?.message || error);
      alert('Failed to finish request');
    }
  };

  const handleSelectRequest = async (request) => {
    // #83: an expired request can't be run (no credit deducted) — offer the fix.
    if (isRequestExpired(request)) {
      if (window.confirm(`${EXPIRED_HINT}.\n\nEdit "${request.request_name}" now?`)) {
        localStorage.setItem('editingRequest', JSON.stringify(request));
        localStorage.setItem('editingRequestIntent', 'true');
        onMenuNavigate('start-request');
      }
      return;
    }

    setLoadingMatches(true);
    setSelectedRequest(request);

    try {
      // Parallel: fleet fetch + datum geocode have no dependency on each other
      const [fleetInitial, geocoded] = await Promise.all([
        db.fleets.getById(request.fleet_id),
        geocodeDatum(request.datum_point),
      ]);
      let fleet = fleetInitial;

      console.log('🚛 Fleet loaded:', fleet.name);
      console.log('📦 Fleet profiles:', fleet.fleet_profiles);
      console.log('🚚 Fleet trucks:', fleet.trucks);

      // FIX: If fleet home coordinates are missing, geocode them now
      if (!fleet.home_lat || !fleet.home_lng) {
        console.warn('⚠️ Fleet home coordinates missing! Attempting to geocode...');
        const success = await updateFleetCoordinates(db, fleet.id, fleet.home_address);
        if (success) {
          fleet = await db.fleets.getById(request.fleet_id);
          console.log('✅ Fleet coordinates updated:', fleet.home_lat, fleet.home_lng);
        } else {
          console.error('❌ Failed to geocode fleet address. Cannot find matches.');
          setBackhaulMatches([]);
          return;
        }
      }

      setSelectedFleet(fleet);

      // PostgREST returns fleet_profiles as an object (not array) when fleet_id has a UNIQUE constraint
      const rawProfile = Array.isArray(fleet.fleet_profiles)
        ? fleet.fleet_profiles[0]
        : fleet.fleet_profiles;

      const fleetProfile = rawProfile || {
        trailerType: 'Dry Van',
        trailerLength: 53,
        weightLimit: 45000
      };

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

      console.log('📍 Geocoding input:', request.datum_point);
      console.log('📍 Geocoding result:', geocoded);

      const datumPoint = geocoded ? {
        address: geocoded.label,
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

      // #159: "Bypass Fleet Home" — route to the request's search home instead of the
      // fleet's home. Fleet association (rates/equipment) is unchanged; this only
      // substitutes the home coordinates used for corridor + distance math.
      const searchHome = (request.bypass_fleet_home && request.search_home_lat != null && request.search_home_lng != null)
        ? { lat: request.search_home_lat, lng: request.search_home_lng, address: request.search_home_address }
        : null;

      console.log('🏠 Fleet home coordinates:', fleetHome, searchHome ? `(overridden by search home ${searchHome.address})` : '');

      console.log('🔍 Route-home matching with:', {
        geocoded: geocoded || '⚠️ FAILED - using fleet home',
        datumPoint,
        fleetHome,
        fleetProfile,
        homeRadiusMiles: datumPoint.lat === fleet.home_lat ? 200 : 100,
        corridorWidthMiles: datumPoint.lat === fleet.home_lat ? 300 : 100
      });

      // If geocoding failed (datum === home), use very relaxed criteria to still show some results
      const homeRadiusMiles = (datumPoint.lat === fleetHome.lat && datumPoint.lng === fleetHome.lng) ? 200 : 100;
      const corridorWidthMiles = (datumPoint.lat === fleetHome.lat && datumPoint.lng === fleetHome.lng) ? 300 : 100;

      // Build request context for live load board fetch
      // datum_point is stored as "City, ST" — split to give SOAP API separate city and state
      const [datumCityParsed = '', datumStateParsed = ''] = (request.datum_point || '').split(',').map(s => s.trim());
      // A past available date is treated as "available now" — the load board rejects
      // past pickup dates, and we keep the search + ±1-day filter on the same date.
      const effPickupDate = effectivePickupDate(request.equipment_available_date);
      const requestContext = {
        datumCity:     datumCityParsed,
        datumState:    datumStateParsed,
        datumLat:      datumPoint.lat || 0,
        datumLng:      datumPoint.lng || 0,
        homeCity:      fleet.home_city || '',
        homeState:     fleet.home_state || '',
        homeLat:       fleet.home_lat || 0,
        homeLng:       fleet.home_lng || 0,
        equipmentType: rawProfile?.trailer_type || 'Dry Van',
        modes:         unionModes(rawProfile?.modes, selectedRequest.modes), // #36: fleet + request modes
        pickupDate:    effPickupDate,
        // #117: end of the pickup window — Truckstop searches the whole remaining span
        pickupDateEnd: request.equipment_needed_date || '',
        // #158: optional per-request max load weight; null = no limit
        maxWeight:     request.max_weight_lbs ?? null
      };

      // Parallel: credit deduction + load fetching are independent of each other
      const [creditResult, { loads: loadsForMatching, isLive, source }] = await Promise.all([
        deductCredit('Backhaul search'),
        getLoadsForMatching(user.id, request.fleet_id, requestContext),
      ]);
      if (!creditResult.success) {
        setShowBuyCredits(true);
        return;
      }
      console.log(`Using ${loadsForMatching.length} ${isLive ? 'live ' : ''}loads from: ${source}`);

      logActivityEvent(ACTIVITY_EVENTS.SEARCH_RUN, { kind: 'backhaul', request_id: request.id }); // #85
      const result = await findRouteHomeBackhauls(
        datumPoint,
        fleetHome,
        fleetProfile,
        loadsForMatching,
        homeRadiusMiles,
        corridorWidthMiles,
        rateConfig,
        request.is_relay || false,
        effPickupDate,
        request.equipment_needed_date || null, // #117: window end keeps the client filter in step
        searchHome // #159: substitutes fleet home for routing when set
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
              method: effectiveNotificationMethod(request.notification_method, request.sms_consent), // #140

              email: fleet.email,
              phone: fleet.phone_number,
              requestName: request.request_name,
              fleetName: fleet.name,
              oldTopMatch: change.oldMatch,
              newTopMatch: change.newMatch,
              changeType: change.type,
              requestId: request.id
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

      // Show results immediately — don't block on coordinate geocoding
      setBackhaulMatches(matches);
      setLoadingMatches(false);

      // Background: geocode missing pickup/delivery coords for map view (DF loads have null lat/lng)
      const top10 = matches.slice(0, 10);
      if (top10.some(m => m.pickup_lat == null || m.delivery_lat == null)) {
        const cityMap = new Map();
        top10.forEach(m => {
          if (m.pickup_lat == null && m.pickup_city && m.pickup_state)
            cityMap.set(`${m.pickup_city},${m.pickup_state}`, null);
          if (m.delivery_lat == null && m.delivery_city && m.delivery_state)
            cityMap.set(`${m.delivery_city},${m.delivery_state}`, null);
        });
        Promise.all([...cityMap.keys()].map(async (key) => {
          const [city, state] = key.split(',');
          // #87: geocodeAddress sends the session token (the proxy now requires auth).
          const geo = await geocodeAddress(`${city}, ${state}`);
          if (geo?.lat && geo?.lng) cityMap.set(key, { lat: geo.lat, lng: geo.lng });
        })).then(() => {
          setBackhaulMatches(prev => prev.map(m => {
            const updated = { ...m };
            if (m.pickup_lat == null && m.pickup_city && m.pickup_state) {
              const coords = cityMap.get(`${m.pickup_city},${m.pickup_state}`);
              if (coords) { updated.pickup_lat = coords.lat; updated.pickup_lng = coords.lng; }
            }
            if (m.delivery_lat == null && m.delivery_city && m.delivery_state) {
              const coords = cityMap.get(`${m.delivery_city},${m.delivery_state}`);
              if (coords) { updated.delivery_lat = coords.lat; updated.delivery_lng = coords.lng; }
            }
            return updated;
          }));
        });
      }
    } catch (error) {
      console.error('Error loading matches:', error);
      setBackhaulMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleRunWithImportedLoads = async (request, importedLoads) => {
    // #83: expired request can't be run — no credit deducted.
    if (isRequestExpired(request)) { alert(EXPIRED_HINT); return; }

    setDatImportRequest(null);
    setLoadingMatches(true);
    setSelectedRequest(request);

    try {
      const creditResult = await deductCredit('DAT import search');
      if (!creditResult.success) { setLoadingMatches(false); setShowBuyCredits(true); return; }

      let fleet = await db.fleets.getById(request.fleet_id);
      if (!fleet.home_lat || !fleet.home_lng) {
        const success = await updateFleetCoordinates(db, fleet.id, fleet.home_address);
        if (success) fleet = await db.fleets.getById(request.fleet_id);
        else { setBackhaulMatches([]); setLoadingMatches(false); return; }
      }

      setSelectedFleet(fleet);

      const rawProfile = Array.isArray(fleet.fleet_profiles) ? fleet.fleet_profiles[0] : fleet.fleet_profiles;
      const fleetProfile = rawProfile || { trailerType: 'Dry Van', trailerLength: 53, weightLimit: 45000 };
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

      const geocoded = await geocodeDatum(request.datum_point);
      const datumPoint = geocoded
        ? { address: geocoded.label, lat: geocoded.lat, lng: geocoded.lng }
        : { address: request.datum_point, lat: fleet.home_lat, lng: fleet.home_lng };

      setDatumCoordinates({ lat: datumPoint.lat, lng: datumPoint.lng });

      const fleetHome = { lat: fleet.home_lat, lng: fleet.home_lng, address: fleet.home_address };
      const homeRadiusMiles = 50;
      const corridorWidthMiles = 100;

      logActivityEvent(ACTIVITY_EVENTS.SEARCH_RUN, { kind: 'backhaul', request_id: request.id, source: 'import' }); // #85
      const result = await findRouteHomeBackhauls(
        datumPoint, fleetHome, fleetProfile, importedLoads,
        homeRadiusMiles, corridorWidthMiles, rateConfig, request.is_relay || false
      );

      setRouteData(result.routeData);
      setBackhaulMatches(result.opportunities);
    } catch (error) {
      console.error('DAT import match error:', error);
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
    localStorage.setItem('editingRequestIntent', 'true');
    onMenuNavigate('start-request');
  };

  const handleCancelRequest = async (cancelReason) => {
    try {
      await db.requests.update(selectedRequest.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason,
        // #84: OPERATIONS DECLINED snapshots the displayed top match's revenue
        // figures (zero-copy — the load itself is gone by report time). {} otherwise.
        ...buildDeclineSnapshot(cancelReason, backhaulMatches[0]),
      });
      
      alert('Request cancelled successfully!');
      setSelectedRequest(null);
      loadRequests();
    } catch (error) {
      console.error('Error cancelling request:', error);
      throw error;
    }
  };

  const handleCompleteRequest = async (match, keepSearching = false) => {
    const safeNum = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
    try {
      // Item 008: "keep searching" → interim in_progress state, auto-refresh stays on.
      // Final load → completed + auto_refresh off so no further credits are charged.
      // Option A: only a completed request counts toward the dashboard (single haul).
      await db.requests.update(selectedRequest.id, {
        status: keepSearching ? 'in_progress' : 'completed',
        revenue_amount: safeNum(match.totalRevenue),
        net_revenue: safeNum(match.customer_net_credit ?? match.netRevenue),
        out_of_route_miles: safeNum(match.additionalMiles),
        load_distance_miles: safeNum(match.distance) || null,
        hauled_load_id: match.load_id || null,
        hauled_load_source: match.source || null,
        completed_at: keepSearching ? null : new Date().toISOString(),
        ...(keepSearching ? {} : { auto_refresh: false }),
      });
      setSelectedRequest(null);
      loadRequests();
    } catch (error) {
      console.error('Error completing request:', error?.message || error, error?.details || '');
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
      <header style={{ padding: 'clamp(12px, 3vw, 24px) clamp(16px, 4vw, 32px)', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 1001 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <HaulMonitorLogo size="medium" />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="open-requests" onNavigate={onMenuNavigate} />
            <button
              onClick={() => setShowBuyCredits(true)}
              title="Credits remaining"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px',
                background: balance === 0 ? 'rgba(239,68,68,0.12)' : `${colors.accent.primary}12`,
                border: `1px solid ${balance === 0 ? 'rgba(239,68,68,0.3)' : `${colors.accent.primary}30`}`,
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: '13px', color: balance === 0 ? '#ef4444' : colors.accent.primary }}>⬡</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: balance === 0 ? '#ef4444' : colors.text.primary }}>
                {creditsLoading ? '—' : balance ?? 0}
              </span>
              <span style={{ fontSize: '11px', color: colors.text.secondary }}>credits</span>
            </button>
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: 'clamp(12px, 3vw, 24px) clamp(16px, 4vw, 32px)', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>Open Backhaul Requests</h2>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
                {selectedRequest ? 'Backhaul opportunities for your request' : 'Click a backhaul request to view matching opportunities'}
              </p>
            </div>
            
            {/* Auto-refresh controls - only show when request is selected */}
            {selectedRequest && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 20px',
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '12px',
                minWidth: 0
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
                    minHeight: '44px',
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
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
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

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)' }}>
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
                      <span><strong>A</strong> = Empty</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#10B981', border: '2px solid white' }} />
                      <span><strong>B</strong> = Fleet Home</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#008b00', border: '2px solid white' }} />
                      <span><strong>1-10</strong> = Pickup Locations</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#5EA0DB', border: '2px solid white' }} />
                      <span><strong>1-10</strong> = Delivery Locations</span>
                    </div>
                    {routeData?.corridor && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '20px', height: '12px', background: 'rgba(0, 139, 0, 0.15)', border: '2px dashed #008b00', borderRadius: '2px' }} />
                        <span><strong>Search Corridor</strong> = 100-mile buffer along route</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <BackhaulResults
                request={selectedRequest}
                fleet={selectedFleet}
                matches={backhaulMatches}
                datumCoordinates={datumCoordinates}
                fleetHome={{ lat: selectedFleet.home_lat, lng: selectedFleet.home_lng, address: selectedFleet.home_address }}
                routeData={routeData}
                onBack={() => setSelectedRequest(null)}
                onEdit={handleEditRequest}
                onCancel={handleCancelRequest}
                onComplete={handleCompleteRequest}
                onFinish={handleFinishRequest}
              />
            </>
          )
        ) : (() => {
          const activeRequests = requests.filter(r => r.status === 'active' || r.status === 'paused' || r.status === 'in_progress');
          return activeRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <FileText size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Backhaul Requests Yet</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              Create your first backhaul request to start finding opportunities.
            </p>
            <button onClick={() => onMenuNavigate('start-request')} style={{ padding: '14px 28px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} />
              Start Backhaul Request
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                Your Backhaul Requests ({activeRequests.length})
              </h3>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                Click a backhaul request card to view matching opportunities
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {activeRequests.map((request) => (
                <div key={request.id} onClick={() => handleSelectRequest(request)} style={{ background: colors.background.card, border: `2px solid ${request.status === 'active' ? colors.accent.success + '40' : colors.border.primary}`, borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accent.primary}30`; e.currentTarget.style.borderColor = colors.accent.primary; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = request.status === 'active' ? colors.accent.success + '40' : colors.border.primary; }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                          {request.request_name}
                        </h4>
                        {(() => {
                          // #83: expired (pickup window fully past) overrides the status badge —
                          // distinct from Active, Paused, and Completed. Edit the dates to revive.
                          if (isRequestExpired(request)) {
                            return (
                              <div title={EXPIRED_HINT} style={{ padding: '4px 12px', background: `${colors.accent.danger}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: colors.accent.danger, textTransform: 'uppercase' }}>
                                ◌ Inactive — window passed
                              </div>
                            );
                          }
                          const isActive = request.status === 'active';
                          const isSearching = request.status === 'in_progress';
                          const badgeColor = isActive ? colors.accent.success : isSearching ? colors.accent.warning : colors.text.tertiary;
                          const label = isActive ? '● Active' : isSearching ? '◐ Load picked — searching' : '○ Paused';
                          return (
                            <div style={{ padding: '4px 12px', background: `${badgeColor}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: badgeColor, textTransform: 'uppercase' }}>
                              {label}
                            </div>
                          );
                        })()}
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
                        <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Empty</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>{request.datum_point}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} color={colors.text.tertiary} />
                        <div>
                          <div style={{ fontSize: '11px', color: colors.text.tertiary }}>Begin Pickup</div>
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

                  {/* DAT Import button — hidden until DAT integration is live
                  <button
                    onClick={(e) => { e.stopPropagation(); setDatImportRequest(request); }}
                    style={{
                      marginTop: '14px', width: '100%',
                      padding: '8px', borderRadius: '7px',
                      background: 'transparent',
                      border: `1px solid ${colors.border.secondary}`,
                      color: colors.text.secondary, fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.accent.primary; e.currentTarget.style.color = colors.accent.primary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.secondary; e.currentTarget.style.color = colors.text.secondary; }}
                  >
                    <span style={{ fontSize: '14px' }}>⬆</span> Import from DAT
                  </button>
                  */}

                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${colors.border.secondary}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: colors.text.tertiary }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #fcd34d, #f59e0b)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', display: 'inline-block' }} />
                    1 credit per search
                  </div>
                </div>
              ))}
            </div>
          </>
        );
        })()}
      </div>

      {showBuyCredits && (
        <BuyCreditsModal
          onClose={() => setShowBuyCredits(false)}
          onPurchase={openCheckout}
          insufficientCredits={true}
        />
      )}

      {datImportRequest && (
        <DatImportModal
          request={datImportRequest}
          onClose={() => setDatImportRequest(null)}
          onImport={(loads) => handleRunWithImportedLoads(datImportRequest, loads)}
        />
      )}

      <CoDriver
        context="requests"
        contextData={{ requests }}
      />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
