import { useTheme } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { User, Plus, Edit, Trash2, Save, X, Truck as TruckIcon, Mail } from '../icons';
import { db, supabase } from '../lib/supabase';

export const DriverManagement = ({ fleetId }) => {
  const { colors } = useTheme();
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    cdlNumber: '',
    cdlState: '',
    assignedTruckId: '',
    status: 'active'
  });

  useEffect(() => {
    if (fleetId) {
      loadData();
    }
  }, [fleetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [driversData, trucksData] = await Promise.all([
        db.drivers.getByFleet(fleetId),
        db.trucks.getByFleet(fleetId)
      ]);
      setDrivers(driversData || []);
      setTrucks(trucksData || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    
    try {
      // Create/update driver record
      const driverData = {
        fleet_id: fleetId,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        cdl_number: formData.cdlNumber,
        cdl_state: formData.cdlState,
        assigned_truck_id: formData.assignedTruckId || null,
        status: formData.status,
        user_id: null // Will be linked after driver confirms email
      };

      if (editing) {
        await db.drivers.update(editing.id, driverData);
        alert('Driver updated successfully!');
      } else {
        await db.drivers.create(driverData);
        alert(
          `Driver created!\n\n` +
          `Next step: Manually invite ${formData.email} via Supabase Dashboard:\n` +
          `1. Go to Authentication > Users\n` +
          `2. Click "Invite User"\n` +
          `3. Enter: ${formData.email}\n` +
          `4. Set role metadata to "driver"\n\n` +
          `The driver will receive a confirmation email and can then log in.`
        );
      }

      await loadData();
      resetForm();
    } catch (err) {
      console.error('Error saving driver:', err);
      alert(err.message || 'Failed to save driver');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (driver) => {
    setEditing(driver);
    setFormData({
      firstName: driver.first_name,
      lastName: driver.last_name,
      email: driver.email || '',
      phone: driver.phone || '',
      cdlNumber: driver.cdl_number || '',
      cdlState: driver.cdl_state || '',
      assignedTruckId: driver.assigned_truck_id || '',
      status: driver.status || 'active'
    });
    setShowForm(true);
  };

  const handleDelete = async (driverId) => {
    if (!window.confirm('Delete this driver? This cannot be undone.')) return;
    
    try {
      await db.drivers.delete(driverId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete driver');
    }
  };

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      cdlNumber: '',
      cdlState: '',
      assignedTruckId: '',
      status: 'active'
    });
  };

  const getAssignedTruck = (truckId) => {
    return trucks.find(t => t.id === truckId);
  };

  if (loading) {
    return <div style={{ padding: '20px', color: colors.text.secondary }}>Loading drivers...</div>;
  }

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: 900,
          color: colors.text.primary,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <User size={28} color="#a855f7" />
          Drivers ({drivers.length})
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={18} />
            Add Driver
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{
          background: 'rgba(168, 85, 247, 0.05)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <h4 style={{
            margin: '0 0 20px 0',
            fontSize: '18px',
            fontWeight: 800,
            color: colors.text.primary
          }}>
            {editing ? 'Edit Driver' : 'Add New Driver'}
          </h4>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              {/* First Name */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  required
                  disabled={creating}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Last Name */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  required
                  disabled={creating}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Email {!editing && '*'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required={!editing}
                  disabled={editing || creating}
                  placeholder={editing ? 'Cannot change email' : 'driver@example.com'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: editing ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: editing ? '#6b7280' : '#e8eaed',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                {!editing && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: colors.text.tertiary }}>
                    Creates driver login & sends confirmation email
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  disabled={creating}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* CDL Number */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  CDL Number
                </label>
                <input
                  type="text"
                  value={formData.cdlNumber}
                  onChange={(e) => setFormData({...formData, cdlNumber: e.target.value})}
                  disabled={creating}
                  placeholder="A1234567"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* CDL State */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  CDL State
                </label>
                <input
                  type="text"
                  value={formData.cdlState}
                  onChange={(e) => setFormData({...formData, cdlState: e.target.value.toUpperCase()})}
                  disabled={creating}
                  placeholder="NC"
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Assigned Truck */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Assigned Truck
                </label>
                <select
                  value={formData.assignedTruckId}
                  onChange={(e) => setFormData({...formData, assignedTruckId: e.target.value})}
                  disabled={creating}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">No truck assigned</option>
                  {trucks.filter(t => t.status === 'active').map(truck => (
                    <option key={truck.id} value={truck.id}>
                      {truck.truck_number} ({truck.trailer_type}, {truck.trailer_length}ft)
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  disabled={creating}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.background.secondary,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: '6px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                </select>
              </div>
            </div>

            {/* Form Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '10px 20px',
                  background: creating ? 'rgba(168, 85, 247, 0.5)' : 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: creating ? 0.7 : 1
                }}
              >
                {creating ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Save size={16} />
                    {editing ? 'Update' : 'Create'} Driver
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={creating}
                style={{
                  padding: '10px 20px',
                  background: colors.background.secondary,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: colors.text.primary,
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Driver List */}
      {drivers.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: colors.background.secondary,
          borderRadius: '12px',
          border: `1px dashed ${colors.border.accent}`
        }}>
          <User size={48} color={colors.text.tertiary} style={{ marginBottom: '16px' }} />
          <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
            No Drivers Yet
          </h4>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
            Add your first driver to start assigning trucks and routes
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {drivers.map((driver) => {
            const assignedTruck = getAssignedTruck(driver.assigned_truck_id);
            return (
              <div
                key={driver.id}
                style={{
                  background: colors.background.card,
                  border: `1px solid ${colors.border.primary}`,
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: colors.text.primary,
                    marginBottom: '8px'
                  }}>
                    {driver.first_name} {driver.last_name}
                    {driver.user_id && (
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 8px',
                        background: `${colors.accent.success}20`,
                        border: `1px solid ${colors.accent.success}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: colors.accent.success,
                        fontWeight: 600
                      }}>
                        <Mail size={10} style={{ display: 'inline', marginRight: '4px' }} />
                        HAS LOGIN
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px', color: colors.text.secondary }}>
                    {driver.email && <span><strong>Email:</strong> {driver.email}</span>}
                    {driver.phone && <span><strong>Phone:</strong> {driver.phone}</span>}
                    {driver.cdl_number && <span><strong>CDL:</strong> {driver.cdl_number} ({driver.cdl_state})</span>}
                    {assignedTruck && (
                      <span style={{ color: colors.accent.primary }}>
                        <TruckIcon size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        <strong>{assignedTruck.truck_number}</strong> ({assignedTruck.trailer_type})
                      </span>
                    )}
                    <span>
                      <strong>Status:</strong>{' '}
                      <span style={{
                        color: driver.status === 'active' ? colors.accent.success : driver.status === 'on_leave' ? colors.accent.warning : colors.text.tertiary
                      }}>
                        {driver.status}
                      </span>
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleEdit(driver)}
                    style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      border: `1px solid ${colors.accent.primary}`,
                      borderRadius: '6px',
                      color: colors.accent.primary,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${colors.accent.primary}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Edit size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(driver.id)}
                    style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      border: `1px solid ${colors.accent.danger}`,
                      borderRadius: '6px',
                      color: colors.accent.danger,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${colors.accent.danger}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
