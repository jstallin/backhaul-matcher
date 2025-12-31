import { useState, useEffect } from 'react';
import { FileText, Truck, MapPin, Calendar, RefreshCw, Bell, Edit, Trash2, X, CheckCircle, Clock } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const OpenRequests = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const requestsData = await db.requests.getAll(user.id);
      setRequests(requestsData || []);
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async (requestId) => {
    setRefreshingId(requestId);
    try {
      // TODO: Implement actual backhaul search
      console.log('Manually refreshing request:', requestId);
      
      // Simulate refresh delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update last_refresh_at
      await db.requests.update(requestId, {
        last_refresh_at: new Date().toISOString()
      });
      
      await loadRequests();
      alert('Request refreshed successfully!\\n\\nNote: Full backhaul search integration coming next.');
    } catch (error) {
      console.error('Error refreshing request:', error);
      alert('Failed to refresh: ' + error.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeleteClick = (request) => {
    setDeleteConfirm(request);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await db.requests.delete(deleteConfirm.id);
      await loadRequests();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting request:', error);
      alert('Failed to delete request: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (request) => {
    try {
      const newStatus = request.status === 'active' ? 'paused' : 'active';
      await db.requests.update(request.id, { status: newStatus });
      await loadRequests();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status: ' + error.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.cyan}40`, borderTop: `4px solid ${colors.accent.cyan}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      {/* Header */}
      <header style={{ padding: '24px 32px', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color={colors.accent.orange} strokeWidth={2.5} />
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em', background: `linear-gradient(135deg, ${colors.accent.orange} 0%, ${colors.accent.cyan} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BACKHAUL</h1>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary, fontWeight: 500, letterSpacing: '0.05em' }}>SMART RETURN ROUTE OPTIMIZATION</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="open-requests" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      {/* Page Header */}
      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>Open Requests</h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>View and manage your active backhaul requests</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {requests.length === 0 ? (
          /* Empty State */
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <FileText size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Requests Yet</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              Create your first backhaul request to start finding opportunities.
            </p>
            <button onClick={() => onMenuNavigate('start-request')} style={{ padding: '14px 28px', background: `linear-gradient(135deg, ${colors.accent.cyan} 0%, #00a8cc 100%)`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} />
              Start Request
            </button>
          </div>
        ) : (
          /* Requests List */
          <>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                  Your Requests ({requests.length})
                </h3>
                <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                  Click refresh to update search results
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {requests.map((request) => (
                <div key={request.id} style={{ background: colors.background.card, border: `2px solid ${request.status === 'active' ? colors.accent.green + '40' : colors.border.primary}`, borderRadius: '16px', padding: '24px', transition: 'all 0.2s' }}>
                  
                  {/* Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
                          {request.request_name}
                        </h4>
                        {/* Status Badge */}
                        <div style={{ padding: '4px 12px', background: request.status === 'active' ? `${colors.accent.green}20` : `${colors.text.tertiary}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: request.status === 'active' ? colors.accent.green : colors.text.tertiary, textTransform: 'uppercase' }}>
                          {request.status === 'active' ? '● Active' : '○ Paused'}
                        </div>
                        {/* Relay Badge */}
                        {request.is_relay && (
                          <div style={{ padding: '4px 12px', background: `${colors.accent.orange}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: colors.accent.orange }}>
                            RELAY
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '14px', color: colors.text.secondary }}>
                        Fleet: {request.fleets?.name || 'Unknown'}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleManualRefresh(request.id)} disabled={refreshingId === request.id} style={{ padding: '10px 16px', background: refreshingId === request.id ? colors.background.secondary : `linear-gradient(135deg, ${colors.accent.cyan} 0%, #00a8cc 100%)`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: refreshingId === request.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: refreshingId === request.id ? 0.7 : 1 }}>
                        <RefreshCw size={16} style={{ animation: refreshingId === request.id ? 'spin 1s linear infinite' : 'none' }} />
                        {refreshingId === request.id ? 'Refreshing...' : 'Refresh'}
                      </button>
                      <button onClick={() => handleToggleStatus(request)} style={{ padding: '10px 12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        {request.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button onClick={() => handleDeleteClick(request)} style={{ padding: '10px 12px', background: colors.background.secondary, border: `1px solid ${colors.accent.red}40`, borderRadius: '8px', color: colors.accent.red, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.border.secondary}` }}>
                    <div>
                      <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} />
                        Datum Point
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>
                        {request.datum_point}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        Available
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>
                        {formatDate(request.equipment_available_date)}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        Needed Back
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>
                        {formatDate(request.equipment_needed_date)}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '12px', color: colors.text.tertiary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        Last Refresh
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>
                        {formatDateTime(request.last_refresh_at)}
                      </div>
                    </div>
                  </div>

                  {/* Auto-Refresh & Notifications Info */}
                  <div style={{ display: 'flex', gap: '16px', paddingTop: '16px', borderTop: `1px solid ${colors.border.secondary}`, flexWrap: 'wrap' }}>
                    {/* Auto Refresh */}
                    {request.auto_refresh && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: `${colors.accent.cyan}10`, borderRadius: '8px' }}>
                        <RefreshCw size={16} color={colors.accent.cyan} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>
                          Auto-refresh: Every {request.auto_refresh_interval}h
                        </span>
                      </div>
                    )}

                    {/* Notifications */}
                    {request.notification_enabled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: `${colors.accent.orange}10`, borderRadius: '8px' }}>
                        <Bell size={16} color={colors.accent.orange} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>
                          Notifications: {request.notification_method === 'both' ? 'Text & Email' : request.notification_method === 'text' ? 'Text' : 'Email'}
                        </span>
                      </div>
                    )}

                    {/* Next Refresh */}
                    {request.auto_refresh && request.next_refresh_at && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: colors.background.secondary, borderRadius: '8px' }}>
                        <Clock size={16} color={colors.text.secondary} />
                        <span style={{ fontSize: '13px', color: colors.text.secondary }}>
                          Next: {formatDateTime(request.next_refresh_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease-out' }} onClick={() => !deleting && setDeleteConfirm(null)}>
          <div style={{ background: colors.background.overlay, borderRadius: '16px', maxWidth: '500px', width: '100%', border: `1px solid ${colors.border.accent}`, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)', animation: 'slideUp 0.3s ease-out' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.accent.red }}>Delete Request?</h3>
                <button onClick={() => setDeleteConfirm(null)} disabled={deleting} style={{ background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', padding: '4px', color: colors.text.secondary, opacity: deleting ? 0.5 : 1 }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 24px 0', fontSize: '15px', color: colors.text.primary, lineHeight: '1.6' }}>
                You are deleting <strong>{deleteConfirm.request_name}</strong>. Are you certain? This action cannot be undone.
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setDeleteConfirm(null)} disabled={deleting} style={{ padding: '12px 24px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.5 : 1 }}>
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} disabled={deleting} style={{ padding: '12px 24px', background: `linear-gradient(135deg, ${colors.accent.red} 0%, #dc2626 100%)`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
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
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
