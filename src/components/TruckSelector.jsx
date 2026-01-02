import { useState, useEffect } from 'react';
import { Truck, MapPin, Search, ChevronRight } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../lib/supabase';

export const TruckSelector = ({ fleetId, onSelectTruck }) => {
  const { colors } = useTheme();
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [finalDestination, setFinalDestination] = useState('');
  const [destinationLat, setDestinationLat] = useState('');
  const [destinationLng, setDestinationLng] = useState('');

  useEffect(() => {
    if (fleetId) {
      loadTrucks();
    }
  }, [fleetId]);

  const loadTrucks = async () => {
    setLoading(true);
    try {
      const data = await db.trucks.getByFleet(fleetId);
      // Only show active trucks
      const activeTrucks = data?.filter(t => t.status === 'active') || [];
      setTrucks(activeTrucks);
    } catch (err) {
      console.error('Error loading trucks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (!selectedTruck || !finalDestination) {
      alert('Please select a truck and enter final destination');
      return;
    }

    // Pass truck and destination info back to parent
    onSelectTruck({
      truck: selectedTruck,
      finalStop: {
        address: finalDestination,
        lat: destinationLat ? parseFloat(destinationLat) : null,
        lng: destinationLng ? parseFloat(destinationLng) : null
      }
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', color: '${colors.text.secondary}', textAlign: 'center' }}>
        Loading trucks...
      </div>
    );
  }

  if (trucks.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        background: '${colors.background.tertiary}',
        borderRadius: '16px',
        border: '1px dashed rgba(255, 255, 255, 0.2)'
      }}>
        <Truck size={48} color="${colors.text.tertiary}" style={{ marginBottom: '16px' }} />
        <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '${colors.text.primary}' }}>
          No Active Trucks
        </h3>
        <p style={{ margin: 0, color: '${colors.text.secondary}', fontSize: '15px' }}>
          Add trucks to your fleet to start searching for backhaul opportunities
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '24px',
          fontWeight: 900,
          color: '${colors.text.primary}'
        }}>
          Select Truck for Backhaul Search
        </h3>
        <p style={{ margin: 0, color: '${colors.text.secondary}', fontSize: '15px' }}>
          Choose which truck needs a backhaul and enter its final destination
        </p>
      </div>

      {/* Truck Selection */}
      <div style={{
        display: 'grid',
        gap: '12px',
        marginBottom: '32px'
      }}>
        {trucks.map((truck) => (
          <div
            key={truck.id}
            onClick={() => setSelectedTruck(truck)}
            style={{
              background: selectedTruck?.id === truck.id 
                ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)'
                : '${colors.background.secondary}',
              border: selectedTruck?.id === truck.id 
                ? '2px solid ${colors.accent.primary}' 
                : '1px solid ${colors.border.primary}',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => {
              if (selectedTruck?.id !== truck.id) {
                e.currentTarget.style.background = '${colors.background.hover}';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedTruck?.id !== truck.id) {
                e.currentTarget.style.background = '${colors.background.secondary}';
              }
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '18px',
                fontWeight: 800,
                color: selectedTruck?.id === truck.id ? '${colors.accent.primary}' : '${colors.text.primary}',
                marginBottom: '8px',
                fontFamily: "'JetBrains Mono', monospace",
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <Truck size={20} color={selectedTruck?.id === truck.id ? '${colors.accent.primary}' : '${colors.text.secondary}'} />
                {truck.truck_number}
              </div>
              <div style={{
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                fontSize: '14px',
                color: '${colors.text.secondary}'
              }}>
                <span><strong>Type:</strong> {truck.trailer_type}</span>
                <span><strong>Length:</strong> {truck.trailer_length} ft</span>
                <span><strong>Weight:</strong> {truck.weight_limit.toLocaleString()} lbs</span>
              </div>
            </div>
            {selectedTruck?.id === truck.id && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '${colors.accent.primary}',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 900,
                color: '#0a0e27'
              }}>
                ✓
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Destination Entry */}
      {selectedTruck && (
        <div style={{
          background: 'rgba(0, 212, 255, 0.05)',
          border: '1px solid rgba(0, 212, 255, 0.2)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <h4 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 800,
            color: '${colors.text.primary}',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <MapPin size={20} color="${colors.accent.primary}" />
            Final Destination for {selectedTruck.truck_number}
          </h4>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#b8bcc8'
            }}>
              Destination Address *
            </label>
            <input
              type="text"
              value={finalDestination}
              onChange={(e) => setFinalDestination(e.target.value)}
              placeholder="e.g., 100 Business Park Dr, Hickory, NC"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '${colors.background.tertiary}',
                border: '1px solid ${colors.border.primary}',
                borderRadius: '8px',
                color: '${colors.text.primary}',
                fontSize: '15px',
                outline: 'none'
              }}
            />
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: '${colors.text.tertiary}'
            }}>
              Where is this truck completing its current delivery?
            </p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#b8bcc8'
            }}>
              Coordinates (Optional - for better accuracy)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <input
                type="text"
                value={destinationLat}
                onChange={(e) => setDestinationLat(e.target.value)}
                placeholder="Latitude (e.g., 35.7332)"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '${colors.background.tertiary}',
                  border: '1px solid ${colors.border.primary}',
                  borderRadius: '8px',
                  color: '${colors.text.primary}',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <input
                type="text"
                value={destinationLng}
                onChange={(e) => setDestinationLng(e.target.value)}
                placeholder="Longitude (e.g., -81.3412)"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '${colors.background.tertiary}',
                  border: '1px solid ${colors.border.primary}',
                  borderRadius: '8px',
                  color: '${colors.text.primary}',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <button
            onClick={handleSearch}
            style={{
              width: '100%',
              padding: '16px',
              background: `colors.accent.primary`,
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s'
            }}
          >
            <Search size={20} />
            Search Backhaul for {selectedTruck.truck_number}
          </button>
        </div>
      )}
    </div>
  );
};
