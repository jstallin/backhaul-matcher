import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Truck, MapPin, DollarSign, TrendingUp, Package } from '../icons';

export const DriverDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState(null);
  const [assignedTruck, setAssignedTruck] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [backhaulOpportunities, setBackhaulOpportunities] = useState([]);

  useEffect(() => {
    loadDriverData();
  }, [user]);

  const loadDriverData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Check user role
      const role = user.user_metadata?.role || 'fleet_manager';
      
      if (role !== 'driver') {
        setLoading(false);
        return;
      }

      // Find driver record by user_id using raw SQL-like query
      // We need to search drivers table for this user
      const { data: allDrivers, error: driversError } = await supabase
        .from('drivers')
        .select(`
          *,
          trucks (
            id,
            truck_number,
            trailer_type,
            trailer_length,
            weight_limit,
            status
          ),
          fleets (
            id,
            name,
            home_address
          )
        `)
        .eq('user_id', user.id)
        .single();

      if (driversError) {
        console.error('Error loading driver:', driversError);
        setLoading(false);
        return;
      }

      if (!allDrivers) {
        setLoading(false);
        return;
      }

      // Set driver info
      setDriverInfo({
        name: `${allDrivers.first_name} ${allDrivers.last_name}`,
        email: allDrivers.email,
        id: allDrivers.id
      });

      // Set assigned truck
      if (allDrivers.trucks) {
        setAssignedTruck(allDrivers.trucks);
      }

      // Set fleet info
      if (allDrivers.fleets) {
        setFleet(allDrivers.fleets);
      }

      // Mock current route for now
      setCurrentRoute({
        origin: 'Charlotte, NC',
        destination: 'Greensboro, NC',
        completed: false
      });

      // Mock backhaul opportunities
      setBackhaulOpportunities([
        {
          id: 1,
          pickup: 'Greensboro, NC',
          delivery: 'Winston-Salem, NC',
          revenue: 850,
          miles: 35,
          revenuePerMile: 24.29,
          selected: false
        },
        {
          id: 2,
          pickup: 'Greensboro, NC',
          delivery: 'Durham, NC',
          revenue: 1200,
          miles: 48,
          revenuePerMile: 25.00,
          selected: true
        }
      ]);

    } catch (err) {
      console.error('Error loading driver data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
        color: '#e8eaed'
      }}>
        Loading...
      </div>
    );
  }

  if (!driverInfo) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
        padding: '20px'
      }}>
        <div style={{
          textAlign: 'center',
          background: 'rgba(26, 31, 58, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '500px'
        }}>
          <h2 style={{ margin: '0 0 16px 0', color: '#e8eaed' }}>Driver Account Not Set Up</h2>
          <p style={{ margin: 0, color: '#8b92a7' }}>
            Your fleet manager needs to create your driver profile and assign you a truck.
            Please contact your fleet manager.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'rgba(26, 31, 58, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: '32px',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #ff6b35 0%, #00d4ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Driver Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: '16px', color: '#8b92a7' }}>
            Welcome, {driverInfo.name}
          </p>
        </div>

        {/* Current Assignment */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          {/* Assigned Truck */}
          {assignedTruck && (
            <div style={{
              background: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: 800,
                color: '#00d4ff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Truck size={20} />
                Your Truck
              </h3>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#e8eaed', marginBottom: '12px', fontFamily: "'JetBrains Mono', monospace" }}>
                {assignedTruck.truck_number}
              </div>
              <div style={{ color: '#8b92a7', fontSize: '14px' }}>
                <div>{assignedTruck.trailer_type} • {assignedTruck.trailer_length}ft</div>
                <div>Weight Limit: {assignedTruck.weight_limit.toLocaleString()} lbs</div>
              </div>
            </div>
          )}

          {/* Current Route */}
          {currentRoute && (
            <div style={{
              background: 'rgba(255, 107, 53, 0.1)',
              border: '1px solid rgba(255, 107, 53, 0.3)',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: 800,
                color: '#ff6b35',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <MapPin size={20} />
                Current Route
              </h3>
              <div style={{ color: '#e8eaed', fontSize: '15px', marginBottom: '8px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Origin:</strong> {currentRoute.origin}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Destination:</strong> {currentRoute.destination}
                </div>
                <div style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  background: currentRoute.completed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: currentRoute.completed ? '#6ee7b7' : '#fbbf24'
                }}>
                  {currentRoute.completed ? '✓ Completed' : '→ In Progress'}
                </div>
              </div>
            </div>
          )}

          {/* Fleet Home */}
          {fleet && (
            <div style={{
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: 800,
                color: '#a855f7',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Package size={20} />
                Fleet Home
              </h3>
              <div style={{ color: '#e8eaed', fontSize: '15px' }}>
                <div style={{ marginBottom: '8px', fontWeight: 700 }}>{fleet.name}</div>
                <div style={{ color: '#8b92a7' }}>{fleet.home_address}</div>
              </div>
            </div>
          )}
        </div>

        {/* Backhaul Opportunities */}
        <div style={{
          background: 'rgba(26, 31, 58, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '32px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{
            margin: '0 0 24px 0',
            fontSize: '24px',
            fontWeight: 900,
            color: '#e8eaed'
          }}>
            Backhaul Opportunities for You
          </h3>

          {backhaulOpportunities.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#8b92a7'
            }}>
              <Package size={48} color="#6b7280" style={{ marginBottom: '16px' }} />
              <p>No backhaul opportunities yet. Check back after completing your current delivery.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {backhaulOpportunities.map(opp => (
                <div
                  key={opp.id}
                  style={{
                    background: opp.selected 
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)'
                      : 'rgba(26, 31, 58, 0.4)',
                    border: opp.selected ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '20px',
                    position: 'relative'
                  }}
                >
                  {opp.selected && (
                    <div style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      padding: '6px 12px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#6ee7b7'
                    }}>
                      ★ RECOMMENDED FOR YOU
                    </div>
                  )}
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#e8eaed', marginBottom: '12px' }}>
                        {opp.pickup} → {opp.delivery}
                      </div>
                      <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#8b92a7' }}>
                        <span><strong>Distance:</strong> {opp.miles} miles</span>
                        <span><strong>Revenue/Mile:</strong> ${opp.revenuePerMile.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#10b981', marginBottom: '8px' }}>
                        ${opp.revenue}
                      </div>
                      {opp.selected ? (
                        <div style={{
                          padding: '8px 16px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#6ee7b7'
                        }}>
                          Assigned by Manager
                        </div>
                      ) : (
                        <div style={{
                          padding: '8px 16px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#8b92a7'
                        }}>
                          Alternative Option
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
