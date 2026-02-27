import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { MapPin, Truck, DollarSign, Navigation, Settings as SettingsIcon, TrendingUp, Search, Calendar } from './icons';
import { AuthWrapper } from './components/AuthWrapper';
import { ResetPassword } from './components/ResetPassword';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import { FleetDashboard } from './components/FleetDashboard';
import { TruckSelector } from './components/TruckSelector';
import { ActiveRoutes } from './components/ActiveRoutes';
import { HamburgerMenu } from './components/HamburgerMenu';
import { AvatarMenu } from './components/AvatarMenu';
import { Settings } from './components/Settings';
import { RouteComparisonModal } from './components/RouteComparisonModal';
import { Fleets } from './components/Fleets';
import { StartRequest } from './components/StartRequest';
import { OpenRequests } from './components/OpenRequests';
import { FleetReports } from './components/FleetReports';
import { ImportedLoads } from './components/ImportedLoads';
import { HaulMonitorLogo } from './components/HaulMonitorLogo';
import { db } from './lib/supabase';
import backhaulLoadsData from './data/backhaul_loads_data.json';

// Calculate distance between two points (Haversine formula)
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Core matching algorithm - uses real backhaul loads data
const findBackhaulOpportunities = (finalStop, fleetHome, fleetProfile, searchRadius, relayMode) => {
  const opportunities = [];
  
  const directReturnMiles = calculateDistance(
    finalStop.lat, finalStop.lng,
    fleetHome.lat, fleetHome.lng
  );

  // Filter and process real backhaul loads
  const availableLoads = backhaulLoadsData.filter(load => load.status === 'available');

  availableLoads.forEach(load => {
    // Match equipment type
    const loadEquipmentType = load.equipment_type;
    if (loadEquipmentType !== fleetProfile.trailerType) return;
    
    // Check trailer length compatibility
    if (load.trailer_length > fleetProfile.trailerLength) return;
    
    // Check weight compatibility
    if (load.weight_lbs > fleetProfile.weightLimit) return;

    // Calculate distance from final stop to load pickup
    const finalToPickup = calculateDistance(
      finalStop.lat, finalStop.lng,
      load.pickup_lat, load.pickup_lng
    );

    // Skip if pickup is outside search radius
    if (finalToPickup > searchRadius) return;

    // Calculate total revenue (already in the load data)
    const totalRevenue = load.total_revenue;

    // Calculate out-of-route miles
    let oorMiles;
    if (relayMode) {
      // Relay mode: Final → Pickup → Home → Delivery → Home
      const pickupToHome = calculateDistance(
        load.pickup_lat, load.pickup_lng, 
        fleetHome.lat, fleetHome.lng
      );
      const homeToDelivery = calculateDistance(
        fleetHome.lat, fleetHome.lng, 
        load.delivery_lat, load.delivery_lng
      );
      const deliveryToHome = calculateDistance(
        load.delivery_lat, load.delivery_lng, 
        fleetHome.lat, fleetHome.lng
      );
      oorMiles = finalToPickup + pickupToHome + homeToDelivery + deliveryToHome;
    } else {
      // Standard mode: Final → Pickup → Delivery → Home
      const pickupToDelivery = load.distance_miles;
      const deliveryToHome = calculateDistance(
        load.delivery_lat, load.delivery_lng, 
        fleetHome.lat, fleetHome.lng
      );
      oorMiles = finalToPickup + pickupToDelivery + deliveryToHome;
    }

    const additionalMiles = oorMiles - directReturnMiles;
    const revenuePerMile = totalRevenue / oorMiles;
    const score = revenuePerMile * totalRevenue; // Optimize for revenue per mile AND total revenue

    opportunities.push({
      id: load.load_id,
      origin: {
        address: load.pickup_city,
        lat: load.pickup_lat,
        lng: load.pickup_lng
      },
      destination: {
        address: load.delivery_city,
        lat: load.delivery_lat,
        lng: load.delivery_lng
      },
      equipmentType: load.equipment_type,
      trailerLength: load.trailer_length,
      weight: load.weight_lbs,
      pickupDate: load.pickup_date,
      deliveryDate: load.delivery_date,
      distance: load.distance_miles,
      broker: load.broker,
      shipper: load.shipper,
      receiver: load.receiver,
      freightType: load.freight_type,
      totalRevenue,
      oorMiles: Math.round(oorMiles),
      directReturnMiles: Math.round(directReturnMiles),
      additionalMiles: Math.round(additionalMiles),
      revenuePerMile: parseFloat(revenuePerMile.toFixed(2)),
      score,
      finalToPickup: Math.round(finalToPickup)
    });
  });

  // Sort by score (highest first)
  return opportunities.sort((a, b) => b.score - a.score);
};

function App() {
  // Check if we're on the reset-password route
  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const [userType, setUserType] = useState('fleet');
  const [activeTab, setActiveTab] = useState('fleets'); // Default to fleets
  const [currentView, setCurrentView] = useState('fleets'); // 'fleets', 'start-request', 'open-requests', 'fleet-reports', 'fleet-management', 'settings'
  const [relayMode, setRelayMode] = useState(false);
  const [searchRadius, setSearchRadius] = useState(50);
  const [opportunities, setOpportunities] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [fleetProfile, setFleetProfile] = useState(null);
  const [selectedTruckForSearch, setSelectedTruckForSearch] = useState(null);
  const [finalStop, setFinalStop] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedFleetId, setSelectedFleetId] = useState(null); // Track which fleet to edit
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedRouteForModal, setSelectedRouteForModal] = useState(null);
  const [selectedBackhaulForModal, setSelectedBackhaulForModal] = useState(null);

  // Load user's fleet data
  useEffect(() => {
    loadFleetData();
  }, [user, currentView]); // Reload when returning from fleet management

  const loadFleetData = async () => {
    if (!user) return;
    
    setLoadingFleet(true);
    try {
      const fleets = await db.fleets.getAll(user.id);
      if (fleets && fleets.length > 0) {
        const fleet = fleets[0];
        
        // Get first active truck or use defaults
        const trucks = await db.trucks.getByFleet(fleet.id);
        const firstTruck = trucks && trucks.length > 0 ? trucks[0] : null;
        
        setFleetProfile({
          id: fleet.id,
          name: fleet.name,
          fleetHome: { 
            address: fleet.home_address, 
            lat: fleet.home_lat || 35.4993, 
            lng: fleet.home_lng || -80.8481 
          },
          trailerType: firstTruck?.trailer_type || 'Dry Van',
          trailerLength: firstTruck?.trailer_length || 53,
          weightLimit: firstTruck?.weight_limit || 45000,
          mcNumber: fleet.mc_number || 'Not Set',
          trucks: trucks || []
        });
      } else {
        // No fleet created yet, use defaults
        setFleetProfile({
          name: 'Demo Fleet (Create Your Fleet Profile)',
          fleetHome: { address: 'Davidson, NC', lat: 35.4993, lng: -80.8481 },
          trailerType: 'Dry Van',
          trailerLength: 53,
          weightLimit: 45000,
          mcNumber: 'Not Set',
          trucks: []
        });
      }
    } catch (err) {
      console.error('Error loading fleet:', err);
      // Use defaults on error
      setFleetProfile({
        name: 'Demo Fleet',
        fleetHome: { address: 'Davidson, NC', lat: 35.4993, lng: -80.8481 },
        trailerType: 'Dry Van',
        trailerLength: 53,
        weightLimit: 45000,
        mcNumber: 'Not Set',
        trucks: []
      });
    } finally {
      setLoadingFleet(false);
    }
  };

  const handleTruckSelect = ({ truck, finalStop: destination }) => {
    setSelectedTruckForSearch(truck);
    
    // Set final stop with fallback coordinates
    setFinalStop({
      address: destination.address,
      lat: destination.lat || 35.7332, // Default if not provided
      lng: destination.lng || -81.3412  // Default if not provided
    });
    
    // Update fleet profile to use this truck's specs
    setFleetProfile(prev => ({
      ...prev,
      trailerType: truck.trailer_type,
      trailerLength: truck.trailer_length,
      weightLimit: truck.weight_limit
    }));
    
    // Move to search configuration
    setActiveTab('search-config');
  };

  const handleRouteSelectForBackhaul = (route) => {
    setSelectedRoute(route);
    
    // Set final stop to the route's destination
    setFinalStop({
      address: route.dest_city,
      lat: route.dest_lat,
      lng: route.dest_lng
    });
    
    // Find the truck from fleet that matches this route's equipment type
    const matchingTruck = fleetProfile?.trucks?.find(t => 
      (route.equipment_type === 'TV' && t.trailer_type === 'Dry Van') ||
      (route.equipment_type === 'FT' && t.trailer_type === 'Flatbed')
    );
    
    if (matchingTruck) {
      setSelectedTruckForSearch(matchingTruck);
      setFleetProfile(prev => ({
        ...prev,
        trailerType: matchingTruck.trailer_type,
        trailerLength: matchingTruck.trailer_length,
        weightLimit: matchingTruck.weight_limit
      }));
    } else {
      // Use route equipment type directly
      setFleetProfile(prev => ({
        ...prev,
        trailerType: route.equipment_type === 'TV' ? 'Dry Van' : 'Flatbed',
        trailerLength: 53,
        weightLimit: 45000
      }));
    }
    
    // Move to search configuration
    setActiveTab('search-config');
  };

  const handleMenuNavigation = (view) => {
    setCurrentView(view);
    // Reset other state when navigating
    if (view !== 'fleet-management') {
      setActiveTab('fleets');
    }
  };

  const handleNavigateToSettings = () => {
    setCurrentView('settings');
  };

  const handleBackFromSettings = () => {
    setCurrentView('fleets');
    setActiveTab('fleets');
  };

  const handleViewRoute = (opportunity) => {
    // Create route object - handle both TMS routes (from Active Routes) and manual search
    let routeData;
    
    if (selectedRoute) {
      // Coming from Active Routes - use TMS route data
      routeData = {
        truck_number: selectedRoute.truck_number || 'TRUCK-001',
        origin_city: selectedRoute.origin_city || 'Origin',
        origin_lat: selectedRoute.origin_lat || 35.7332,
        origin_lng: selectedRoute.origin_lng || -80.8412,
        dest_city: selectedRoute.dest_city || 'Destination',
        dest_lat: selectedRoute.dest_lat || 35.7332,
        dest_lng: selectedRoute.dest_lng || -80.8412,
        distance: parseFloat(selectedRoute.distance) || 0,
        revenue: parseFloat(selectedRoute.revenue) || 0
      };
    } else if (finalStop) {
      // Coming from manual truck search - use finalStop data
      routeData = {
        truck_number: selectedTruckForSearch?.truck_number || 'TRUCK-001',
        origin_city: fleetProfile?.fleetHome?.address || 'Fleet Home',
        origin_lat: fleetProfile?.fleetHome?.lat || 35.7332,
        origin_lng: fleetProfile?.fleetHome?.lng || -80.8412,
        dest_city: finalStop.address || 'Destination',
        dest_lat: finalStop.lat || 35.7332,
        dest_lng: finalStop.lng || -80.8412,
        distance: 0, // Would need to calculate
        revenue: 0
      };
    } else {
      // Fallback defaults
      routeData = {
        truck_number: 'TRUCK-001',
        origin_city: 'Origin',
        origin_lat: 35.7332,
        origin_lng: -80.8412,
        dest_city: 'Destination',
        dest_lat: 35.7332,
        dest_lng: -80.8412,
        distance: 0,
        revenue: 0
      };
    }

    const backhaulData = {
      pickup_city: opportunity.origin?.address || opportunity.origin || 'Pickup',
      pickup_lat: opportunity.origin?.lat || 35.7332,
      pickup_lng: opportunity.origin?.lng || -80.8412,
      delivery_city: opportunity.destination?.address || opportunity.destination || 'Delivery',
      delivery_lat: opportunity.destination?.lat || 35.7332,
      delivery_lng: opportunity.destination?.lng || -80.8412,
      distance: parseFloat(opportunity.distance) || 0,
      revenue: parseFloat(opportunity.totalRevenue) || 0,
      outOfRouteMiles: parseFloat(opportunity.additionalMiles) || 0
    };

    setSelectedRouteForModal(routeData);
    setSelectedBackhaulForModal(backhaulData);
    setShowRouteModal(true);
  };

  const handleAssignRoute = (backhaul) => {
    // TODO: Implement route assignment to driver
    alert(`Route assigned! This will integrate with driver dashboard in the future.`);
    setShowRouteModal(false);
  };

  const handleSearch = () => {
    if (!fleetProfile) return;
    
    const results = findBackhaulOpportunities(
      finalStop,
      fleetProfile.fleetHome,
      fleetProfile,
      searchRadius,
      relayMode
    );
    setOpportunities(results);
    setActiveTab('results');
  };

  // Show loading state only on initial load — subsequent refreshes happen silently in the background
  // so navigating tabs or token refreshes don't interrupt the user's current view
  if (loadingFleet && !fleetProfile) {
    return (
      <AuthWrapper>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.background.primary,
          color: colors.text.primary,
          fontSize: '18px',
          fontWeight: 600
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              border: `4px solid ${colors.accent.primary}40`, 
              borderTop: `4px solid ${colors.accent.primary}`, 
              borderRadius: '50%', 
              animation: 'spin 1s linear infinite', 
              margin: '0 auto 16px' 
            }} />
            <div>Loading your fleet data...</div>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  const styles = {
    container: {
      minHeight: '100vh',
      background: colors.background.primary,
      color: colors.text.primary,
      position: 'relative',
      overflow: 'hidden'
    },
    backgroundBlobs: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      opacity: 0.03
    },
    blob1: {
      position: 'absolute',
      top: '10%',
      left: '5%',
      width: '500px',
      height: '500px',
      background: `radial-gradient(circle, ${colors.accent.orange} 0%, transparent 70%)`,
      borderRadius: '50%',
      filter: 'blur(80px)',
      animation: 'float 20s ease-in-out infinite'
    },
    blob2: {
      position: 'absolute',
      bottom: '10%',
      right: '5%',
      width: '600px',
      height: '600px',
      background: `radial-gradient(circle, ${colors.accent.cyan} 0%, transparent 70%)`,
      borderRadius: '50%',
      filter: 'blur(100px)',
      animation: 'float 25s ease-in-out infinite reverse'
    }
  };

  return (
    <AuthWrapper>
      {currentView === 'settings' ? (
        <Settings onBack={handleBackFromSettings} />
      ) : currentView === 'fleets' ? (
        <Fleets 
          user={user}
          onSelectFleet={(fleet) => {
            // Edit existing fleet
            setSelectedFleetId(fleet.id);
            setCurrentView('fleet-management');
          }}
          onCreateFleet={() => {
            // Create new fleet
            setSelectedFleetId(null);
            setCurrentView('fleet-management');
          }}
          onMenuNavigate={handleMenuNavigation}
          onNavigateToSettings={handleNavigateToSettings}
        />
      ) : currentView === 'start-request' ? (
        <StartRequest 
          onMenuNavigate={handleMenuNavigation}
          onNavigateToSettings={handleNavigateToSettings}
        />
      ) : currentView === 'open-requests' ? (
        <OpenRequests 
          onMenuNavigate={handleMenuNavigation}
          onNavigateToSettings={handleNavigateToSettings}
        />
      ) : currentView === 'fleet-reports' ? (
        <FleetReports
          onMenuNavigate={handleMenuNavigation}
          onNavigateToSettings={handleNavigateToSettings}
        />
      ) : currentView === 'imported-loads' ? (
        <ImportedLoads
          onMenuNavigate={handleMenuNavigation}
        />
      ) : currentView === 'fleet-management' ? (
        <FleetDashboard 
          fleetId={selectedFleetId}
          onBackToSearch={() => setCurrentView('fleets')} 
        />
      ) : (
    <div style={styles.container}>
      <div style={styles.backgroundBlobs}>
        <div style={styles.blob1} />
        <div style={styles.blob2} />
      </div>

      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <HaulMonitorLogo size="medium" />
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu 
              currentView={currentView}
              onNavigate={handleMenuNavigation}
            />
            <AvatarMenu onNavigateToSettings={handleNavigateToSettings} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 32px' }}>
        
        {/* Fleet Info Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(0, 139, 0, 0.1) 0%, rgba(0, 212, 255, 0.1) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backdropFilter: 'blur(10px)',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 800 }}>
              {fleetProfile.name}
              {!fleetProfile.id && (
                <span style={{
                  marginLeft: '12px',
                  fontSize: '12px',
                  padding: '4px 12px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '6px',
                  color: '#fbbf24',
                  fontWeight: 600
                }}>
                  DEMO DATA
                </span>
              )}
            </h2>
            <p style={{ margin: 0, color: '#8b92a7', fontSize: '15px' }}>
              <MapPin size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Fleet Home: {fleetProfile.fleetHome.address}
            </p>
            {fleetProfile.trucks && fleetProfile.trucks.length > 0 && (
              <p style={{ margin: '4px 0 0 0', color: '#8b92a7', fontSize: '13px' }}>
                {fleetProfile.trucks.length} truck{fleetProfile.trucks.length !== 1 ? 's' : ''} in fleet
              </p>
            )}
            {selectedTruckForSearch && (
              <p style={{
                margin: '8px 0 0 0',
                padding: '6px 12px',
                background: 'rgba(0, 212, 255, 0.15)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: '6px',
                display: 'inline-block',
                fontSize: '13px',
                color: '#00d4ff',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                Selected: {selectedTruckForSearch.truck_number} ({selectedTruckForSearch.trailer_type}, {selectedTruckForSearch.trailer_length}ft)
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {finalStop ? (
              <>
                <div style={{ fontSize: '14px', color: '#8b92a7', marginBottom: '4px' }}>
                  {selectedTruckForSearch ? `${selectedTruckForSearch.truck_number} Destination` : 'Current Destination'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#00d4ff' }}>{finalStop.address}</div>
              </>
            ) : (
              <div style={{ fontSize: '14px', color: '#8b92a7' }}>
                Select a truck to begin
              </div>
            )}
            {!fleetProfile.id && (
              <button
                onClick={() => setCurrentView('fleet-management')}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Create Fleet Profile →
              </button>
            )}
          </div>
        </div>

        {/* Active Routes View */}
        {activeTab === 'routes' && (
          <ActiveRoutes onSelectRouteForBackhaul={handleRouteSelectForBackhaul} />
        )}

        {/* Search Configuration */}
        {activeTab === 'search' && fleetProfile && (
          <TruckSelector
            fleetId={fleetProfile.id}
            onSelectTruck={handleTruckSelect}
          />
        )}

        {activeTab === 'search' && !fleetProfile?.id && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'rgba(26, 31, 58, 0.6)',
            borderRadius: '16px',
            border: '1px dashed rgba(255, 255, 255, 0.2)'
          }}>
            <Truck size={48} color="#6b7280" style={{ marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#e8eaed' }}>
              Create Your Fleet First
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#8b92a7', fontSize: '15px' }}>
              Set up your fleet profile and add trucks before searching for backhaul opportunities
            </p>
            <button
              onClick={() => setCurrentView('fleet-management')}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Go to Fleet Management
            </button>
          </div>
        )}

        {activeTab === 'search-config' && selectedTruckForSearch && finalStop && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            
            {/* Search Parameters */}
            <div style={{
              background: 'rgba(26, 31, 58, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Search size={24} color={colors.accent.orange} />
                  Search Parameters
                </h3>
                <button
                  onClick={() => {
                    setActiveTab('search');
                    setSelectedTruckForSearch(null);
                    setFinalStop(null);
                    setOpportunities([]);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#8b92a7',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ← Change Truck
                </button>
              </div>
              
              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontSize: '15px', fontWeight: 600, color: '#b8bcc8' }}>
                  Search Radius: {searchRadius} miles
                </label>
                <input
                  type="range"
                  min="25"
                  max="150"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(Number(e.target.value))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                  <span>25 mi</span>
                  <span>150 mi</span>
                </div>
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'rgba(0, 212, 255, 0.05)',
                  borderRadius: '12px',
                  border: '1px solid rgba(0, 212, 255, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}>
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>Relay Mode</span>
                  <div
                    onClick={() => setRelayMode(!relayMode)}
                    style={{
                      width: '52px',
                      height: '28px',
                      background: relayMode ? 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)' : 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '14px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      left: relayMode ? '26px' : '4px',
                      width: '20px',
                      height: '20px',
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                    }} />
                  </div>
                </label>
                <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px', lineHeight: '1.5' }}>
                  {relayMode 
                    ? 'Route includes return to fleet home between pickup and delivery'
                    : 'Direct route from pickup to delivery to fleet home'
                  }
                </p>
              </div>

              <button
                className="search-button"
                onClick={handleSearch}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: 'linear-gradient(135deg, #008b00 0%, #00a300 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  position: 'relative'
                }}
              >
                FIND BACKHAUL OPPORTUNITIES
              </button>
            </div>

            {/* Equipment Profile */}
            <div style={{
              background: 'rgba(26, 31, 58, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px',
              backdropFilter: 'blur(10px)'
            }}>
              <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Truck size={24} color="#00d4ff" />
                Selected Truck
              </h3>
              
              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ color: '#8b92a7', fontSize: '14px' }}>Truck Number</span>
                  <span style={{ fontWeight: 700, fontSize: '15px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {selectedTruckForSearch.truck_number}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ color: '#8b92a7', fontSize: '14px' }}>Trailer Type</span>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{selectedTruckForSearch.trailer_type}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ color: '#8b92a7', fontSize: '14px' }}>Trailer Length</span>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{selectedTruckForSearch.trailer_length} ft</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ color: '#8b92a7', fontSize: '14px' }}>Weight Limit</span>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{selectedTruckForSearch.weight_limit.toLocaleString()} lbs</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                  <span style={{ color: '#8b92a7', fontSize: '14px' }}>Status</span>
                  <span style={{ 
                    fontWeight: 700, 
                    fontSize: '15px',
                    color: selectedTruckForSearch.status === 'active' ? '#10b981' : '#8b92a7'
                  }}>
                    {selectedTruckForSearch.status}
                  </span>
                </div>
              </div>

              <div style={{
                marginTop: '24px',
                padding: '16px',
                background: 'rgba(0, 139, 0, 0.1)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 139, 0, 0.2)'
              }}>
                <div style={{ fontSize: '13px', color: '#008b00', fontWeight: 700, marginBottom: '4px' }}>
                  ⚡ PRIORITY ACCESS
                </div>
                <div style={{ fontSize: '13px', color: '#b8bcc8', lineHeight: '1.5' }}>
                  Connected to DAT Load Board
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {activeTab === 'results' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 900 }}>
                  Found {opportunities.length} Backhaul Opportunities
                </h3>
                <p style={{ margin: 0, color: '#8b92a7', fontSize: '15px' }}>
                  Ranked by revenue efficiency • Higher scores indicate better opportunities
                </p>
              </div>
              <button
                onClick={() => setActiveTab('search')}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px'
                }}
              >
                ← New Search
              </button>
            </div>

            {/* Summary Stats */}
            {opportunities.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                {[
                  { label: 'Avg Revenue', value: `$${Math.round(opportunities.reduce((sum, o) => sum + o.totalRevenue, 0) / opportunities.length)}`, icon: DollarSign, color: '#00d4ff' },
                  { label: 'Best Score', value: Math.round(opportunities[0]?.score || 0).toLocaleString(), icon: TrendingUp, color: '#008b00' },
                  { label: 'Avg OOR Miles', value: Math.round(opportunities.reduce((sum, o) => sum + o.additionalMiles, 0) / opportunities.length), icon: Navigation, color: '#a855f7' },
                  { label: 'Opportunities', value: opportunities.length, icon: Calendar, color: '#10b981' }
                ].map((stat, idx) => {
                  const IconComponent = stat.icon;
                  return (
                    <div key={idx} className="stat-card" style={{
                      background: `linear-gradient(135deg, ${stat.color}15 0%, ${stat.color}05 100%)`,
                      border: `1px solid ${stat.color}30`,
                      borderRadius: '12px',
                      padding: '20px',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <IconComponent size={24} color={stat.color} style={{ marginBottom: '8px' }} />
                      <div style={{ fontSize: '28px', fontWeight: 900, marginBottom: '4px', color: stat.color }}>
                        {stat.value}
                      </div>
                      <div style={{ fontSize: '13px', color: '#8b92a7', fontWeight: 600 }}>
                        {stat.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Opportunity Cards */}
            <div style={{ display: 'grid', gap: '16px' }}>
              {opportunities.map((opp, index) => (
                <div
                  key={opp.id}
                  className="opportunity-card"
                  style={{
                    '--index': index,
                    background: 'rgba(26, 31, 58, 0.6)',
                    border: selectedOpportunity?.id === opp.id ? '2px solid #00d4ff' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => setSelectedOpportunity(opp)}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '24px', alignItems: 'center' }}>
                    
                    {/* Route Info */}
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ 
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: 'linear-gradient(135deg, #008b00 0%, #00a300 100%)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 800,
                        marginBottom: '12px',
                        fontFamily: "'JetBrains Mono', monospace"
                      }}>
                        #{index + 1} • {opp.id}
                      </div>
                      <div style={{ fontSize: '14px', color: '#8b92a7', marginBottom: '6px' }}>
                        <MapPin size={14} style={{ display: 'inline', marginRight: '6px' }} />
                        {opp.origin.address}
                      </div>
                      <div style={{ fontSize: '14px', color: '#00d4ff', fontWeight: 600 }}>
                        → {opp.destination.address}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                        {opp.distance} mi • {opp.weight.toLocaleString()} lbs
                      </div>
                    </div>

                    {/* Revenue */}
                    <div>
                      <div style={{ fontSize: '13px', color: '#8b92a7', marginBottom: '4px' }}>Total Revenue</div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#00d4ff' }}>
                        ${opp.totalRevenue.toFixed(0)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        ${opp.revenuePerMile.toFixed(2)}/mi
                      </div>
                    </div>

                    {/* OOR Miles */}
                    <div>
                      <div style={{ fontSize: '13px', color: '#8b92a7', marginBottom: '4px' }}>Additional Miles</div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: opp.additionalMiles < 50 ? '#10b981' : '#008b00' }}>
                        +{Math.round(opp.additionalMiles)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        vs direct return
                      </div>
                    </div>

                    {/* Score */}
                    <div>
                      <div style={{ fontSize: '13px', color: '#8b92a7', marginBottom: '4px' }}>Efficiency Score</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#008b00' }}>
                        {Math.round(opp.score).toLocaleString()}
                      </div>
                    </div>

                    {/* Action */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        style={{
                          padding: '12px 24px',
                          background: `linear-gradient(135deg, ${colors.accent.green} 0%, #059669 100%)`,
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.03em',
                          width: '100%'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewRoute(opp);
                        }}
                      >
                        🗺️ VIEW ROUTE
                      </button>
                      <button
                        style={{
                          padding: '12px 24px',
                          background: `linear-gradient(135deg, ${colors.accent.cyan} 0%, #00a8cc 100%)`,
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.03em',
                          width: '100%'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Opening DAT load board for ${opp.id}...`);
                        }}
                      >
                        VIEW ON DAT →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {opportunities.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'rgba(26, 31, 58, 0.6)',
                borderRadius: '16px',
                border: '1px dashed rgba(255, 255, 255, 0.2)'
              }}>
                <Navigation size={48} color="#6b7280" style={{ marginBottom: '16px' }} />
                <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800 }}>
                  No Opportunities Found
                </h3>
                <p style={{ margin: 0, color: '#8b92a7', fontSize: '15px' }}>
                  Try increasing your search radius or adjusting your equipment profile
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
      )}
      
      {/* Route Comparison Modal */}
      {showRouteModal && (
        <RouteComparisonModal
          route={selectedRouteForModal}
          backhaul={selectedBackhaulForModal}
          onClose={() => setShowRouteModal(false)}
          onAssign={handleAssignRoute}
        />
      )}
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      
      <Analytics />
    </AuthWrapper>
  );
}

export default App;
