import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/supabase';
import { FleetSetup } from './FleetSetup';
import { TruckManagement } from './TruckManagement';
import { DriverManagement } from './DriverManagement';
import { Truck, Settings as SettingsIcon, User } from '../icons';

export const FleetDashboard = ({ fleetId, onBackToSearch }) => {
  const { user } = useAuth();
  const [fleet, setFleet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    loadFleet();
  }, [fleetId]); // Reload when fleetId changes

  const loadFleet = async () => {
    setLoading(true);
    try {
      if (fleetId) {
        // Load specific fleet
        const fleetData = await db.fleets.getById(fleetId);
        setFleet(fleetData);
      } else {
        // Creating new fleet - start blank
        setFleet(null);
      }
    } catch (err) {
      console.error('Error loading fleet:', err);
      setFleet(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFleetComplete = async () => {
    await loadFleet();
    setActiveTab('trucks');
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h1 style={{
                margin: '0 0 8px 0',
                fontSize: '32px',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #ff6b35 0%, #00d4ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                Fleet Management
              </h1>
              {fleet && (
                <p style={{ margin: 0, fontSize: '16px', color: '#8b92a7' }}>
                  {fleet.name}
                </p>
              )}
            </div>
            <button
              onClick={onBackToSearch}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ← Back
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              onClick={() => setActiveTab('profile')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'profile' ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'profile' ? '2px solid #ff6b35' : '2px solid transparent',
                color: activeTab === 'profile' ? '#ff6b35' : '#8b92a7',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <SettingsIcon size={16} />
              Fleet Profile
            </button>
            <button
              onClick={() => setActiveTab('trucks')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'trucks' ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'trucks' ? '2px solid #00d4ff' : '2px solid transparent',
                color: activeTab === 'trucks' ? '#00d4ff' : '#8b92a7',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Truck size={16} />
              Trucks {fleet && fleet.trucks && `(${fleet.trucks.length})`}
            </button>
            <button
              onClick={() => setActiveTab('drivers')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'drivers' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'drivers' ? '2px solid #a855f7' : '2px solid transparent',
                color: activeTab === 'drivers' ? '#a855f7' : '#8b92a7',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <User size={16} />
              Drivers
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          background: 'rgba(26, 31, 58, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '32px',
          backdropFilter: 'blur(10px)'
        }}>
          {activeTab === 'profile' && (
            <FleetSetup onComplete={handleFleetComplete} />
          )}
          {activeTab === 'trucks' && fleet && (
            <TruckManagement fleetId={fleet.id} />
          )}
          {activeTab === 'drivers' && fleet && (
            <DriverManagement fleetId={fleet.id} />
          )}
          {(activeTab === 'trucks' || activeTab === 'drivers') && !fleet && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#8b92a7'
            }}>
              <p>Please create your fleet profile first</p>
              <button
                onClick={() => setActiveTab('profile')}
                style={{
                  marginTop: '16px',
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Create Fleet Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
