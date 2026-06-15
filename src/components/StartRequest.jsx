import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect, useRef } from 'react';
import { Plus, Truck, MapPin, Calendar, RefreshCw, Bell, Mail, Phone } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CityStateInput } from './CityStateInput';
import { FLEET_MODES } from '../utils/fleetModes';
import { generateRequestName } from '../utils/requestName';
import { smsConsentRequired, consentFieldsFor, methodIncludesText } from '../utils/smsConsent';

const today = () => new Date().toISOString().split('T')[0];

export const StartRequest = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fleets, setFleets] = useState([]);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  // Datum typo guard (item 002): null = unchecked, true = geocoded ok, false = couldn't resolve.
  const [datumResolved, setDatumResolved] = useState(null);
  const [searchHomeResolved, setSearchHomeResolved] = useState(null); // #159
  const hasLoadedEditingRequest = useRef(false);

  const [formData, setFormData] = useState({
    requestName: '',
    datumPoint: '',
    selectedFleetId: '',
    equipmentAvailableDate: today(),
    equipmentNeededDate: today(),
    driverHomeBy: '',            // #81: display-only dispatcher signal, optional
    limitWeight: false,          // #158: "Limit Weight?" toggle (UI-only; persisted as null max_weight when off)
    maxWeight: '',               // #158: max load weight in lbs when limitWeight is on
    bypassFleetHome: false,      // #159: substitute the fleet's home with searchHome for this request
    searchHome: '',              // #159: "Search Home" City, ST text
    searchHomeLat: null,         // #159: resolved at verification time, saved to the request
    searchHomeLng: null,
    isRelay: false,
    modes: [],                   // optional request-level transport modes (#36)
    autoRefresh: false,
    autoRefreshInterval: '0.5',  // 30 minutes default
    maxAutoRefreshes: '',        // blank = unlimited (item 006)
    notificationEnabled: false,
    notificationMethod: 'email',   // #140: default Email — SMS is explicit opt-in only
    smsConsent: false,             // #140: standalone SMS opt-in for this request
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
    // Clean up localStorage on unmount so stale edit data never bleeds into a new request
    return () => {
      localStorage.removeItem('editingRequest');
      localStorage.removeItem('editingRequestProcessed');
      localStorage.removeItem('editingRequestIntent');
    };
  }, []);

  const loadEditingRequest = () => {
    const editingRequest = localStorage.getItem('editingRequest');
    const editingIntent = localStorage.getItem('editingRequestIntent');
    console.log('🔍 Checking for editingRequest in localStorage:', editingRequest ? 'Found' : 'Not found');

    // Only load editing data if it was intentionally set (not stale from a previous session)
    if (editingRequest && editingIntent) {
      localStorage.removeItem('editingRequestIntent');
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
          equipmentAvailableDate: request.equipment_available_date || today(),
          equipmentNeededDate: request.equipment_needed_date || today(),
          driverHomeBy: request.driver_home_by || '',
          limitWeight: request.max_weight_lbs != null,         // #158
          maxWeight: request.max_weight_lbs != null ? String(request.max_weight_lbs) : '',
          bypassFleetHome: request.bypass_fleet_home || false, // #159
          searchHome: request.search_home_address || '',
          searchHomeLat: request.search_home_lat ?? null,
          searchHomeLng: request.search_home_lng ?? null,
          isRelay: request.is_relay || false,
          modes: Array.isArray(request.modes) ? request.modes : [],
          autoRefresh: request.auto_refresh || false,
          autoRefreshInterval: String(request.auto_refresh_interval ? (request.auto_refresh_interval / 60) : '0.5'), // Convert minutes to hours
          maxAutoRefreshes: request.max_auto_refreshes != null ? String(request.max_auto_refreshes) : '',
          notificationEnabled: request.notification_enabled || false,
          notificationMethod: request.notification_method || 'email',
          smsConsent: request.sms_consent || false, // #140: re-affirm consent on edit
          editingId: request.id
        };
        
        console.log('📋 Setting form data:', updatedFormData);
        setFormData(updatedFormData);
        // #159: a saved search home already has verified coords — mark resolved so editing
        // doesn't force a re-verify, but require re-verify if the text is changed.
        setSearchHomeResolved(request.bypass_fleet_home && request.search_home_lat != null ? true : null);
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
      // Clear any stale editing data (no intent flag means this is a fresh start)
      if (editingRequest) {
        localStorage.removeItem('editingRequest');
        localStorage.removeItem('editingRequestProcessed');
        console.log('🗑️ Cleared stale editingRequest (no intent flag)');
      }
      console.log('ℹ️ No editingRequest found - creating new request');
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
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      // Auto-refresh is only useful if the user gets notified of material changes,
      // so notifications are mandatory whenever auto-refresh is enabled.
      if (field === 'autoRefresh' && value) {
        next.notificationEnabled = true;
        // #140: auto-refresh turns notifications on but must NOT force SMS — default
        // to Email so consent is never implied. User can still choose Text + opt in.
        if (!next.notificationMethod) next.notificationMethod = 'email';
      }
      return next;
    });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    // #128: request name is optional — auto-generated on save when left blank.
    if (!formData.datumPoint.trim()) newErrors.datumPoint = 'Empty City, ST is required';
    else if (datumResolved === false) newErrors.datumPoint = "We couldn't find that location — check the spelling.";
    if (!formData.selectedFleetId) newErrors.selectedFleetId = 'Please select a fleet';
    // #158: a checked "Limit Weight?" needs a positive number
    if (formData.limitWeight && !(parseInt(formData.maxWeight, 10) > 0)) {
      newErrors.maxWeight = 'Enter a max weight in pounds, or uncheck Limit Weight.';
    }
    // #159: a checked "Bypass Fleet Home" needs a verified search home
    if (formData.bypassFleetHome) {
      if (!formData.searchHome.trim()) newErrors.searchHome = 'Enter a search home, or uncheck Bypass Fleet Home.';
      else if (searchHomeResolved === false || formData.searchHomeLat == null) newErrors.searchHome = "We couldn't find that location — check the spelling.";
    }
    if (!formData.equipmentAvailableDate) newErrors.equipmentAvailableDate = 'Equipment available date is required';
    if (!formData.equipmentNeededDate) newErrors.equipmentNeededDate = 'Equipment needed date is required';
    
    if (formData.equipmentAvailableDate && formData.equipmentNeededDate) {
      const availableDate = new Date(formData.equipmentAvailableDate);
      const neededDate = new Date(formData.equipmentNeededDate);
      if (neededDate < availableDate) {
        newErrors.equipmentNeededDate = 'Needed date must be after available date';
      }
    }

    // #140: texting requires explicit consent; Email stays available so SMS is optional.
    if (smsConsentRequired(formData.notificationEnabled || formData.autoRefresh, formData.notificationMethod) && !formData.smsConsent) {
      newErrors.smsConsent = 'Check the SMS consent box to receive texts, or choose Email.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const refreshCreditLabel = (intervalHours) => {
    const h = parseFloat(intervalHours);
    if (h === 0.25) return { interval: 'every 15 minutes', cost: '4 credits per hour' };
    if (h === 0.5) return { interval: 'every 30 minutes', cost: '2 credits per hour' };
    if (h === 1)   return { interval: 'every 1 hour',     cost: '1 credit per hour' };
    if (h === 4)   return { interval: 'every 4 hours',    cost: '1 credit every 4 hours' };
    return { interval: `every ${h} hours`, cost: `1 credit every ${h} hours` };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (formData.autoRefresh) {
      setShowRefreshConfirm(true);
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    try {
      // #128: auto-generate a name when the user left it blank (unique per user).
      let requestName = formData.requestName.trim();
      if (!requestName) {
        const existing = await db.requests.getAll(user.id).catch(() => []);
        requestName = generateRequestName({
          displayName: user.user_metadata?.full_name || user.email,
          location: formData.datumPoint,
          existingNames: (existing || []).map(r => r.request_name),
        });
      }
      // Prepare request data for database
      const requestData = {
        user_id: user.id,
        fleet_id: formData.selectedFleetId,
        request_name: requestName,
        datum_point: formData.datumPoint,
        equipment_available_date: formData.equipmentAvailableDate,
        equipment_needed_date: formData.equipmentNeededDate,
        driver_home_by: formData.driverHomeBy || null, // #81: display-only, never sent to load boards
        // #158: max load weight (null = no limit, i.e. "Limit Weight?" unchecked)
        max_weight_lbs: formData.limitWeight && parseInt(formData.maxWeight, 10) > 0 ? parseInt(formData.maxWeight, 10) : null,
        // #159: per-request search-home override; coords captured at verification time
        bypass_fleet_home: formData.bypassFleetHome,
        search_home_address: formData.bypassFleetHome ? (formData.searchHome.trim() || null) : null,
        search_home_lat: formData.bypassFleetHome ? formData.searchHomeLat : null,
        search_home_lng: formData.bypassFleetHome ? formData.searchHomeLng : null,
        is_relay: formData.isRelay,
        modes: Array.isArray(formData.modes) && formData.modes.length ? formData.modes : null, // #36
        auto_refresh: formData.autoRefresh,
        auto_refresh_interval: formData.autoRefresh ? Math.round(parseFloat(formData.autoRefreshInterval) * 60) : null, // Store as MINUTES
        // Optional cap on auto-refreshes before self-disabling (null = unlimited); counter resets on save (item 006)
        max_auto_refreshes: formData.autoRefresh && parseInt(formData.maxAutoRefreshes, 10) > 0 ? parseInt(formData.maxAutoRefreshes, 10) : null,
        auto_refresh_count: 0,
        notification_enabled: formData.notificationEnabled || formData.autoRefresh,
        notification_method: (formData.notificationEnabled || formData.autoRefresh) ? (formData.notificationMethod || 'email') : null,
        // #140: record explicit SMS consent (true + timestamp only when Text/Both + checked)
        ...consentFieldsFor({
          notificationEnabled: formData.notificationEnabled || formData.autoRefresh,
          method: formData.notificationMethod,
          consentChecked: formData.smsConsent,
        }),
        status: 'active'
      };

      // Calculate next refresh time if auto-refresh is enabled
      if (formData.autoRefresh) {
        const now = new Date();
        const intervalHours = parseFloat(formData.autoRefreshInterval);
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
        
        alert('Request updated successfully!\n\nRedirecting to Open Requests...');
        
        // Navigate to Open Requests page
        setTimeout(() => {
          onMenuNavigate('open-requests');
        }, 100);
      } else {
        // Create new request
        console.log('Creating new request');
        await db.requests.create(requestData);
        alert('Request created successfully!\n\nRedirecting to Open Requests...');
        
        // Navigate to Open Requests page
        setTimeout(() => {
          onMenuNavigate('open-requests');
        }, 100);
      }
      
      // Reset form
      setFormData({
        requestName: '',
        datumPoint: '',
        selectedFleetId: fleets.length === 1 ? fleets[0].id : '',
        equipmentAvailableDate: today(),
        equipmentNeededDate: today(),
        driverHomeBy: '',
        limitWeight: false,
        maxWeight: '',
        bypassFleetHome: false,
        searchHome: '',
        searchHomeLat: null,
        searchHomeLng: null,
        isRelay: false,
        modes: [],
        autoRefresh: false,
        autoRefreshInterval: '0.5',
        maxAutoRefreshes: '',
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
      <header style={{ padding: 'clamp(12px, 3vw, 24px) clamp(16px, 4vw, 32px)', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 1001 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <HaulMonitorLogo size="medium" />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="start-request" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: 'clamp(12px, 3vw, 24px) clamp(16px, 4vw, 32px)', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>
              {formData.editingId ? 'Edit Backhaul Request' : 'Start Backhaul Request'}
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

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)' }}>
        {fleets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <Truck size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Fleets Available</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              You need to create a fleet before you can start a backhaul request.
            </p>
            <button onClick={() => onMenuNavigate('fleets')} style={{ padding: '14px 28px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              Go to Fleets
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px' }}>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Backhaul Request Name</label>
                <input type="text" value={formData.requestName} onChange={(e) => handleChange('requestName', e.target.value)} disabled={saving} placeholder="Optional — we'll generate one if left blank" style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${errors.requestName ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                {errors.requestName && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.requestName}</div>}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><MapPin size={16} style={{ display: 'inline', marginRight: '6px' }} />Empty City, ST *</label>
                <CityStateInput
                  value={formData.datumPoint}
                  onChange={(v) => { handleChange('datumPoint', v); setDatumResolved(null); }}
                  onResolve={(r) => { const ok = !!r; setDatumResolved(ok); if (ok) setErrors(prev => ({ ...prev, datumPoint: null })); }}
                  disabled={saving}
                  placeholder="City, ST or ZIP (e.g., Charlotte, NC or 28036)"
                  accentColor={colors.accent.primary}
                  inputStyle={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${errors.datumPoint ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                />
                {errors.datumPoint && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.datumPoint}</div>}
                <div style={{ marginTop: '4px', fontSize: '12px', color: colors.text.tertiary }}>Where equipment needs to return from</div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Truck size={16} style={{ display: 'inline', marginRight: '6px' }} />Select Fleet *</label>
                <select value={formData.selectedFleetId} onChange={(e) => handleChange('selectedFleetId', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${errors.selectedFleetId ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none', cursor: 'pointer' }}>
                  <option value="">-- Select a fleet --</option>
                  {fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.name} (MC: {fleet.mc_number || 'N/A'}){fleet.user_id !== user?.id ? ' · shared' : ''}</option>)}
                </select>
                {errors.selectedFleetId && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.selectedFleetId}</div>}
                {selectedFleet && <div style={{ marginTop: '12px', padding: '12px', background: colors.background.tertiary, borderRadius: '8px', fontSize: '13px', color: colors.text.secondary }}><div><strong>Home:</strong> {selectedFleet.home_address}</div>{selectedFleet.mc_number && <div><strong>MC:</strong> {selectedFleet.mc_number}</div>}{selectedFleet.dot_number && <div><strong>DOT:</strong> {selectedFleet.dot_number}</div>}</div>}
              </div>

              <div className="sr-date-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />Begin Pickup Window *</label>
                  <input type="date" value={formData.equipmentAvailableDate} onChange={(e) => handleChange('equipmentAvailableDate', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${errors.equipmentAvailableDate ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                  {errors.equipmentAvailableDate && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.equipmentAvailableDate}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />End Pickup Window *</label>
                  <input type="date" value={formData.equipmentNeededDate} onChange={(e) => handleChange('equipmentNeededDate', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${errors.equipmentNeededDate ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                  {errors.equipmentNeededDate && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.equipmentNeededDate}</div>}
                </div>
                {/* #81: dispatcher-visibility only — not sent to load-board search params */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />Driver Needed Home By</label>
                  <input type="date" value={formData.driverHomeBy} onChange={(e) => handleChange('driverHomeBy', e.target.value)} disabled={saving} style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid \${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none' }} />
                </div>
              </div>

              {/* #158: Limit Weight? — when checked, only loads at/below Max Weight are returned */}
              <div style={{ marginBottom: '16px', padding: '16px', background: colors.background.secondary, borderRadius: '8px', border: `1px solid ${colors.border.accent}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.limitWeight} onChange={(e) => handleChange('limitWeight', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Limit Weight?</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Only show loads at or below a maximum weight</div></div>
                </label>
                <div style={{ marginTop: '12px', marginLeft: '32px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: formData.limitWeight ? colors.text.primary : colors.text.tertiary }}>Max Weight (lbs)</label>
                  <input type="number" min="1" value={formData.maxWeight} onChange={(e) => handleChange('maxWeight', e.target.value)} disabled={saving || !formData.limitWeight} placeholder="e.g. 44000" style={{ width: '200px', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${errors.maxWeight ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none', opacity: formData.limitWeight ? 1 : 0.5 }} />
                  {errors.maxWeight && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.maxWeight}</div>}
                </div>
              </div>

              {/* #159: Bypass Fleet Home — substitute the fleet's home with a Search Home for this request */}
              <div style={{ marginBottom: '16px', padding: '16px', background: colors.background.secondary, borderRadius: '8px', border: `1px solid ${colors.border.accent}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.bypassFleetHome} onChange={(e) => handleChange('bypassFleetHome', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Bypass Fleet Home</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Route to a different home for this request only</div></div>
                </label>
                <div style={{ marginTop: '12px', marginLeft: '32px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: formData.bypassFleetHome ? colors.text.primary : colors.text.tertiary }}>Search Home</label>
                  {formData.bypassFleetHome ? (
                    <>
                      <CityStateInput
                        value={formData.searchHome}
                        onChange={(v) => { handleChange('searchHome', v); setSearchHomeResolved(null); setFormData(prev => ({ ...prev, searchHomeLat: null, searchHomeLng: null })); }}
                        onResolve={(r) => {
                          if (r && r.lat != null && r.lng != null) {
                            setSearchHomeResolved(true);
                            setFormData(prev => ({ ...prev, searchHome: r.label || prev.searchHome, searchHomeLat: r.lat, searchHomeLng: r.lng }));
                            setErrors(prev => ({ ...prev, searchHome: null }));
                          } else {
                            setSearchHomeResolved(false);
                            setFormData(prev => ({ ...prev, searchHomeLat: null, searchHomeLng: null }));
                          }
                        }}
                        disabled={saving}
                        placeholder="City, ST or ZIP (e.g., Charlotte, NC or 28036)"
                        accentColor={colors.accent.primary}
                        inputStyle={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${errors.searchHome ? colors.accent.danger : colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                      />
                      {searchHomeResolved === true && formData.searchHomeLat != null && <div style={{ marginTop: '4px', fontSize: '12px', color: '#22c55e' }}>✓ Location verified</div>}
                      {errors.searchHome && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.searchHome}</div>}
                    </>
                  ) : (
                    <input type="text" disabled value="" placeholder="City, ST" style={{ width: '100%', padding: '12px 16px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', outline: 'none', opacity: 0.5, boxSizing: 'border-box' }} />
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '32px', padding: '16px', background: colors.background.secondary, borderRadius: '8px', border: `1px solid ${colors.border.accent}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.isRelay} onChange={(e) => handleChange('isRelay', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Relay Request</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Enable if this is a relay operation</div></div>
                </label>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                  Modes <span style={{ fontWeight: 400, color: colors.text.tertiary }}>(optional — combined with the fleet's modes for this search)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {FLEET_MODES.map((m) => {
                    const checked = formData.modes.includes(m);
                    return (
                      <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: `1px solid ${checked ? colors.accent.primary : colors.border.accent}`, borderRadius: '8px', background: checked ? `${colors.accent.primary}15` : colors.background.secondary, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', color: colors.text.primary, userSelect: 'none' }}>
                        <input type="checkbox" checked={checked} disabled={saving} onChange={() => handleChange('modes', formData.modes.includes(m) ? formData.modes.filter((x) => x !== m) : [...formData.modes, m])} style={{ cursor: saving ? 'not-allowed' : 'pointer' }} />
                        {m}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ padding: '20px', background: `\${colors.accent.primary}10`, border: `1px solid \${colors.accent.primary}30`, borderRadius: '12px', marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: colors.text.primary, display: 'flex', alignItems: 'center', gap: '8px' }}><RefreshCw size={20} color={colors.accent.primary} />Refresh Options</h3>
                <div style={{ padding: '12px', background: colors.background.card, borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: colors.text.secondary }}>You can manually refresh this request anytime from the Open Requests page</div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '16px' }}>
                  <input type="checkbox" checked={formData.autoRefresh} onChange={(e) => handleChange('autoRefresh', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Enable Auto Refresh</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Automatically refresh and search for updated backhaul data</div></div>
                </label>
                {formData.autoRefresh && (
                  <div style={{ marginLeft: '32px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                      Refresh Interval
                    </label>
                    <select 
                      value={formData.autoRefreshInterval} 
                      onChange={(e) => handleChange('autoRefreshInterval', e.target.value)} 
                      disabled={saving} 
                      style={{ padding: '10px 14px', background: colors.background.secondary, border: `1px solid \${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="0.25">Every 15 Minutes</option>
                      <option value="0.5">Every 30 Minutes</option>
                      <option value="1">Every 1 Hour</option>
                      <option value="4">Every 4 Hours</option>
                    </select>
                    <label style={{ display: 'block', margin: '16px 0 8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                      Stop After (refreshes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={formData.maxAutoRefreshes}
                      onChange={(e) => handleChange('maxAutoRefreshes', e.target.value)}
                      disabled={saving}
                      placeholder="Unlimited"
                      style={{ padding: '10px 14px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', width: '160px' }}
                    />
                    <div style={{ marginTop: '6px', fontSize: '13px', color: colors.text.secondary }}>
                      Leave blank for unlimited. Auto-refresh turns itself off once this many refreshes have run.
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: '20px', background: `\${colors.accent.primary}10`, border: `1px solid \${colors.accent.primary}30`, borderRadius: '12px', marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: colors.text.primary, display: 'flex', alignItems: 'center', gap: '8px' }}><Bell size={20} color={colors.accent.primary} />Notifications</h3>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: formData.autoRefresh ? 'default' : 'pointer', marginBottom: '16px' }}>
                  <input type="checkbox" checked={formData.notificationEnabled || formData.autoRefresh} onChange={(e) => handleChange('notificationEnabled', e.target.checked)} disabled={saving || formData.autoRefresh} style={{ width: '20px', height: '20px', cursor: formData.autoRefresh ? 'not-allowed' : 'pointer', marginTop: '2px' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Enable Notifications</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>{formData.autoRefresh ? 'Required while auto-refresh is on — you\'ll be alerted when the top result changes' : 'Get notified when auto-refresh finds changes in top result'}</div></div>
                </label>
                {(formData.notificationEnabled || formData.autoRefresh) && <div style={{ marginLeft: '32px' }}><label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Notification Method</label><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="radio" name="notificationMethod" value="text" checked={formData.notificationMethod === 'text'} onChange={(e) => handleChange('notificationMethod', e.target.value)} disabled={saving} /><Phone size={16} /><span style={{ fontSize: '14px', color: colors.text.primary }}>Text Message</span></label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="radio" name="notificationMethod" value="email" checked={formData.notificationMethod === 'email'} onChange={(e) => handleChange('notificationMethod', e.target.value)} disabled={saving} /><Mail size={16} /><span style={{ fontSize: '14px', color: colors.text.primary }}>Email</span></label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="radio" name="notificationMethod" value="both" checked={formData.notificationMethod === 'both'} onChange={(e) => handleChange('notificationMethod', e.target.value)} disabled={saving} /><div style={{ display: 'flex', gap: '4px' }}><Phone size={16} /><Mail size={16} /></div><span style={{ fontSize: '14px', color: colors.text.primary }}>Both</span></label></div>{selectedFleet && <div style={{ marginTop: '12px', padding: '10px', background: colors.background.card, borderRadius: '6px', fontSize: '12px', color: colors.text.secondary }}>{formData.notificationMethod !== 'email' && selectedFleet.phone_number && <div>📱 {selectedFleet.phone_number}</div>}{formData.notificationMethod !== 'text' && selectedFleet.email && <div>📧 {selectedFleet.email}</div>}</div>}{methodIncludesText(formData.notificationMethod) && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '13px', color: colors.text.secondary, lineHeight: 1.5 }}>
                      <input type="checkbox" checked={formData.smsConsent} onChange={(e) => handleChange('smsConsent', e.target.checked)} disabled={saving} style={{ marginTop: '3px', flexShrink: 0 }} />
                      <span>I agree to receive recurring SMS text notifications from <strong>Haul Monitor</strong> about backhaul matches for this request, sent to the number on my fleet profile. Message frequency varies. Msg &amp; data rates may apply. Reply <strong>STOP</strong> to cancel, <strong>HELP</strong> for help. See our <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: colors.accent.primary }}>Privacy Policy &amp; SMS Terms</a>.</span>
                    </label>
                    {errors.smsConsent && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.smsConsent}</div>}
                  </div>
                )}</div>}
              </div>

              <button type="submit" disabled={saving} style={{ width: '100%', padding: '16px', background: colors.accent.success, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '16px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Plus size={20} />
                {saving ? (formData.editingId ? 'Updating...' : 'Saving...') : (formData.editingId ? 'Update Backhaul Request' : 'Save Backhaul Request')}
              </button>
            </div>
          </form>
        )}
      </div>

      {showRefreshConfirm && (() => {
        const { interval, cost } = refreshCreditLabel(formData.autoRefreshInterval);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
            onClick={() => setShowRefreshConfirm(false)}>
            <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>🪙</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: colors.text.primary, marginBottom: '10px' }}>Auto-refresh uses credits</div>
              <div style={{ fontSize: '14px', color: colors.text.secondary, lineHeight: 1.65, marginBottom: '24px' }}>
                With auto-refresh set to <strong style={{ color: colors.text.primary }}>{interval}</strong>, this request will consume <strong style={{ color: colors.text.primary }}>{cost}</strong>. Each refresh runs a new search and deducts 1 credit.
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => { setShowRefreshConfirm(false); doSave(); }}
                  disabled={saving}
                  style={{ flex: 1, padding: '12px', background: colors.accent.success, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Yes, save request'}
                </button>
                <button
                  onClick={() => setShowRefreshConfirm(false)}
                  style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${colors.border.primary}`, borderRadius: '8px', color: colors.text.secondary, fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 560px) {
          .sr-date-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};
