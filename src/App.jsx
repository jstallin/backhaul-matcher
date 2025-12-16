import { useState, useEffect } from 'react';
import { MapPin, Truck, DollarSign, Navigation, Settings, TrendingUp, Calendar, Search } from './icons';
import { AuthWrapper } from './components/AuthWrapper';
import { useAuth } from './contexts/AuthContext';
import { FleetDashboard } from './components/FleetDashboard';
import { TruckSelector } from './components/TruckSelector';
import { db } from './lib/supabase';

// Simulated DAT API - In production, this would connect to actual DAT API
const mockDATLoads = [
  {
    id: 'DAT001',
    origin: { address: '1234 Industrial Blvd, Charlotte, NC', lat: 35.2271, lng: -80.8431 },
    destination: { address: '5678 Commerce St, Greensboro, NC', lat: 36.0726, lng: -79.7920 },
    equipmentType: 'Dry Van',
    trailerLength: 53,
    weight: 42000,
    rateType: 'per_mile',
    rate: 2.85,
    fuelSurcharge: 0.45,
    pickupDate: '2024-12-16',
    distance: 92
  },
  {
    id: 'DAT002',
    origin: { address: '890 Warehouse Way, Winston-Salem, NC', lat: 36.0999, lng: -80.2442 },
    destination: { address: '321 Distribution Dr, Raleigh, NC', lat: 35.7796, lng: -78.6382 },
    equipmentType: 'Dry Van',
    trailerLength: 53,
    weight: 38000,
    rateType: 'flat',
    rate: 450,
    fuelSurcharge: 75,
    pickupDate: '2024-12-16',
    distance: 110
  },
  {
    id: 'DAT003',
    origin: { address: '456 Logistics Ln, Durham, NC', lat: 35.9940, lng: -78.8986 },
    destination: { address: '789 Supply Chain Ave, Fayetteville, NC', lat: 35.0527, lng: -78.8784 },
    equipmentType: 'Dry Van',
    trailerLength: 53,
    weight: 45000,
    rateType: 'per_mile',
    rate: 2.65,
    fuelSurcharge: 0.40,
    pickupDate: '2024-12-17',
    distance: 65
  },
  {
    id: 'DAT004',
    origin: { address: '234 Transport Rd, Gastonia, NC', lat: 35.2621, lng: -81.1873 },
    destination: { address: '567 Freight St, Columbia, SC', lat: 34.0007, lng: -81.0348 },
    equipmentType: 'Dry Van',
    trailerLength: 53,
    weight: 40000,
    rateType: 'per_mile',
    rate: 3.10,
    fuelSurcharge: 0.50,
    pickupDate: '2024-12-16',
    distance: 88
  },
  {
    id: 'DAT005',
    origin: { address: '678 Cargo Ct, Asheville, NC', lat: 35.5951, lng: -82.5515 },
    destination: { address: '910 Logistics Loop, Charleston, SC', lat: 32.7765, lng: -79.9311 },
    equipmentType: 'Dry Van',
    trailerLength: 53,
    weight: 41000,
    rateType: 'per_mile',
    rate: 2.95,
    fuelSurcharge: 0.42,
    pickupDate: '2024-12-17',
    distance: 145
  }
];

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

// Core matching algorithm
const findBackhaulOpportunities = (finalStop, fleetHome, fleetProfile, searchRadius, relayMode) => {
  const opportunities = [];
  
  const directReturnMiles = calculateDistance(
    finalStop.lat, finalStop.lng,
    fleetHome.lat, fleetHome.lng
  );

  mockDATLoads.forEach(load => {
    if (load.equipmentType !== fleetProfile.trailerType) return;
    if (load.trailerLength > fleetProfile.trailerLength) return;
    if (load.weight > fleetProfile.weightLimit) return;

    const finalToPickup = calculateDistance(
      finalStop.lat, finalStop.lng,
      load.origin.lat, load.origin.lng
    );

    if (finalToPickup > searchRadius) return;

    let totalRevenue = 0;
    if (load.rateType === 'per_mile') {
      totalRevenue = (load.rate * load.distance) + (load.fuelSurcharge * load.distance);
    } else if (load.rateType === 'flat') {
      totalRevenue = load.rate + load.fuelSurcharge;
    }

    let oorMiles;
    if (relayMode) {
      const pickupToHome = calculateDistance(load.origin.lat, load.origin.lng, fleetHome.lat, fleetHome.lng);
      const homeToDelivery = calculateDistance(fleetHome.lat, fleetHome.lng, load.destination.lat, load.destination.lng);
      const deliveryToHome = calculateDistance(load.destination.lat, load.destination.lng, fleetHome.lat, fleetHome.lng);
      oorMiles = finalToPickup + pickupToHome + homeToDelivery + deliveryToHome;
    } else {
      const pickupToDelivery = load.distance;
      const deliveryToHome = calculateDistance(load.destination.lat, load.destination.lng, fleetHome.lat, fleetHome.lng);
      oorMiles = finalToPickup + pickupToDelivery + deliveryToHome;
    }

    const additionalMiles = oorMiles - directReturnMiles;
    const revenuePerMile = totalRevenue / oorMiles;
    const score = revenuePerMile * totalRevenue;

    opportunities.push({
      ...load,
      totalRevenue,
      oorMiles,
      directReturnMiles,
      additionalMiles,
      revenuePerMile,
      score,
      finalToPickup
    });
  });

  return opportunities.sort((a, b) => b.score - a.score);
};

function App() {
  const { user, signOut } = useAuth();
  const [userType, setUserType] = useState('fleet');
  const [activeTab, setActiveTab] = useState('search');
  const [currentView, setCurrentView] = useState('search'); // 'search' or 'fleet-management'
  const [relayMode, setRelayMode] = useState(false);
  const [searchRadius, setSearchRadius] = useState(50);
  const [opportunities, setOpportunities] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [fleetProfile, setFleetProfile] = useState(null);
  const [selectedTruckForSearch, setSelectedTruckForSearch] = useState(null);
  const [finalStop, setFinalStop] = useState(null);

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

  // Show loading state while fleet data loads
  if (loadingFleet) {
    return (
      <AuthWrapper>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
          color: '#e8eaed',
          fontSize: '18px',
          fontWeight: 600
        }}>
          Loading your fleet data...
        </div>
      </AuthWrapper>
    );
  }

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
      color: '#e8eaed',
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
      background: 'radial-gradient(circle, #ff6b35 0%, transparent 70%)',
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
      background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)',
      borderRadius: '50%',
      filter: 'blur(100px)',
      animation: 'float 25s ease-in-out infinite reverse'
    }
  };

  return (
    <AuthWrapper>
      {currentView === 'fleet-management' ? (
        <FleetDashboard onBackToSearch={() => setCurrentView('search')} />
      ) : (
    <div style={styles.container}>
      <div style={styles.backgroundBlobs}>
        <div style={styles.blob1} />
        <div style={styles.blob2} />
      </div>

      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(10, 14, 39, 0.8)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color="#ff6b35" strokeWidth={2.5} />
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: '28px', 
                fontWeight: 900,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #ff6b35 0%, #00d4ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                BACKHAUL
              </h1>
              <p style={{ margin: 0, fontSize: '13px', color: '#8b92a7', fontWeight: 500, letterSpacing: '0.05em' }}>
                SMART RETURN ROUTE OPTIMIZATION
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentView('fleet-management')}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                border: 'none',
                color: '#fff',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.3s ease'
              }}
            >
              Manage Fleet
            </button>
            <button
              onClick={() => setUserType('fleet')}
              style={{
                padding: '10px 20px',
                background: userType === 'fleet' ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)' : 'transparent',
                border: userType === 'fleet' ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.3s ease'
              }}
            >
              Fleet Manager
            </button>
            <button
              onClick={() => setUserType('driver')}
              style={{
                padding: '10px 20px',
                background: userType === 'driver' ? 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)' : 'transparent',
                border: userType === 'driver' ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.3s ease'
              }}
            >
              Driver
            </button>
            <button
              onClick={async () => {
                if (window.confirm('Sign out?')) {
                  await signOut();
                }
              }}
              title="Sign Out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                marginLeft: '12px',
                display: 'flex',
                alignItems: 'center',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <Settings size={24} color="#8b92a7" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 32px' }}>
        
        {/* Fleet Info Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, rgba(0, 212, 255, 0.1) 100%)',
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
                  <Search size={24} color="#ff6b35" />
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
                  background: 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
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
                background: 'rgba(255, 107, 53, 0.1)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 107, 53, 0.2)'
              }}>
                <div style={{ fontSize: '13px', color: '#ff6b35', fontWeight: 700, marginBottom: '4px' }}>
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
                  { label: 'Best Score', value: Math.round(opportunities[0]?.score || 0).toLocaleString(), icon: TrendingUp, color: '#ff6b35' },
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
                        background: 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
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
                      <div style={{ fontSize: '24px', fontWeight: 900, color: opp.additionalMiles < 50 ? '#10b981' : '#ff6b35' }}>
                        +{Math.round(opp.additionalMiles)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        vs direct return
                      </div>
                    </div>

                    {/* Score */}
                    <div>
                      <div style={{ fontSize: '13px', color: '#8b92a7', marginBottom: '4px' }}>Efficiency Score</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#ff6b35' }}>
                        {Math.round(opp.score).toLocaleString()}
                      </div>
                    </div>

                    {/* Action */}
                    <div>
                      <button
                        style={{
                          padding: '12px 24px',
                          background: 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)',
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
    </AuthWrapper>
  );
}

export default App;
