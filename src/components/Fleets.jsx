import { useState, useEffect } from 'react';
import { Truck, MapPin, Plus, Edit, Trash2, Phone, Mail, ChevronRight, X } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';

export const Fleets = ({ user, onSelectFleet, onCreateFleet, onNavigateToSettings, onMenuNavigate }) => {
  const { colors } = useTheme();
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFleetId, setExpandedFleetId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {id, name}
  const [editConfirm, setEditConfirm] = useState(null); // {id, name}
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      loadFleets();
    }
  }, [user]);

  const loadFleets = async () => {
    setLoading(true);
    try {
      const fleetsData = await db.fleets.getAll(user.id);
      setFleets(fleetsData || []);
    } catch (error) {
      console.error('Error loading fleets:', error);
      setFleets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (fleetId) => {
    setExpandedFleetId(expandedFleetId === fleetId ? null : fleetId);
  };

  const handleDeleteClick = (e, fleet) => {
    e.stopPropagation();
    setDeleteConfirm({ id: fleet.id, name: fleet.name });
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await db.fleets.delete(deleteConfirm.id);
      await loadFleets();
      setDeleteConfirm(null);
      setExpandedFleetId(null);
    } catch (error) {
      console.error('Error deleting fleet:', error);
      alert('Failed to delete fleet: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEditClick = (e, fleet) => {
    e.stopPropagation();
    setEditConfirm({ id: fleet.id, name: fleet.name });
  };

  const handleEditConfirm = () => {
    const fleet = fleets.find(f => f.id === editConfirm.id);
    setEditConfirm(null);
    onSelectFleet(fleet);
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
            border: `4px solid ${colors.accent.primary}40`,
            borderTop: `4px solid ${colors.accent.primary}`,
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
            <Truck size={32} color={colors.accent.primary} strokeWidth={2.5} />
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: '28px', 
                fontWeight: 900,
                letterSpacing: '-0.02em',
                background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.primary} 100%)`,
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
                background: `colors.accent.primary`,
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
                  Click a fleet to view details
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
                  e.currentTarget.style.borderColor = colors.accent.primary;
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
              gap: '24px'
            }}>
              {fleets.map((fleet) => {
                const isExpanded = expandedFleetId === fleet.id;
                
                return (
                  <div
                    key={fleet.id}
                    onClick={() => handleToggleExpand(fleet.id)}
                    style={{
                      background: colors.background.card,
                      border: `2px solid ${isExpanded ? colors.accent.primary : colors.border.primary}`,
                      borderRadius: '16px',
                      padding: '24px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) {
                        e.currentTarget.style.borderColor = colors.accent.primary;
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 212, 255, 0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) {
                        e.currentTarget.style.borderColor = colors.border.primary;
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {/* Collapsed View */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: isExpanded ? '20px' : '0'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.primary} 100%)`,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Truck size={24} color="#fff" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <h3 style={{
                              margin: '0 0 4px 0',
                              fontSize: '18px',
                              fontWeight: 800,
                              color: colors.text.primary
                            }}>
                              {fleet.name}
                            </h3>
                            <div style={{
                              fontSize: '13px',
                              color: colors.text.secondary
                            }}>
                              MC: {fleet.mc_number || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: colors.text.secondary,
                          fontSize: '14px'
                        }}>
                          <MapPin size={16} />
                          <span>{fleet.home_address || 'No address set'}</span>
                        </div>
                      </div>

                      {/* Expand/Collapse Chevron */}
                      <div style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s',
                        color: colors.accent.primary
                      }}>
                        <ChevronRight size={24} />
                      </div>
                    </div>

                    {/* Expanded View */}
                    {isExpanded && (
                      <div style={{
                        borderTop: `1px solid ${colors.border.secondary}`,
                        paddingTop: '20px',
                        animation: 'fadeIn 0.3s ease-out'
                      }}>
                        {/* Details Grid */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '16px',
                          marginBottom: '20px'
                        }}>
                          {fleet.mc_number && (
                            <div>
                              <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px' }}>
                                MC Number
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                                {fleet.mc_number}
                              </div>
                            </div>
                          )}
                          
                          {fleet.dot_number && (
                            <div>
                              <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px' }}>
                                DOT Number
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                                {fleet.dot_number}
                              </div>
                            </div>
                          )}

                          {fleet.phone_number && (
                            <div>
                              <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Phone size={12} />
                                Phone
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                                {fleet.phone_number}
                              </div>
                            </div>
                          )}

                          {fleet.email && (
                            <div>
                              <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Mail size={12} />
                                Email
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary, wordBreak: 'break-all' }}>
                                {fleet.email}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{
                          display: 'flex',
                          gap: '12px',
                          marginTop: '20px',
                          borderTop: `1px solid ${colors.border.secondary}`,
                          paddingTop: '20px'
                        }}>
                          <button
                            onClick={(e) => handleEditClick(e, fleet)}
                            style={{
                              flex: 1,
                              padding: '12px',
                              background: colors.accent.primary,
                              border: 'none',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '14px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = `0 4px 12px ${colors.accent.primary}60`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <Edit size={18} />
                            Edit Fleet
                          </button>

                          <button
                            onClick={(e) => handleDeleteClick(e, fleet)}
                            style={{
                              flex: 1,
                              padding: '12px',
                              background: colors.background.secondary,
                              border: `1px solid ${colors.accent.danger}40`,
                              borderRadius: '8px',
                              color: colors.accent.danger,
                              fontSize: '14px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = `${colors.accent.danger}20`;
                              e.currentTarget.style.borderColor = colors.accent.danger;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = colors.background.secondary;
                              e.currentTarget.style.borderColor = `${colors.accent.danger}40`;
                            }}
                          >
                            <Trash2 size={18} />
                            Delete Fleet
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div 
            style={{
              background: colors.background.overlay,
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              border: `1px solid ${colors.border.accent}`,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              animation: 'slideUp 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '24px',
              borderBottom: `1px solid ${colors.border.secondary}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 800,
                  color: colors.accent.danger
                }}>
                  Delete Fleet?
                </h3>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    padding: '4px',
                    color: colors.text.secondary,
                    opacity: deleting ? 0.5 : 1
                  }}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{
                margin: '0 0 24px 0',
                fontSize: '15px',
                color: colors.text.primary,
                lineHeight: '1.6'
              }}>
                You are deleting <strong>{deleteConfirm.name}</strong>. Are you certain? This action cannot be undone and will also delete all associated trucks and drivers.
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  style={{
                    padding: '12px 24px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.accent}`,
                    borderRadius: '8px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  style={{
                    padding: '12px 24px',
                    background: `colors.accent.danger`,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1
                  }}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Confirmation Modal */}
      {editConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={() => setEditConfirm(null)}
        >
          <div 
            style={{
              background: colors.background.overlay,
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              border: `1px solid ${colors.border.accent}`,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              animation: 'slideUp 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '24px',
              borderBottom: `1px solid ${colors.border.secondary}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 800,
                  color: colors.accent.primary
                }}>
                  Edit Fleet?
                </h3>
                <button
                  onClick={() => setEditConfirm(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: colors.text.secondary
                  }}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{
                margin: '0 0 24px 0',
                fontSize: '15px',
                color: colors.text.primary,
                lineHeight: '1.6'
              }}>
                You are about to edit <strong>{editConfirm.name}</strong>. Continue?
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditConfirm(null)}
                  style={{
                    padding: '12px 24px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.accent}`,
                    borderRadius: '8px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditConfirm}
                  style={{
                    padding: '12px 24px',
                    background: colors.accent.primary,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Yes, Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
