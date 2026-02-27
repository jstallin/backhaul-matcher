import { useState, useEffect } from 'react';
import { MapPin, Truck, Save, AlertCircle } from '../icons';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const PADD_REGIONS = [
  { value: '', label: 'Select PADD Region' },
  { value: 'national', label: 'National Average' },
  { value: 'east_coast', label: 'PADD 1 - East Coast' },
  { value: 'midwest', label: 'PADD 2 - Midwest' },
  { value: 'gulf_coast', label: 'PADD 3 - Gulf Coast' },
  { value: 'rocky_mountain', label: 'PADD 4 - Rocky Mountain' },
  { value: 'west_coast', label: 'PADD 5 - West Coast' }
];

export const FleetSetup = ({ fleet, onComplete }) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    mcNumber: '',
    dotNumber: '',
    phoneNumber: '',
    email: '',
    homeAddress: '',
    homeLat: '',
    homeLng: ''
  });

  const [rateData, setRateData] = useState({
    revenueSplitCarrier: 20,
    mileageRate: '',
    stopRate: '',
    otherCharge1Name: '',
    otherCharge1Description: '',
    otherCharge1Amount: '',
    otherCharge2Name: '',
    otherCharge2Description: '',
    otherCharge2Amount: '',
    fuelPeg: '',
    fuelMpg: '6.0',
    doePaddRegion: '',
    doePaddRate: '',
    doePaddUpdatedAt: null
  });

  useEffect(() => {
    if (fleet) {
      setFormData({
        name: fleet.name || '',
        mcNumber: fleet.mc_number || '',
        dotNumber: fleet.dot_number || '',
        phoneNumber: fleet.phone_number || '',
        email: fleet.email || '',
        homeAddress: fleet.home_address || '',
        homeLat: fleet.home_lat || '',
        homeLng: fleet.home_lng || ''
      });
      loadFleetProfile(fleet.id);
    } else {
      setFormData({
        name: '',
        mcNumber: '',
        dotNumber: '',
        phoneNumber: '',
        email: '',
        homeAddress: '',
        homeLat: '',
        homeLng: ''
      });
      setRateData({
        revenueSplitCarrier: 20,
        mileageRate: '',
        stopRate: '',
        otherCharge1Name: '',
        otherCharge1Description: '',
        otherCharge1Amount: '',
        otherCharge2Name: '',
        otherCharge2Description: '',
        otherCharge2Amount: '',
        fuelPeg: '',
        fuelMpg: '6.0',
        doePaddRegion: '',
        doePaddRate: '',
        doePaddUpdatedAt: null
      });
    }
  }, [fleet]);

  const loadFleetProfile = async (fleetId) => {
    try {
      const profile = await db.fleetProfiles.get(fleetId);
      if (profile) {
        setRateData({
          revenueSplitCarrier: profile.revenue_split_carrier ?? 20,
          mileageRate: profile.mileage_rate ?? '',
          stopRate: profile.stop_rate ?? '',
          otherCharge1Name: profile.other_charge_1_name ?? '',
          otherCharge1Description: profile.other_charge_1_description ?? '',
          otherCharge1Amount: profile.other_charge_1_amount ?? '',
          otherCharge2Name: profile.other_charge_2_name ?? '',
          otherCharge2Description: profile.other_charge_2_description ?? '',
          otherCharge2Amount: profile.other_charge_2_amount ?? '',
          fuelPeg: profile.fuel_peg ?? '',
          fuelMpg: profile.fuel_mpg ?? '6.0',
          doePaddRegion: profile.doe_padd_region ?? '',
          doePaddRate: profile.doe_padd_rate ?? '',
          doePaddUpdatedAt: profile.doe_padd_updated_at ?? null
        });
      }
    } catch (err) {
      console.error('Error loading fleet profile:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const fleetData = {
        name: formData.name,
        mc_number: formData.mcNumber,
        dot_number: formData.dotNumber,
        phone_number: formData.phoneNumber,
        email: formData.email,
        home_address: formData.homeAddress,
        home_lat: formData.homeLat ? parseFloat(formData.homeLat) : null,
        home_lng: formData.homeLng ? parseFloat(formData.homeLng) : null
      };

      let savedFleetId;

      if (fleet) {
        await db.fleets.update(fleet.id, fleetData);
        savedFleetId = fleet.id;
      } else {
        fleetData.user_id = user.id;
        const newFleet = await db.fleets.create(fleetData);
        savedFleetId = newFleet.id;
      }

      // Save rate configuration to fleet_profiles
      const carrierPct = parseInt(rateData.revenueSplitCarrier) || 80;
      const profileData = {
        revenue_split_carrier: carrierPct,
        revenue_split_customer: 100 - carrierPct,
        mileage_rate: rateData.mileageRate !== '' ? parseFloat(rateData.mileageRate) : null,
        stop_rate: rateData.stopRate !== '' ? parseFloat(rateData.stopRate) : null,
        other_charge_1_name: rateData.otherCharge1Name || null,
        other_charge_1_description: rateData.otherCharge1Description || null,
        other_charge_1_amount: rateData.otherCharge1Amount !== '' ? parseFloat(rateData.otherCharge1Amount) : null,
        other_charge_2_name: rateData.otherCharge2Name || null,
        other_charge_2_description: rateData.otherCharge2Description || null,
        other_charge_2_amount: rateData.otherCharge2Amount !== '' ? parseFloat(rateData.otherCharge2Amount) : null,
        fuel_peg: rateData.fuelPeg !== '' ? parseFloat(rateData.fuelPeg) : null,
        fuel_mpg: rateData.fuelMpg !== '' ? parseFloat(rateData.fuelMpg) : 6.0,
        doe_padd_region: rateData.doePaddRegion || null,
        doe_padd_rate: rateData.doePaddRate !== '' ? parseFloat(rateData.doePaddRate) : null,
        doe_padd_updated_at: rateData.doePaddRate !== '' ? new Date().toISOString() : rateData.doePaddUpdatedAt
      };

      await db.fleetProfiles.update(savedFleetId, profileData);

      setSuccess(true);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to save fleet');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRateChange = (field, value) => {
    setRateData(prev => ({ ...prev, [field]: value }));
  };

  const customerPct = 100 - (parseInt(rateData.revenueSplitCarrier) || 0);

  // Calculate FSC preview
  const fscPreview = rateData.doePaddRate && rateData.fuelPeg && rateData.fuelMpg
    ? ((parseFloat(rateData.doePaddRate) - parseFloat(rateData.fuelPeg)) / parseFloat(rateData.fuelMpg)).toFixed(3)
    : null;

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: colors.background.secondary,
    border: `1px solid ${colors.border.accent}`,
    borderRadius: '8px',
    color: colors.text.primary,
    fontSize: '15px',
    outline: 'none'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: colors.text.primary
  };

  const helperStyle = {
    fontSize: '12px',
    color: colors.text.tertiary,
    marginTop: '4px'
  };

  const sectionHeaderStyle = {
    fontSize: '16px',
    fontWeight: 700,
    color: colors.accent.primary,
    margin: '0 0 4px 0'
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px 20px'
    }}>
      <div style={{
        background: colors.background.card,
        border: `1px solid ${colors.border.primary}`,
        borderRadius: '16px',
        padding: '32px'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            margin: '0 0 8px 0',
            fontSize: '28px',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: colors.text.primary
          }}>
            <Truck size={32} color={colors.accent.primary} />
            {fleet ? 'Edit Fleet Profile' : 'Create Fleet Profile'}
          </h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>
            Set up your fleet information and home base location
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div style={{
            padding: '16px',
            background: `${colors.accent.success}20`,
            border: `1px solid ${colors.accent.success}`,
            borderRadius: '8px',
            color: colors.accent.success,
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            ✓ Fleet profile saved successfully!
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '16px',
            background: `${colors.accent.danger}20`,
            border: `1px solid ${colors.accent.danger}`,
            borderRadius: '8px',
            color: colors.accent.danger,
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Fleet Name */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Fleet Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              disabled={saving}
              placeholder="e.g., Carolina Transport Fleet"
              style={inputStyle}
            />
          </div>

          {/* MC and DOT Numbers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div>
              <label style={labelStyle}>MC Number</label>
              <input
                type="text"
                value={formData.mcNumber}
                onChange={(e) => handleChange('mcNumber', e.target.value)}
                disabled={saving}
                placeholder="MC-123456"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>DOT Number</label>
              <input
                type="text"
                value={formData.dotNumber}
                onChange={(e) => handleChange('dotNumber', e.target.value)}
                disabled={saving}
                placeholder="DOT-123456"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Phone and Email */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div>
              <label style={labelStyle}>Fleet Manager Phone *</label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                required
                disabled={saving}
                placeholder="(555) 123-4567"
                style={inputStyle}
              />
              <div style={helperStyle}>For text notifications</div>
            </div>
            <div>
              <label style={labelStyle}>Fleet Manager Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                required
                disabled={saving}
                placeholder="manager@fleet.com"
                style={inputStyle}
              />
              <div style={helperStyle}>For email notifications</div>
            </div>
          </div>

          {/* Home */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Home (Fleet Base Location) *</label>
            <input
              type="text"
              value={formData.homeAddress}
              onChange={(e) => handleChange('homeAddress', e.target.value)}
              required
              disabled={saving}
              placeholder="e.g., Davidson, NC or 123 Fleet Dr, Davidson, NC 28036"
              style={inputStyle}
            />
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: colors.text.tertiary
            }}>
              This is where your trucks return to after deliveries
            </p>
          </div>

          {/* Coordinates (Optional) */}
          <div style={{ marginBottom: '32px' }}>
            <label style={labelStyle}>Coordinates (Optional)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <input
                type="text"
                value={formData.homeLat}
                onChange={(e) => handleChange('homeLat', e.target.value)}
                disabled={saving}
                placeholder="Latitude (e.g., 35.4993)"
                style={inputStyle}
              />
              <input
                type="text"
                value={formData.homeLng}
                onChange={(e) => handleChange('homeLng', e.target.value)}
                disabled={saving}
                placeholder="Longitude (e.g., -80.8481)"
                style={inputStyle}
              />
            </div>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: colors.text.tertiary
            }}>
              For more accurate routing. You can look these up on Google Maps.
            </p>
          </div>

          {/* ========== RATE CONFIGURATION SECTION ========== */}
          <div style={{
            borderTop: `2px solid ${colors.border.accent}`,
            paddingTop: '32px',
            marginTop: '8px',
            marginBottom: '32px'
          }}>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '22px',
              fontWeight: 800,
              color: colors.text.primary
            }}>
              Rate Configuration
            </h3>
            <p style={{ margin: '0 0 28px 0', color: colors.text.secondary, fontSize: '14px' }}>
              Carrier rate structure used to calculate net revenue on backhaul opportunities
            </p>

            {/* Revenue Split */}
            <div style={{ marginBottom: '28px' }}>
              <h4 style={sectionHeaderStyle}>Revenue Split</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: colors.text.tertiary }}>
                Percentage of gross backhaul revenue allocated to each party
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px'
              }}>
                <div>
                  <label style={labelStyle}>Carrier %</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    value={rateData.revenueSplitCarrier}
                    onChange={(e) => handleRateChange('revenueSplitCarrier', e.target.value)}
                    disabled={saving}
                    placeholder="80"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Customer %</label>
                  <div style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    background: `${colors.background.secondary}80`,
                    color: colors.text.secondary,
                    fontWeight: 600
                  }}>
                    {customerPct > 0 && customerPct < 100 ? customerPct : '—'}%
                  </div>
                  <div style={helperStyle}>Auto-calculated complement</div>
                </div>
              </div>
            </div>

            {/* Mileage & Stop Rates */}
            <div style={{ marginBottom: '28px' }}>
              <h4 style={sectionHeaderStyle}>Mileage & Stop Rates</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: colors.text.tertiary }}>
                Rates carrier charges customer per mile and per stop
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px'
              }}>
                <div>
                  <label style={labelStyle}>Mileage Rate ($/mile)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateData.mileageRate}
                    onChange={(e) => handleRateChange('mileageRate', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 2.00"
                    style={inputStyle}
                  />
                  <div style={helperStyle}>Rate per mile, loaded and empty</div>
                </div>
                <div>
                  <label style={labelStyle}>Stop Rate ($/stop)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateData.stopRate}
                    onChange={(e) => handleRateChange('stopRate', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 50.00"
                    style={inputStyle}
                  />
                  <div style={helperStyle}>Rate per stop on the backhaul route</div>
                </div>
              </div>
            </div>

            {/* Other Charges */}
            <div style={{ marginBottom: '28px' }}>
              <h4 style={sectionHeaderStyle}>Other Charges</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: colors.text.tertiary }}>
                For specific charges to your customer beyond standard rates
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px',
                marginBottom: '12px'
              }}>
                <div>
                  <label style={labelStyle}>Charge 1 Name</label>
                  <input
                    type="text"
                    value={rateData.otherCharge1Name}
                    onChange={(e) => handleRateChange('otherCharge1Name', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., Detention fee"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: colors.text.tertiary }}>(25 chars)</span></label>
                  <input
                    type="text"
                    maxLength={25}
                    value={rateData.otherCharge1Description}
                    onChange={(e) => handleRateChange('otherCharge1Description', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 2+ hr wait time"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateData.otherCharge1Amount}
                    onChange={(e) => handleRateChange('otherCharge1Amount', e.target.value)}
                    disabled={saving}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px'
              }}>
                <div>
                  <label style={labelStyle}>Charge 2 Name</label>
                  <input
                    type="text"
                    value={rateData.otherCharge2Name}
                    onChange={(e) => handleRateChange('otherCharge2Name', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., Lumper fee"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: colors.text.tertiary }}>(25 chars)</span></label>
                  <input
                    type="text"
                    maxLength={25}
                    value={rateData.otherCharge2Description}
                    onChange={(e) => handleRateChange('otherCharge2Description', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., Unloading assist"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateData.otherCharge2Amount}
                    onChange={(e) => handleRateChange('otherCharge2Amount', e.target.value)}
                    disabled={saving}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Fuel Surcharge */}
            <div style={{ marginBottom: '8px' }}>
              <h4 style={sectionHeaderStyle}>Fuel Surcharge</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: colors.text.tertiary }}>
                FSC per mile = (DOE PADD Rate - PEG) / MPG
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <div>
                  <label style={labelStyle}>PEG ($/gal)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={rateData.fuelPeg}
                    onChange={(e) => handleRateChange('fuelPeg', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 1.200"
                    style={inputStyle}
                  />
                  <div style={helperStyle}>Fuel cost per gallon already included in your mileage rate</div>
                </div>
                <div>
                  <label style={labelStyle}>MPG</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    step="0.1"
                    value={rateData.fuelMpg}
                    onChange={(e) => handleRateChange('fuelMpg', e.target.value)}
                    disabled={saving}
                    placeholder="6.0"
                    style={inputStyle}
                  />
                  <div style={helperStyle}>Contractual miles per gallon (typically 6-8)</div>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <div>
                  <label style={labelStyle}>PADD Region</label>
                  <select
                    value={rateData.doePaddRegion}
                    onChange={(e) => handleRateChange('doePaddRegion', e.target.value)}
                    disabled={saving}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
                      appearance: 'auto'
                    }}
                  >
                    {PADD_REGIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>DOE PADD Rate ($/gal)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={rateData.doePaddRate}
                    onChange={(e) => handleRateChange('doePaddRate', e.target.value)}
                    disabled={saving}
                    placeholder="e.g., 3.736"
                    style={inputStyle}
                  />
                  <div style={helperStyle}>
                    Current diesel price from{' '}
                    <a
                      href="https://www.eia.gov/petroleum/gasdiesel/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: colors.accent.primary }}
                    >
                      EIA.gov
                    </a>
                    {rateData.doePaddUpdatedAt && (
                      <span> — Last updated: {new Date(rateData.doePaddUpdatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* FSC Preview */}
              {fscPreview && parseFloat(fscPreview) > 0 && (
                <div style={{
                  padding: '12px 16px',
                  background: `${colors.accent.primary}10`,
                  border: `1px solid ${colors.accent.primary}30`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: colors.text.primary
                }}>
                  <strong>Fuel Surcharge:</strong> ${fscPreview}/mile
                  <span style={{ color: colors.text.secondary, marginLeft: '12px' }}>
                    ({rateData.doePaddRate} - {rateData.fuelPeg}) / {rateData.fuelMpg} = ${fscPreview}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              padding: '16px',
              background: saving ? `${colors.accent.primary}80` : colors.accent.primary,
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s'
            }}
          >
            <Save size={20} />
            {saving ? 'Saving...' : fleet ? 'Update Fleet Profile' : 'Create Fleet Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};
