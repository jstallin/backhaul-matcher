import { useState, useEffect } from 'react';
import { Truck, MapPin, Users, Plus } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';

export const Fleets = ({ user, onSelectFleet, onCreateFleet, onNavigateToSettings, onMenuNavigate }) => {
  const { colors } = useTheme();
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadFleets();
    }
  }, [user]);

  const loadFleets = async () => {
    setLoading(true);
    try {
      const fleetsData = await db.fleets.getAll(user.id);
      console.log('Loaded fleets:', fleetsData); // Debug log
      setFleets(fleetsData || []);
    } catch (error) {
      console.error('Error loading fleets:', error);
      setFleets([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.background.primary,
        padding: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: `4px solid ${colors.accent.cyan}40`,
            borderTop: `4px solid ${colors.accent.cyan}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: colors.text.secondary }}>Loading fleets...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.background.primary,
      color: colors.text.primary
    }}>
      {/* Main Header with Navigation */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color={colors.accent.orange} strokeWidth={2.5} />
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: '28px', 
                fontWeight: 900,
                letterSpacing: '-0.02em',
                background: `linear-gradient(135deg, ${colors.accent.orange} 0%, ${colors.accent.cyan} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                BACKHAUL
              </h1>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary, fontWeight: 500, letterSpacing: '0.05em' }}>
                SMART RETURN ROUTE OPTIMIZATION
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu 
              currentView="fleets"
              onNavigate={onMenuNavigate}
            />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      {/* Page Header */}
      <div style={{
        padding: '24px 32px',
        background: colors.background.secondary,
        borderBottom: `1px solid ${colors.border.secondary}`
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{
            margin: '0 0 8px 0',
            fontSize: '32px',
            fontWeight: 900,
            color: colors.text.primary
          }}>
            Fleets
          </h2>
          <p style={{
            margin: 0,
            color: colors.text.secondary,
            fontSize: '15px'
          }}>
            Manage all fleets under your account
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        
        {fleets.length === 0 ? (
          /* Empty State */
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            background: colors.background.card,
            borderRadius: '16px',
            border: `1px solid ${colors.border.primary}`
          }}>
            <Truck size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h2 style={{
              margin: '0 0 12px 0',
              fontSize: '24px',
              fontWeight: 800,
              color: colors.text.primary
            }}>
              No Fleets Yet
            </h2>
            <p style={{
              margin: '0 0 32px 0',
              color: colors.text.secondary,
              fontSize: '15px',
              maxWidth: '500px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}>
              Get started by creating your first fleet. Add trucks, drivers, and start managing backhaul opportunities.
            </p>
            <button
              onClick={onCreateFleet}
              style={{
                padding: '14px 28px',
                background: `linear-gradient(135deg, ${colors.accent.cyan} 0%, #00a8cc 100%)`,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 212, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Plus size={20} />
              Create Fleet
            </button>
          </div>
        ) : (
          /* Fleets Grid */
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <div>
                <h2 style={{
                  margin: '0 0 4px 0',
                  fontSize: '20px',
                  fontWeight: 800,
                  color: colors.text.primary
                }}>
                  Your Fleets ({fleets.length})
                </h2>
                <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                  Select a fleet to view details and manage operations
                </p>
              </div>
              <button
                onClick={onCreateFleet}
                style={{
                  padding: '12px 24px',
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
                  e.currentTarget.style.background = colors.background.hover;
                  e.currentTarget.style.borderColor = colors.accent.cyan;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.background.secondary;
                  e.currentTarget.style.borderColor = colors.border.accent;
                }}
              >
                <Plus size={18} />
                Add Fleet
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '24px'
            }}>
              {fleets.map((fleet) => (
                <div
                  key={fleet.id}
                  onClick={() => onSelectFleet(fleet)}
                  style={{
                    background: colors.background.card,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '16px',
                    padding: '24px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.accent.cyan;
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 212, 255, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.border.primary;
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      background: `linear-gradient(135deg, ${colors.accent.orange} 0%, ${colors.accent.cyan} 100%)`,
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Truck size={24} color="#fff" />
                    </div>
                    <div style={{
                      padding: '4px 12px',
                      background: `${colors.accent.green}20`,
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: colors.accent.green
                    }}>
                      Active
                    </div>
                  </div>

                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: '20px',
                    fontWeight: 800,
                    color: colors.text.primary
                  }}>
                    {fleet.name}
                  </h3>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '16px',
                    color: colors.text.secondary,
                    fontSize: '14px'
                  }}>
                    <MapPin size={16} />
                    <span>{fleet.home_address || 'No address set'}</span>
                  </div>

                  <div style={{
                    borderTop: `1px solid ${colors.border.secondary}`,
                    paddingTop: '16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '12px',
                        color: colors.text.tertiary,
                        marginBottom: '4px'
                      }}>
                        MC Number
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: colors.text.primary
                      }}>
                        {fleet.mc_number || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{
                        fontSize: '12px',
                        color: colors.text.tertiary,
                        marginBottom: '4px'
                      }}>
                        Status
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: colors.accent.green
                      }}>
                        Active
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
