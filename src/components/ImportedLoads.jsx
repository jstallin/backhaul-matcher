import { useState, useEffect, useCallback } from 'react';
import { Package, MapPin, Navigation, DollarSign, Truck, Calendar, Trash2, RefreshCw, CheckCircle, X, Phone, Mail, Clock, Download } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/supabase';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';

export const ImportedLoads = ({ onMenuNavigate }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('available'); // 'all', 'available', 'contacted', 'booked', 'dismissed'
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [pendingLoads, setPendingLoads] = useState([]);
  const [syncing, setSyncing] = useState(false);

  // Check for extension and listen for messages
  useEffect(() => {
    // Check if extension is installed via DOM attribute
    const hasExtension = document.documentElement.getAttribute('data-haul-monitor-extension') === 'true';
    setExtensionInstalled(hasExtension);

    // Listen for messages from extension
    const handleMessage = (event) => {
      if (event.source !== window) return;
      const { type, loads: incomingLoads, count } = event.data || {};

      switch (type) {
        case 'HAUL_MONITOR_EXTENSION_READY':
          setExtensionInstalled(true);
          break;
        case 'HAUL_MONITOR_PENDING_LOADS':
          console.log('ImportedLoads: Received pending loads from extension:', count);
          setPendingLoads(incomingLoads || []);
          break;
        case 'HAUL_MONITOR_LOADS_RESPONSE':
          console.log('ImportedLoads: Received loads response from extension');
          setPendingLoads(incomingLoads || []);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Request loads from extension on mount
  useEffect(() => {
    if (extensionInstalled) {
      window.postMessage({ type: 'HAUL_MONITOR_GET_LOADS', requestId: Date.now() }, '*');
    }
  }, [extensionInstalled]);

  // Parse numeric value from string like "6,000 lbs" or "1,234"
  const parseNumeric = (value) => {
    if (typeof value === 'number') return value || null;
    if (!value) return null;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  };

  // Sync loads from extension to Supabase
  const syncFromExtension = useCallback(async () => {
    if (!user || pendingLoads.length === 0) return;

    setSyncing(true);
    try {
      // Transform extension loads to Supabase format and insert
      for (const load of pendingLoads) {
        const rate = parseNumeric(load.rate);
        const distance = parseNumeric(load.trip);

        const dbLoad = {
          user_id: user.id,
          external_id: load.id,
          source: load.source || 'dat',
          origin_city: load.originCity,
          origin_state: load.originState,
          origin_lat: load.originLat ? parseNumeric(load.originLat) : null,
          origin_lng: load.originLng ? parseNumeric(load.originLng) : null,
          destination_city: load.destCity,
          destination_state: load.destState,
          destination_lat: load.destLat ? parseNumeric(load.destLat) : null,
          destination_lng: load.destLng ? parseNumeric(load.destLng) : null,
          pickup_date: load.pickup ? parsePickupDate(load.pickup) : null,
          distance_miles: distance ? Math.round(distance) : null,
          rate: rate,
          rate_per_mile: rate && distance ? Math.round((rate / distance) * 100) / 100 : null,
          equipment_type: load.truck,
          weight_lbs: parseNumeric(load.weight) ? Math.round(parseNumeric(load.weight)) : null,
          company_name: load.company,
          contact_phone: load.contact,
          credit_score: parseNumeric(load.cs) ? Math.round(parseNumeric(load.cs)) : null,
          days_to_pay: parseNumeric(load.dtp) ? Math.round(parseNumeric(load.dtp)) : null,
          raw_data: load,
          status: 'available'
        };

        await db.importedLoads.create(dbLoad);
      }

      // Clear loads from extension storage
      window.postMessage({ type: 'HAUL_MONITOR_CLEAR_LOADS', requestId: Date.now() }, '*');
      setPendingLoads([]);

      // Refresh the loads list
      await loadImportedLoads();
    } catch (error) {
      console.error('Error syncing loads from extension:', error);
    } finally {
      setSyncing(false);
    }
  }, [user, pendingLoads]);

  // Parse pickup date string like "Feb 14" to a date
  const parsePickupDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const currentYear = new Date().getFullYear();
      const parsed = new Date(`${dateStr} ${currentYear}`);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (user) {
      loadImportedLoads();
    }
  }, [user, filter]);

  const loadImportedLoads = async () => {
    try {
      setLoading(true);
      const options = filter !== 'all' ? { status: filter } : {};
      const data = await db.importedLoads.getAll(user.id, options);
      setLoads(data || []);
    } catch (error) {
      console.error('Error loading imported loads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadImportedLoads();
    setRefreshing(false);
  };

  const handleStatusChange = async (loadId, newStatus) => {
    try {
      await db.importedLoads.updateStatus(loadId, newStatus);
      await loadImportedLoads();
    } catch (error) {
      console.error('Error updating load status:', error);
    }
  };

  const handleDelete = async (loadId) => {
    if (!confirm('Are you sure you want to delete this load?')) return;

    try {
      await db.importedLoads.delete(loadId);
      await loadImportedLoads();
      if (selectedLoad?.id === loadId) {
        setSelectedLoad(null);
      }
    } catch (error) {
      console.error('Error deleting load:', error);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return colors.accent.success;
      case 'contacted': return colors.accent.primary;
      case 'booked': return colors.accent.info;
      case 'dismissed': return colors.text.tertiary;
      default: return colors.text.secondary;
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'available': return 'rgba(16, 185, 129, 0.1)';
      case 'contacted': return 'rgba(216, 159, 56, 0.1)';
      case 'booked': return 'rgba(59, 130, 246, 0.1)';
      case 'dismissed': return 'rgba(107, 114, 128, 0.1)';
      default: return colors.background.secondary;
    }
  };

  const filterOptions = [
    { value: 'available', label: 'Available', count: loads.filter(l => l.status === 'available').length },
    { value: 'contacted', label: 'Contacted', count: loads.filter(l => l.status === 'contacted').length },
    { value: 'booked', label: 'Booked', count: loads.filter(l => l.status === 'booked').length },
    { value: 'dismissed', label: 'Dismissed', count: loads.filter(l => l.status === 'dismissed').length },
    { value: 'all', label: 'All', count: loads.length }
  ];

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <HamburgerMenu onNavigate={onMenuNavigate} />
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: 900,
              color: colors.text.primary,
              letterSpacing: '-0.02em'
            }}>
              Imported Loads
            </h1>
            <p style={{ margin: '4px 0 0 0', color: colors.text.secondary, fontSize: '14px' }}>
              Loads imported from DAT and other load boards
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: '10px 16px',
              background: colors.background.secondary,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: '8px',
              color: colors.text.primary,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
          <AvatarMenu onNavigate={onMenuNavigate} />
        </div>
      </div>

      {/* Extension Sync Banner */}
      {pendingLoads.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(216, 159, 56, 0.15) 0%, rgba(184, 134, 11, 0.15) 100%)',
          border: `2px solid ${colors.accent.primary}`,
          borderRadius: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: colors.accent.primary,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Download size={20} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: colors.text.primary }}>
                {pendingLoads.length} load{pendingLoads.length > 1 ? 's' : ''} ready to import
              </div>
              <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                Imported from DAT via browser extension
              </div>
            </div>
          </div>
          <button
            onClick={syncFromExtension}
            disabled={syncing}
            style={{
              padding: '12px 24px',
              background: colors.accent.primary,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: syncing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: syncing ? 0.7 : 1
            }}
          >
            {syncing ? (
              <>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Syncing...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Sync to Haul Monitor
              </>
            )}
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {filterOptions.slice(0, 4).map(opt => (
          <div
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            style={{
              padding: '16px',
              background: filter === opt.value ? getStatusBg(opt.value) : colors.background.card,
              border: `2px solid ${filter === opt.value ? getStatusColor(opt.value) : colors.border.primary}`,
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{
              fontSize: '28px',
              fontWeight: 800,
              color: getStatusColor(opt.value),
              marginBottom: '4px'
            }}>
              {opt.count}
            </div>
            <div style={{ fontSize: '13px', color: colors.text.secondary, fontWeight: 600 }}>
              {opt.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        borderBottom: `1px solid ${colors.border.primary}`,
        paddingBottom: '12px'
      }}>
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            style={{
              padding: '8px 16px',
              background: filter === opt.value ? colors.accent.primary : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: filter === opt.value ? 'white' : colors.text.secondary,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {opt.label} ({opt.count})
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Loads List */}
        <div style={{ flex: '1', minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.text.secondary }}>
              Loading imported loads...
            </div>
          ) : loads.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: colors.background.card,
              borderRadius: '12px',
              border: `1px solid ${colors.border.primary}`
            }}>
              <Package size={48} color={colors.text.tertiary} style={{ marginBottom: '16px' }} />
              <h3 style={{ margin: '0 0 8px 0', color: colors.text.primary, fontWeight: 700 }}>
                No {filter !== 'all' ? filter : ''} loads found
              </h3>
              <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
                Import loads from DAT using the Chrome extension
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loads.map(load => (
                <div
                  key={load.id}
                  onClick={() => setSelectedLoad(load)}
                  style={{
                    padding: '16px',
                    background: selectedLoad?.id === load.id ? getStatusBg(load.status) : colors.background.card,
                    border: `2px solid ${selectedLoad?.id === load.id ? getStatusColor(load.status) : colors.border.primary}`,
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '4px 10px',
                        background: getStatusBg(load.status),
                        color: getStatusColor(load.status),
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        {load.status}
                      </span>
                      <span style={{ fontSize: '12px', color: colors.text.tertiary }}>
                        {load.source?.toUpperCase() || 'DAT'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: colors.text.tertiary }}>
                      <Clock size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      {formatTimeAgo(load.imported_at)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <MapPin size={16} color={colors.accent.primary} />
                    <span style={{ fontWeight: 700, color: colors.text.primary }}>
                      {load.origin_city}{load.origin_state ? `, ${load.origin_state}` : ''}
                    </span>
                    <span style={{ color: colors.text.tertiary }}>→</span>
                    <Navigation size={16} color={colors.accent.info} />
                    <span style={{ fontWeight: 700, color: colors.text.primary }}>
                      {load.destination_city}{load.destination_state ? `, ${load.destination_state}` : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {load.distance_miles && (
                      <span style={{ fontSize: '13px', color: colors.text.secondary }}>
                        <strong>{load.distance_miles.toLocaleString()}</strong> mi
                      </span>
                    )}
                    {load.rate && (
                      <span style={{ fontSize: '13px', color: colors.accent.success, fontWeight: 700 }}>
                        {formatCurrency(load.rate)}
                      </span>
                    )}
                    {load.rate_per_mile && (
                      <span style={{ fontSize: '13px', color: colors.text.secondary }}>
                        {formatCurrency(load.rate_per_mile)}/mi
                      </span>
                    )}
                    {load.pickup_date && (
                      <span style={{ fontSize: '13px', color: colors.text.secondary }}>
                        <Calendar size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        {formatDate(load.pickup_date)}
                      </span>
                    )}
                    {load.equipment_type && (
                      <span style={{ fontSize: '13px', color: colors.text.secondary }}>
                        <Truck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        {load.equipment_type}
                      </span>
                    )}
                  </div>

                  {load.company_name && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: colors.text.tertiary }}>
                      {load.company_name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Load Detail Panel */}
        {selectedLoad && (
          <div style={{
            width: '380px',
            flexShrink: 0,
            padding: '20px',
            background: colors.background.card,
            border: `1px solid ${colors.border.primary}`,
            borderRadius: '12px',
            position: 'sticky',
            top: '20px',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
                Load Details
              </h3>
              <button
                onClick={() => setSelectedLoad(null)}
                style={{
                  padding: '6px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: colors.text.secondary
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Route */}
            <div style={{
              padding: '16px',
              background: colors.background.secondary,
              borderRadius: '10px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: colors.accent.primary,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MapPin size={16} color="white" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: colors.text.primary }}>
                    {selectedLoad.origin_city}{selectedLoad.origin_state ? `, ${selectedLoad.origin_state}` : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: colors.text.secondary }}>Origin</div>
                </div>
              </div>
              <div style={{
                marginLeft: '16px',
                borderLeft: `2px dashed ${colors.border.primary}`,
                height: '20px',
                marginBottom: '8px'
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: colors.accent.info,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Navigation size={16} color="white" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: colors.text.primary }}>
                    {selectedLoad.destination_city}{selectedLoad.destination_state ? `, ${selectedLoad.destination_state}` : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: colors.text.secondary }}>Destination</div>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ padding: '12px', background: colors.background.secondary, borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>DISTANCE</div>
                <div style={{ fontWeight: 700, color: colors.text.primary }}>
                  {selectedLoad.distance_miles ? `${selectedLoad.distance_miles.toLocaleString()} mi` : '—'}
                </div>
              </div>
              <div style={{ padding: '12px', background: colors.background.secondary, borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>RATE</div>
                <div style={{ fontWeight: 700, color: colors.accent.success }}>
                  {formatCurrency(selectedLoad.rate)}
                </div>
              </div>
              <div style={{ padding: '12px', background: colors.background.secondary, borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>$/MILE</div>
                <div style={{ fontWeight: 700, color: colors.text.primary }}>
                  {selectedLoad.rate_per_mile ? formatCurrency(selectedLoad.rate_per_mile) : '—'}
                </div>
              </div>
              <div style={{ padding: '12px', background: colors.background.secondary, borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>PICKUP</div>
                <div style={{ fontWeight: 700, color: colors.text.primary }}>
                  {formatDate(selectedLoad.pickup_date)}
                </div>
              </div>
              {selectedLoad.weight_lbs && (
                <div style={{ padding: '12px', background: colors.background.secondary, borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>WEIGHT</div>
                  <div style={{ fontWeight: 700, color: colors.text.primary }}>
                    {selectedLoad.weight_lbs.toLocaleString()} lbs
                  </div>
                </div>
              )}
              {selectedLoad.equipment_type && (
                <div style={{ padding: '12px', background: colors.background.secondary, borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>EQUIPMENT</div>
                  <div style={{ fontWeight: 700, color: colors.text.primary }}>
                    {selectedLoad.equipment_type} {selectedLoad.full_partial}
                  </div>
                </div>
              )}
            </div>

            {/* Company/Contact */}
            {(selectedLoad.company_name || selectedLoad.contact_phone || selectedLoad.contact_email) && (
              <div style={{
                padding: '16px',
                background: colors.background.secondary,
                borderRadius: '10px',
                marginBottom: '16px'
              }}>
                {selectedLoad.company_name && (
                  <div style={{ fontWeight: 700, color: colors.text.primary, marginBottom: '8px' }}>
                    {selectedLoad.company_name}
                  </div>
                )}
                {selectedLoad.credit_score && (
                  <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '8px' }}>
                    Credit Score: <strong style={{ color: selectedLoad.credit_score >= 90 ? colors.accent.success : colors.accent.warning }}>{selectedLoad.credit_score}</strong>
                    {selectedLoad.days_to_pay && <span> · DTP: {selectedLoad.days_to_pay} days</span>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedLoad.contact_phone && (
                    <a
                      href={`tel:${selectedLoad.contact_phone}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: colors.accent.success,
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <Phone size={14} />
                      Call
                    </a>
                  )}
                  {selectedLoad.contact_email && (
                    <a
                      href={`mailto:${selectedLoad.contact_email}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: colors.accent.info,
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <Mail size={14} />
                      Email
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Status Actions */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '8px' }}>UPDATE STATUS</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['available', 'contacted', 'booked', 'dismissed'].map(status => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(selectedLoad.id, status)}
                    disabled={selectedLoad.status === status}
                    style={{
                      padding: '8px 14px',
                      background: selectedLoad.status === status ? getStatusBg(status) : 'transparent',
                      border: `1px solid ${getStatusColor(status)}`,
                      borderRadius: '6px',
                      color: getStatusColor(status),
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: selectedLoad.status === status ? 'default' : 'pointer',
                      opacity: selectedLoad.status === status ? 0.7 : 1,
                      textTransform: 'capitalize'
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={() => handleDelete(selectedLoad.id)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'transparent',
                border: `1px solid ${colors.accent.danger}`,
                borderRadius: '8px',
                color: colors.accent.danger,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Trash2 size={14} />
              Delete Load
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
