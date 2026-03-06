import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect, useRef } from 'react';
import { Plus, Truck, MapPin, Calendar, TrendingUp, DollarSign } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const StartEstimateRequest = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fleets, setFleets] = useState([]);

  const [formData, setFormData] = useState({
    editingId: null,
    requestName: '',
    datumPoint: '',
    selectedFleetId: '',
    equipmentAvailableDate: '',
    equipmentNeededDate: '',
    isRelay: false,
    annualVolume: '',
    minNetCredit: '',
  });

  const [errors, setErrors] = useState({});
  const hasLoadedEditingRequest = useRef(false);

  useEffect(() => {
    loadEditingRequest();
    loadFleets();
  }, []);

  const loadEditingRequest = () => {
    const stored = localStorage.getItem('editingEstimateRequest');
    if (!stored || hasLoadedEditingRequest.current) return;
    try {
      const request = JSON.parse(stored);
      // Clear immediately so navigating back to this page later starts a fresh form
      localStorage.removeItem('editingEstimateRequest');
      setFormData({
        editingId: request.id,
        requestName: request.request_name || '',
        datumPoint: request.datum_point || '',
        selectedFleetId: request.fleet_id || '',
        equipmentAvailableDate: request.equipment_available_date ? request.equipment_available_date.split('T')[0] : '',
        equipmentNeededDate: request.equipment_needed_date ? request.equipment_needed_date.split('T')[0] : '',
        isRelay: request.is_relay || false,
        annualVolume: request.annual_volume != null ? String(request.annual_volume) : '',
        minNetCredit: request.min_net_credit != null ? String(request.min_net_credit) : '',
      });
      hasLoadedEditingRequest.current = true;
    } catch (error) {
      console.error('Error loading editing estimate request:', error);
    }
  };

  const loadFleets = async () => {
    setLoading(true);
    try {
      const fleetsData = await db.fleets.getAll(user.id);
      setFleets(fleetsData || []);
      if (fleetsData && fleetsData.length === 1) {
        setFormData(prev => ({ ...prev, selectedFleetId: fleetsData[0].id }));
      }
    } catch (error) {
      console.error('Error loading fleets:', error);
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
      if (new Date(formData.equipmentNeededDate) < new Date(formData.equipmentAvailableDate)) {
        newErrors.equipmentNeededDate = 'Needed date must be after available date';
      }
    }
    if (formData.annualVolume !== '' && (isNaN(formData.annualVolume) || parseInt(formData.annualVolume) < 1)) {
      newErrors.annualVolume = 'Annual volume must be a positive number';
    }
    if (formData.minNetCredit !== '' && (isNaN(formData.minNetCredit) || parseFloat(formData.minNetCredit) < 0)) {
      newErrors.minNetCredit = 'Minimum net credit must be a positive amount';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    try {
      const requestData = {
        fleet_id: formData.selectedFleetId,
        request_name: formData.requestName,
        datum_point: formData.datumPoint,
        equipment_available_date: formData.equipmentAvailableDate,
        equipment_needed_date: formData.equipmentNeededDate,
        is_relay: formData.isRelay,
        annual_volume: formData.annualVolume !== '' ? parseInt(formData.annualVolume) : null,
        min_net_credit: formData.minNetCredit !== '' ? parseFloat(formData.minNetCredit) : null,
      };

      if (formData.editingId) {
        await db.estimateRequests.update(formData.editingId, requestData);
        alert('Estimate Request updated successfully!');
        onMenuNavigate('open-estimate-requests');
      } else {
        await db.estimateRequests.create({ ...requestData, user_id: user.id, status: 'active' });
        alert('Estimate Request created successfully!');
        setFormData({
          editingId: null,
          requestName: '',
          datumPoint: '',
          selectedFleetId: fleets.length === 1 ? fleets[0].id : '',
          equipmentAvailableDate: '',
          equipmentNeededDate: '',
          isRelay: false,
          annualVolume: '',
          minNetCredit: '',
        });
      }
    } catch (error) {
      console.error('Error saving estimate request:', error);
      alert('Failed to save estimate request: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedFleet = fleets.find(f => f.id === formData.selectedFleetId);

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: colors.background.secondary,
    borderRadius: '8px',
    color: colors.text.primary,
    fontSize: '15px',
    outline: 'none',
  };

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
          <HaulMonitorLogo size="medium" />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="start-estimate-request" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>
            {formData.editingId ? 'Edit Estimate Request' : 'Create Estimate Request'}
          </h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            {formData.editingId ? 'Update the details for this estimate request' : 'Create a new estimate request to project revenue and costs for a route'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {fleets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: colors.background.card, borderRadius: '16px', border: `1px solid ${colors.border.primary}` }}>
            <Truck size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
            <h3 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 800, color: colors.text.primary }}>No Fleets Available</h3>
            <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '15px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              You need to create a fleet before you can create an estimate request.
            </p>
            <button onClick={() => onMenuNavigate('fleets')} style={{ padding: '14px 28px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              Go to Fleets
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px' }}>

              {/* Request Name */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Estimate Request Name *</label>
                <input type="text" value={formData.requestName} onChange={(e) => handleChange('requestName', e.target.value)} disabled={saving} placeholder="e.g., Estimate Request 03/05/2026" style={{ ...inputStyle, border: `1px solid ${errors.requestName ? colors.accent.danger : colors.border.accent}` }} />
                {errors.requestName && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.requestName}</div>}
              </div>

              {/* Datum Point */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><MapPin size={16} style={{ display: 'inline', marginRight: '6px' }} />Datum Point (Return Location) *</label>
                <input type="text" value={formData.datumPoint} onChange={(e) => handleChange('datumPoint', e.target.value)} disabled={saving} placeholder="City, ST or ZIP (e.g., Charlotte, NC or 28036)" style={{ ...inputStyle, border: `1px solid ${errors.datumPoint ? colors.accent.danger : colors.border.accent}` }} />
                {errors.datumPoint && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.datumPoint}</div>}
                <div style={{ marginTop: '4px', fontSize: '12px', color: colors.text.tertiary }}>Where equipment needs to return from</div>
              </div>

              {/* Select Fleet */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Truck size={16} style={{ display: 'inline', marginRight: '6px' }} />Select Fleet *</label>
                <select value={formData.selectedFleetId} onChange={(e) => handleChange('selectedFleetId', e.target.value)} disabled={saving} style={{ ...inputStyle, border: `1px solid ${errors.selectedFleetId ? colors.accent.danger : colors.border.accent}`, cursor: 'pointer' }}>
                  <option value="">-- Select a fleet --</option>
                  {fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.name} (MC: {fleet.mc_number || 'N/A'})</option>)}
                </select>
                {errors.selectedFleetId && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.selectedFleetId}</div>}
                {selectedFleet && <div style={{ marginTop: '12px', padding: '12px', background: colors.background.tertiary, borderRadius: '8px', fontSize: '13px', color: colors.text.secondary }}><div><strong>Home:</strong> {selectedFleet.home_address}</div>{selectedFleet.mc_number && <div><strong>MC:</strong> {selectedFleet.mc_number}</div>}{selectedFleet.dot_number && <div><strong>DOT:</strong> {selectedFleet.dot_number}</div>}</div>}
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />Equipment Available *</label>
                  <input type="date" value={formData.equipmentAvailableDate} onChange={(e) => handleChange('equipmentAvailableDate', e.target.value)} disabled={saving} style={{ ...inputStyle, border: `1px solid ${errors.equipmentAvailableDate ? colors.accent.danger : colors.border.accent}` }} />
                  {errors.equipmentAvailableDate && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.equipmentAvailableDate}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}><Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />Equipment Needed Back *</label>
                  <input type="date" value={formData.equipmentNeededDate} onChange={(e) => handleChange('equipmentNeededDate', e.target.value)} disabled={saving} style={{ ...inputStyle, border: `1px solid ${errors.equipmentNeededDate ? colors.accent.danger : colors.border.accent}` }} />
                  {errors.equipmentNeededDate && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.equipmentNeededDate}</div>}
                </div>
              </div>

              {/* Estimate-specific fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', padding: '20px', background: `${colors.accent.primary}08`, border: `1px solid ${colors.accent.primary}30`, borderRadius: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                    <TrendingUp size={16} style={{ display: 'inline', marginRight: '6px' }} />Annual Volume
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.annualVolume}
                    onChange={(e) => handleChange('annualVolume', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 52"
                    style={{ ...inputStyle, border: `1px solid ${errors.annualVolume ? colors.accent.danger : colors.border.accent}` }}
                  />
                  {errors.annualVolume && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.annualVolume}</div>}
                  <div style={{ marginTop: '4px', fontSize: '12px', color: colors.text.tertiary }}>Estimated number of loads per year</div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                    <DollarSign size={16} style={{ display: 'inline', marginRight: '6px' }} />Minimum Net Credit
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minNetCredit}
                    onChange={(e) => handleChange('minNetCredit', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 500.00"
                    style={{ ...inputStyle, border: `1px solid ${errors.minNetCredit ? colors.accent.danger : colors.border.accent}` }}
                  />
                  {errors.minNetCredit && <div style={{ marginTop: '4px', fontSize: '13px', color: colors.accent.danger }}>{errors.minNetCredit}</div>}
                  <div style={{ marginTop: '4px', fontSize: '12px', color: colors.text.tertiary }}>Minimum acceptable net credit per load ($)</div>
                </div>
              </div>

              {/* Relay */}
              <div style={{ marginBottom: '24px', padding: '16px', background: colors.background.secondary, borderRadius: '8px', border: `1px solid ${colors.border.accent}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.isRelay} onChange={(e) => handleChange('isRelay', e.target.checked)} disabled={saving} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  <div><div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>Relay Request</div><div style={{ fontSize: '13px', color: colors.text.secondary }}>Enable if this is a relay operation</div></div>
                </label>
              </div>

              {/* Submit */}
              <button type="submit" disabled={saving} style={{ width: '100%', padding: '16px', background: colors.accent.success, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '16px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <Plus size={20} />
                {saving ? (formData.editingId ? 'Saving...' : 'Creating Estimate Request...') : (formData.editingId ? 'Save Changes' : 'Create Estimate Request')}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
