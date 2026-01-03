import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../lib/supabase';
import { FleetSetup } from './FleetSetup';
import { TruckManagement } from './TruckManagement';
import { DriverManagement } from './DriverManagement';
import { Truck, Settings as SettingsIcon, User, ArrowLeft } from '../icons';

export const FleetDashboard = ({ fleetId, onBackToSearch }) => {
  const { user } = useAuth();
  const { colors } = useTheme();
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
        background: colors.background.primary,
        color: colors.text.primary
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
          <div>Loading...</div>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.background.primary,
      padding: '32px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          marginBottom: '32px',
          borderBottom: `1px solid ${colors.border.secondary}`,
          paddingBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{
                margin: '0 0 4px 0',
                fontSize: '28px',
                fontWeight: 900,
                background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.primary} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                BACKHAUL
              </h1>
              {fleet && (
                <p style={{ margin: 0, fontSize: '14px', color: colors.text.secondary }}>
                  {fleet.name}
                </p>
              )}
            </div>
            <button
              onClick={onBackToSearch}
              style={{
                padding: '10px 20px',
                background: colors.background.secondary,
                border: `1px solid ${colors.border.accent}`,
                borderRadius: '8px',
                color: colors.text.primary,
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.accent.primary;
                e.currentTarget.style.color = colors.accent.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.border.accent;
                e.currentTarget.style.color = colors.text.primary;
              }}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
            <button
              onClick={() => setActiveTab('profile')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'profile' ? `${colors.accent.primary}20` : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'profile' ? `2px solid ${colors.accent.primary}` : '2px solid transparent',
                color: activeTab === 'profile' ? colors.accent.primary : colors.text.secondary,
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
                background: activeTab === 'trucks' ? `${colors.accent.primary}20` : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'trucks' ? `2px solid ${colors.accent.primary}` : '2px solid transparent',
                color: activeTab === 'trucks' ? colors.accent.primary : colors.text.secondary,
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
                background: activeTab === 'drivers' ? `${colors.accent.primary}20` : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'drivers' ? `2px solid ${colors.accent.primary}` : '2px solid transparent',
                color: activeTab === 'drivers' ? colors.accent.primary : colors.text.secondary,
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
          background: colors.background.card,
          border: `1px solid ${colors.border.primary}`,
          borderRadius: '16px',
          padding: '32px'
        }}>
          {activeTab === 'profile' && (
            <FleetSetup fleet={fleet} onComplete={handleFleetComplete} />
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
