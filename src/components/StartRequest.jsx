import { useState, useEffect, useRef } from 'react';
import { Plus, Truck, MapPin, Calendar, RefreshCw, Bell, Mail, Phone } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const StartRequest = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fleets, setFleets] = useState([]);
  const hasLoadedEditingRequest = useRef(false);

  const [formData, setFormData] = useState({
    requestName: '',
    datumPoint: '',
    selectedFleetId: '',
    equipmentAvailableDate: '',
    equipmentNeededDate: '',
    isRelay: false,
    autoRefresh: false,
    autoRefreshInterval: '4',
    notificationEnabled: false,
    notificationMethod: 'both',
    editingId: null
  });

  const [errors, setErrors] = useState({});

  // Debug: Track all formData changes
  useEffect(() => {
    console.log('📝 FormData changed:', formData);
    console.trace('📍 Stack trace for formData change:');
  }, [formData]);

  useEffect(() => {
    console.log('🚀 Component mounted, loading data...');
    // Load editing request first (synchronous)
    loadEditingRequest();
    // Then load fleets (async)
    loadFleets();
  }, []);

  const loadEditingRequest = () => {
    const editingRequest = localStorage.getItem('editingRequest');
    console.log('🔍 Checking for editingRequest in localStorage:', editingRequest ? 'Found' : 'Not found');
    
    if (editingRequest) {
      // Check if we've already processed to avoid double-removing
      const alreadyProcessed = localStorage.getItem('editingRequestProcessed');
      
      try {
        const request = JSON.parse(editingRequest);
        console.log('✅ Parsed editing request:', {
          id: request.id,
          name: request.request_name,
          fleetId: request.fleet_id,
          alreadyProcessed: !!alreadyProcessed
        });
        
        // Build the form data object
        const updatedFormData = {
          requestName: request.request_name || '',
          datumPoint: request.datum_point || '',
          selectedFleetId: request.fleet_id || '',
          equipmentAvailableDate: request.equipment_available_date || '',
          equipmentNeededDate: request.equipment_needed_date || '',
          isRelay: request.is_relay || false,
          autoRefresh: request.auto_refresh || false,
          autoRefreshInterval: String(request.auto_refresh_interval || '4'),
          notificationEnabled: request.notification_enabled || false,
          notificationMethod: request.notification_method || 'both',
          editingId: request.id
        };
        
        console.log('📋 Setting form data:', updatedFormData);
        setFormData(updatedFormData);
        console.log('✨ Form data set with editingId:', request.id);
        
        // Mark as processed so we know not to re-load from server
        if (!alreadyProcessed) {
          localStorage.setItem('editingRequestProcessed', 'true');
          console.log('✅ Marked editing request as processed');
        } else {
          console.log('♻️ Reloading editing request from localStorage (remount)');
        }
        
        hasLoadedEditingRequest.current = true;
      } catch (error) {
        console.error('❌ Error loading editing request:', error);
      }
    } else {
      console.log('ℹ️ No editingRequest found in localStorage - creating new request');
    }
  };

  const loadFleets = async () => {
    setLoading(true);
    try {
      const fleetsData = await db.fleets.getAll(user.id);
      setFleets(fleetsData || []);
      console.log('🏢 Loaded fleets:', fleetsData?.length);
      
      // Only auto-select fleet if there's exactly one AND we're not editing
      if (fleetsData && fleetsData.length === 1) {
        setFormData(prev => {
          console.log('🔍 Auto-select check in prev:', {
            editingId: prev.editingId,
            selectedFleetId: prev.selectedFleetId,
            requestName: prev.requestName,
            fullPrev: prev
          });
          
          // If we're editing and already have a fleet selected, don't override
          if (prev.editingId && prev.selectedFleetId) {
            console.log('✋ Skipping auto-select because we\'re editing');
            return prev;
          }
          
          console.log('✅ Auto-selecting single fleet:', fleetsData[0].id);
          return { ...prev, selectedFleetId: fleetsData[0].id };
        });
      } else {
        console.log(`ℹ️ Not auto-selecting (${fleetsData?.length} fleets)`);
      }
    } catch (error) {
      console.error('❌ Error loading fleets:', error);
      setFleets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.requestName.trim()) newErrors.requestName = 'Request name is required';
    if (!formData.datumPoint.trim()) newErrors.datumPoint = 'Datum point is required';
    if (!formData.selectedFleetId) newErrors.selectedFleetId = 'Please select a fleet';
    if (!formData.equipmentAvailableDate) newErrors.equipmentAvailableDate = 'Equipment available date is required';
    if (!formData.equipmentNeededDate) newErrors.equipmentNeededDate = 'Equipment needed date is required';
    
    if (formData.equipmentAvailableDate && formData.equipmentNeededDate) {
      const availableDate = new Date(formData.equipmentAvailableDate);
      const neededDate = new Date(formData.equipmentNeededDate);
      if (neededDate < availableDate) {
        newErrors.equipmentNeededDate = 'Needed date must be after available date';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setSaving(true);
    try {
      // Prepare request data for database
      const requestData = {
        user_id: user.id,
        fleet_id: formData.selectedFleetId,
        request_name: formData.requestName,
        datum_point: formData.datumPoint,
        equipment_available_date: formData.equipmentAvailableDate,
        equipment_needed_date: formData.equipmentNeededDate,
        is_relay: formData.isRelay,
        auto_refresh: formData.autoRefresh,
        auto_refresh_interval: formData.autoRefresh ? parseInt(formData.autoRefreshInterval) : null,
        notification_enabled: formData.notificationEnabled,
        notification_method: formData.notificationEnabled ? formData.notificationMethod : null,
        status: 'active'
      };

      // Calculate next refresh time if auto-refresh is enabled
      if (formData.autoRefresh) {
        const now = new Date();
        const intervalHours = parseInt(formData.autoRefreshInterval);
        const nextRefresh = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
        requestData.next_refresh_at = nextRefresh.toISOString();
      }

      // Save to database - create or update
      console.log('Submitting with editingId:', formData.editingId);
      if (formData.editingId) {
        // Update existing request
        console.log('Updating request:', formData.editingId);
        await db.requests.update(formData.editingId, requestData);
        
        // Clear both editing request keys from localStorage
        localStorage.removeItem('editingRequest');
        localStorage.removeItem('editingRequestProcessed');
        console.log('🗑️ Cleared editing request from localStorage after update');
        
        alert('Request updated successfully!\n\nYou can view it in the Open Requests page.');
      } else {
        // Create new request
        console.log('Creating new request');
        await db.requests.create(requestData);
        alert('Request created successfully!\n\nYou can view and manage it in the Open Requests page.');
      }
      
      // Reset form
      setFormData({
        requestName: '',
        datumPoint: '',
        selectedFleetId: fleets.length === 1 ? fleets[0].id : '',
        equipmentAvailableDate: '',
        equipmentNeededDate: '',
        isRelay: false,
        autoRefresh: false,
        autoRefreshInterval: '4',
        notificationEnabled: false,
        notificationMethod: 'both',
        editingId: null
      });
    } catch (error) {
      console.error('Error saving request:', error);
      alert('Failed to save request: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedFleet = fleets.find(f => f.id === formData.selectedFleetId);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      <header style={{ padding: '24px 32px', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color={colors.accent.primary} strokeWidth={2.5} />
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em', color: colors.accent.primary }}>BACKHAUL</h1>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary, fontWeight: 500, letterSpacing: '0.05em' }}>SMART RETURN ROUTE OPTIMIZATION</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="start-request" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>
              {formData.editingId ? 'Edit Request' : 'Start Request'}
            </h2>
            {formData.editingId && (
              <div style={{ padding: '6px 16px', background: `${colors.accent.primary}20`, border: `2px solid ${colors.accent.primary}`, borderRadius: '20px', fontSize: '14px', fontWeight: 800, color: colors.accent.primary }}>
                EDITING MODE
              </div>
            )}
          </div>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            {formData.editingId ? 'Update your existing backhaul request' : 'Create a new backhaul request for your fleet'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {fleets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <Truck size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Fleets Available</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              You need to create a fleet before you can start a backhaul request.
            </p>
            <button onClick={() => onMenuNavigate('fleets')} style={{ padding: '14px 28px', background: `colors.accent.primary`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              Go to Fleets
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px' }}>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Request Name *</label>
                <input type="text" value={formData.requestName} onChange={(e) => handleChange('requestName', e.target.value)} disabled={saving} placeholder="e.g., Backhaul Request 12/30/2025" style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${errors.requestName ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                {errors.requestName && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.requestName}</div>}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><MapPin size={16} style={{ display: 'inline', marginRight: '6px' }} />Datum Point (Return Location) *</label>
                <input type="text" value={formData.datumPoint} onChange={(e) => handleChange('datumPoint', e.target.value)} disabled={saving} placeholder="City, ST or ZIP (e.g., Charlotte, NC or 28036)" style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${errors.datumPoint ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                {errors.datumPoint && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.datumPoint}</div>}
                <div style={{ marginTop: '4px', fontSize: '12px', color: colors.text.tertiary }}>Where equipment needs to return from</div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Truck size={16} style={{ display: 'inline', marginRight: '6px' }} />Select Fleet *</label>
                <select value={formData.selectedFleetId} onChange={(e) => handleChange('selectedFleetId', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${errors.selectedFleetId ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none', cursor: 'pointer' }}>
                  <option value="">-- Select a fleet --</option>
                  {fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.name} (MC: {fleet.mc_number || 'N/A'})</option>)}
                </select>
                {errors.selectedFleetId && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.selectedFleetId}</div>}
                {selectedFleet && <div style={{ marginTop: '12px', padding: '12px', background: colors.background.tertiary, borderRadius: '8px', fontSize: '13px', color: colors.text.secondary }}><div><strong>Home:</strong> {selectedFleet.home_address}</div>{selectedFleet.mc_number && <div><strong>MC:</strong> {selectedFleet.mc_number}</div>}{selectedFleet.dot_number && <div><strong>DOT:</strong> {selectedFleet.dot_number}</div>}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />Equipment Available *</label>
                  <input type="date" value={formData.equipmentAvailableDate} onChange={(e) => handleChange('equipmentAvailableDate', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${errors.equipmentAvailableDate ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                  {errors.equipmentAvailableDate && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.equipmentAvailableDate}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />Equipment Needed Back *</label>
                  <input type="date" value={formData.equipmentNeededDate} onChange={(e) => handleChange('equipmentNeededDate', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${errors.equipmentNeededDate ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                  {errors.equipmentNeededDate && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.equipmentNeededDate}</div>}
                </div>
              </div>

              <div style={{ marginBottom: '32px', padding: '16px', background: colors.background.secondary, borderRadius: '8px', border: `1px solid \${colors.border.accent}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.isRelay} onChange={(e) => handleChange('isRelay', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Relay Request</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Enable if this is a relay operation</div></div>
                </label>
              </div>

              <div style={{ padding: '20px', background: `\${colors.accent.primary}10`, border: `1px solid \${colors.accent.primary}30`, borderRadius: '12px', marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: colors.text.primary, display: 'flex', alignItems: 'center', gap: '8px' }}><RefreshCw size={20} color={colors.accent.primary} />Refresh Options</h3>
                <div style={{ padding: '12px', background: colors.background.card, borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: colors.text.secondary }}>You can manually refresh this request anytime from the Open Requests page</div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '16px' }}>
                  <input type="checkbox" checked={formData.autoRefresh} onChange={(e) => handleChange('autoRefresh', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Enable Auto Refresh</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Automatically refresh and search for updated backhaul data</div></div>
                </label>
                {formData.autoRefresh && <div style={{ marginLeft: '32px' }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Refresh Interval</label><select value={formData.autoRefreshInterval} onChange={(e) => handleChange('autoRefreshInterval', e.target.value)} disabled={saving} style={{ padding: '10px 14px', background: colors.background.secondary, border: `1px solid \${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', cursor: 'pointer' }}><option value="1">Every 1 Hour</option><option value="4">Every 4 Hours</option></select></div>}
              </div>

              <div style={{ padding: '20px', background: `\${colors.accent.primary}10`, border: `1px solid \${colors.accent.primary}30`, borderRadius: '12px', marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: colors.text.primary, display: 'flex', alignItems: 'center', gap: '8px' }}><Bell size={20} color={colors.accent.primary} />Notifications</h3>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '16px' }}>
                  <input type="checkbox" checked={formData.notificationEnabled} onChange={(e) => handleChange('notificationEnabled', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Enable Notifications</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Get notified when auto-refresh finds changes in top result</div></div>
                </label>
                {formData.notificationEnabled && <div style={{ marginLeft: '32px' }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Notification Method</label><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="radio" name="notificationMethod" value="text" checked={formData.notificationMethod === 'text'} onChange={(e) => handleChange('notificationMethod', e.target.value)} disabled={saving} /><Phone size={16} /><span style={{ fontSize: '14px', color: colors.text.primary }}>Text Message</span></label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="radio" name="notificationMethod" value="email" checked={formData.notificationMethod === 'email'} onChange={(e) => handleChange('notificationMethod', e.target.value)} disabled={saving} /><Mail size={16} /><span style={{ fontSize: '14px', color: colors.text.primary }}>Email</span></label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="radio" name="notificationMethod" value="both" checked={formData.notificationMethod === 'both'} onChange={(e) => handleChange('notificationMethod', e.target.value)} disabled={saving} /><div style={{ display: 'flex', gap: '4px' }}><Phone size={16} /><Mail size={16} /></div><span style={{ fontSize: '14px', color: colors.text.primary }}>Both</span></label></div>{selectedFleet && <div style={{ marginTop: '12px', padding: '10px', background: colors.background.card, borderRadius: '6px', fontSize: '12px', color: colors.text.secondary }}>{formData.notificationMethod !== 'email' && selectedFleet.phone_number && <div>📱 {selectedFleet.phone_number}</div>}{formData.notificationMethod !== 'text' && selectedFleet.email && <div>📧 {selectedFleet.email}</div>}</div>}</div>}
              </div>

              <button type="submit" disabled={saving} style={{ width: '100%', padding: '16px', background: colors.accent.success, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '16px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Plus size={20} />
                {saving ? (formData.editingId ? 'Updating Request...' : 'Creating Request...') : (formData.editingId ? 'Update Request' : 'Create Request')}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
