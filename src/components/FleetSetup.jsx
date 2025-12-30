import { useState, useEffect } from 'react';
import { MapPin, Truck, Save, AlertCircle } from '../icons';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const FleetSetup = ({ fleet, onComplete }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    mcNumber: '',
    dotNumber: '',
    homeAddress: '',
    homeLat: '',
    homeLng: ''
  });

  useEffect(() => {
    // Populate form if editing existing fleet
    if (fleet) {
      setFormData({
        name: fleet.name || '',
        mcNumber: fleet.mc_number || '',
        dotNumber: fleet.dot_number || '',
        homeAddress: fleet.home_address || '',
        homeLat: fleet.home_lat || '',
        homeLng: fleet.home_lng || ''
      });
    } else {
      // Reset form for new fleet
      setFormData({
        name: '',
        mcNumber: '',
        dotNumber: '',
        homeAddress: '',
        homeLat: '',
        homeLng: ''
      });
    }
  }, [fleet]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const fleetData = {
        name: formData.name,
        mc_number: formData.mcNumber,
        dot_number: formData.dotNumber,
        home_address: formData.homeAddress,
        home_lat: formData.homeLat ? parseFloat(formData.homeLat) : null,
        home_lng: formData.homeLng ? parseFloat(formData.homeLng) : null
      };

      if (fleet) {
        // Update existing fleet
        await db.fleets.update(fleet.id, fleetData);
      } else {
        // Create new fleet
        fleetData.user_id = user.id;
        await db.fleets.create(fleetData);
      }

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

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px 20px'
    }}>
      <div style={{
        background: 'rgba(26, 31, 58, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '32px',
        backdropFilter: 'blur(10px)'
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
            color: '#e8eaed'
          }}>
            <Truck size={32} color="#ff6b35" />
            {fleet ? 'Edit Fleet Profile' : 'Create Fleet Profile'}
          </h2>
          <p style={{ margin: 0, color: '#8b92a7', fontSize: '15px' }}>
            Set up your fleet information and home base location
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div style={{
            padding: '16px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            color: '#6ee7b7',
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
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#fca5a5',
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
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#e8eaed'
            }}>
              Fleet Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              disabled={saving}
              placeholder="e.g., Carolina Transport Fleet"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#e8eaed',
                fontSize: '15px',
                outline: 'none'
              }}
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
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#e8eaed'
              }}>
                MC Number
              </label>
              <input
                type="text"
                value={formData.mcNumber}
                onChange={(e) => handleChange('mcNumber', e.target.value)}
                disabled={saving}
                placeholder="MC-123456"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#e8eaed',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#e8eaed'
              }}>
                DOT Number
              </label>
              <input
                type="text"
                value={formData.dotNumber}
                onChange={(e) => handleChange('dotNumber', e.target.value)}
                disabled={saving}
                placeholder="DOT-123456"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#e8eaed',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Home Address */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#e8eaed'
            }}>
              Home Base Address *
            </label>
            <input
              type="text"
              value={formData.homeAddress}
              onChange={(e) => handleChange('homeAddress', e.target.value)}
              required
              disabled={saving}
              placeholder="e.g., Davidson, NC or 123 Fleet Dr, Davidson, NC 28036"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#e8eaed',
                fontSize: '15px',
                outline: 'none'
              }}
            />
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: '#6b7280'
            }}>
              This is where your trucks return to after deliveries
            </p>
          </div>

          {/* Coordinates (Optional) */}
          <div style={{ marginBottom: '32px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#e8eaed'
            }}>
              Coordinates (Optional)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <input
                type="text"
                value={formData.homeLat}
                onChange={(e) => handleChange('homeLat', e.target.value)}
                disabled={saving}
                placeholder="Latitude (e.g., 35.4993)"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#e8eaed',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
              <input
                type="text"
                value={formData.homeLng}
                onChange={(e) => handleChange('homeLng', e.target.value)}
                disabled={saving}
                placeholder="Longitude (e.g., -80.8481)"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#e8eaed',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: '#6b7280'
            }}>
              For more accurate routing. You can look these up on Google Maps.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              padding: '16px',
              background: saving ? 'rgba(255, 107, 53, 0.5)' : 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
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
