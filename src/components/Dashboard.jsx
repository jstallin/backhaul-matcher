import { useState, useEffect } from 'react';
import { TrendingUp, Truck, FileText, CheckCircle, Plus, DollarSign, MapPin } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { HaulMonitorLogo } from './HaulMonitorLogo';
import { db } from '../lib/supabase';
import { CoDriver } from './CoDriver';

export const Dashboard = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fleets, setFleets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [estimateRequests, setEstimateRequests] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fleetsData, requestsData, estimateData] = await Promise.all([
        db.fleets.getAll(user.id),
        db.requests.getAll(user.id),
        db.estimateRequests.getAll(user.id)
      ]);
      setFleets(fleetsData || []);
      setRequests(requestsData || []);
      setEstimateRequests(estimateData || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setFleets([]);
      setRequests([]);
      setEstimateRequests([]);
    } finally {
      setLoading(false);
    }
  };

  // Metrics
  const activeRequests = requests.filter(r => r.status === 'active' || r.status === 'open' || r.status === 'pending');
  const completedRequests = requests.filter(r => r.status === 'completed');
  const openEstimates = estimateRequests.filter(r => r.status === 'active' || r.status === 'open' || r.status === 'pending');
  const totalRevenue = completedRequests.reduce((sum, r) => sum + (parseFloat(r.revenue_amount) || 0), 0);

  // Recent activity — last 8 requests combined, sorted by created_at
  const recentActivity = [...requests, ...estimateRequests]
    .filter(r => r.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  const statCards = [
    {
      label: 'Active Backhaul Requests',
      value: loading ? '—' : activeRequests.length,
      icon: FileText,
      color: colors.accent.primary,
      action: () => onMenuNavigate('open-requests')
    },
    {
      label: 'Fleets',
      value: loading ? '—' : fleets.length,
      icon: Truck,
      color: colors.accent.cyan || '#22d3ee',
      action: () => onMenuNavigate('fleets')
    },
    {
      label: 'Open Estimate Requests',
      value: loading ? '—' : openEstimates.length,
      icon: DollarSign,
      color: colors.accent.orange || '#f97316',
      action: () => onMenuNavigate('open-estimate-requests')
    },
    {
      label: 'Completed Hauls',
      value: loading ? '—' : completedRequests.length,
      icon: CheckCircle,
      color: '#10b981',
      action: () => onMenuNavigate('fleet-reports')
    }
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'cancelled': return colors.text.muted || '#666';
      case 'expired': return colors.text.muted || '#666';
      case 'active':
      case 'open':
      case 'pending':
        return colors.accent.primary;
      default: return colors.text.secondary;
    }
  };

  const getStatusLabel = (status) => {
    if (!status) return 'Unknown';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const isEmpty = !loading && fleets.length === 0 && requests.length === 0;

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      {/* Header */}
      <header style={{
        padding: 'clamp(12px, 3vw, 20px) clamp(16px, 4vw, 32px)',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <HamburgerMenu currentView="dashboard" onNavigate={onMenuNavigate} />
          <HaulMonitorLogo size="small" variant="icon" />
        </div>
        <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(20px, 4vw, 32px) clamp(16px, 3vw, 24px)' }}>
        {/* Page title */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', fontWeight: 800, color: colors.text.primary }}>
            Dashboard
          </h1>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
            At-a-glance overview of your fleet activity
          </p>
        </div>

        {/* First-run empty state */}
        {isEmpty ? (
          <div style={{
            background: colors.background.secondary,
            border: `1px dashed ${colors.border.accent}`,
            borderRadius: '16px',
            padding: '48px 32px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: `${colors.accent.primary}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <Truck size={28} color={colors.accent.primary} />
            </div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 700, color: colors.text.primary }}>
              Welcome to Haul Monitor
            </h2>
            <p style={{ margin: '0 0 28px 0', color: colors.text.secondary, fontSize: '15px', lineHeight: '1.6', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
              Get started by creating your first fleet profile. It only takes a minute.
            </p>
            <button
              onClick={() => onMenuNavigate('fleets')}
              style={{
                padding: '12px 28px',
                background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.hover || colors.accent.primary} 100%)`,
                border: 'none',
                borderRadius: '8px',
                color: '#0d1117',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Create Your First Fleet
            </button>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '16px',
              marginBottom: '32px'
            }}>
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.label}
                    onClick={card.action}
                    style={{
                      background: colors.background.secondary,
                      border: `1px solid ${colors.border.secondary}`,
                      borderRadius: '12px',
                      padding: '20px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = card.color;
                      e.currentTarget.style.background = colors.background.tertiary || colors.background.hover || colors.background.secondary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = colors.border.secondary;
                      e.currentTarget.style.background = colors.background.secondary;
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: `${card.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={18} color={card.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: colors.text.primary, lineHeight: 1 }}>
                        {card.value}
                      </div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary, marginTop: '4px' }}>
                        {card.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div style={{
              background: colors.background.secondary,
              border: `1px solid ${colors.border.secondary}`,
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '28px'
            }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>
                Quick Actions
              </h2>
              <div className="dash-quick-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {[
                  { label: '+ New Backhaul Request', view: 'start-request', primary: true },
                  { label: '+ New Estimate Request', view: 'start-estimate-request', primary: false },
                  { label: 'View Open Requests', view: 'open-requests', primary: false },
                  { label: 'Manage Fleets', view: 'fleets', primary: false }
                ].map((action) => (
                  <button
                    key={action.view}
                    onClick={() => onMenuNavigate(action.view)}
                    style={{
                      padding: '10px 18px',
                      minHeight: '44px',
                      background: action.primary
                        ? `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.hover || colors.accent.primary} 100%)`
                        : colors.background.primary,
                      border: action.primary ? 'none' : `1px solid ${colors.border.accent}`,
                      borderRadius: '8px',
                      color: action.primary ? '#0d1117' : colors.text.primary,
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div style={{
                background: colors.background.secondary,
                border: `1px solid ${colors.border.secondary}`,
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>
                  Recent Activity
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {recentActivity.map((r, idx) => (
                    <div
                      key={r.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 8px',
                        borderBottom: idx < recentActivity.length - 1 ? `1px solid ${colors.border.secondary}` : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <MapPin size={15} color={colors.text.muted || colors.text.secondary} style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: colors.text.primary,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 'min(320px, 55vw)'
                          }}>
                            {r.request_name || r.datum_point || 'Request'}
                          </div>
                          <div style={{ fontSize: '12px', color: colors.text.secondary, marginTop: '2px' }}>
                            {formatDate(r.created_at)}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: getStatusColor(r.status),
                        flexShrink: 0,
                        marginLeft: '12px'
                      }}>
                        {getStatusLabel(r.status)}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onMenuNavigate('open-requests')}
                  style={{
                    marginTop: '14px',
                    background: 'none',
                    border: 'none',
                    color: colors.accent.primary,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  View all requests →
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <CoDriver
        context="dashboard"
        contextData={{
          fleets,
          activeRequests: activeRequests.length,
          completedRequests: completedRequests.length,
          openEstimates: openEstimates.length,
          recentActivity
        }}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .dash-quick-actions { flex-direction: column; }
          .dash-quick-actions button { width: 100%; }
        }
      `}</style>
    </div>
  );
};
