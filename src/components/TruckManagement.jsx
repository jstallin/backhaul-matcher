import { useTheme } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { Truck, Plus, Edit, Trash2, Save, X } from '../icons';
import { db } from '../lib/supabase';

export const TruckManagement = ({ fleetId }) => {
  const { colors } = useTheme();
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    truckNumber: '',
    trailerType: 'Dry Van',
    trailerLength: 53,
    weightLimit: 45000,
    doorType: 'Swing',
    status: 'active'
  });

  useEffect(() => {
    if (fleetId) {
      loadTrucks();
    }
  }, [fleetId]);

  const loadTrucks = async () => {
    setLoading(true);
    try {
      const data = await db.trucks.getByFleet(fleetId);
      setTrucks(data || []);
    } catch (err) {
      console.error('Error loading trucks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const truckData = {
        fleet_id: fleetId,
        truck_number: formData.truckNumber,
        trailer_type: formData.trailerType,
        trailer_length: parseInt(formData.trailerLength),
        weight_limit: parseInt(formData.weightLimit),
        door_type: formData.doorType,
        status: formData.status
      };

      if (editing) {
        await db.trucks.update(editing.id, truckData);
      } else {
        await db.trucks.create(truckData);
      }

      await loadTrucks();
      resetForm();
    } catch (err) {
      alert(err.message || 'Failed to save truck');
    }
  };

  const handleEdit = (truck) => {
    setEditing(truck);
    setFormData({
      truckNumber: truck.truck_number,
      trailerType: truck.trailer_type,
      trailerLength: truck.trailer_length,
      weightLimit: truck.weight_limit,
      doorType: truck.door_type || 'Swing',
      status: truck.status || 'active'
    });
    setShowForm(true);
  };

  const handleDelete = async (truckId) => {
    if (!window.confirm('Delete this truck? This cannot be undone.')) return;
    
    try {
      await db.trucks.delete(truckId);
      await loadTrucks();
    } catch (err) {
      alert(err.message || 'Failed to delete truck');
    }
  };

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setFormData({
      truckNumber: '',
      trailerType: 'Dry Van',
      trailerLength: 53,
      weightLimit: 45000,
      doorType: 'Swing',
      status: 'active'
    });
  };

  if (loading) {
    return <div style={{ padding: '20px', color: colors.text.secondary }}>Loading trucks...</div>;
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
          <Truck size={28} color="#00d4ff" />
          Truck Fleet ({trucks.length})
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)',
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
            Add Truck
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{
          background: 'rgba(0, 212, 255, 0.05)',
          border: '1px solid rgba(0, 212, 255, 0.2)',
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
            {editing ? 'Edit Truck' : 'Add New Truck'}
          </h4>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              {/* Truck Number */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Truck Number *
                </label>
                <input
                  type="text"
                  value={formData.truckNumber}
                  onChange={(e) => setFormData({...formData, truckNumber: e.target.value})}
                  required
                  placeholder="TRUCK-001"
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

              {/* Trailer Type */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Trailer Type *
                </label>
                <select
                  value={formData.trailerType}
                  onChange={(e) => setFormData({...formData, trailerType: e.target.value})}
                  required
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
                  <option value="Dry Van">Dry Van</option>
                  <option value="Reefer">Reefer</option>
                  <option value="Flatbed">Flatbed</option>
                  <option value="Step Deck">Step Deck</option>
                  <option value="Lowboy">Lowboy</option>
                  <option value="Tanker">Tanker</option>
                </select>
              </div>

              {/* Trailer Length */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Length (ft) *
                </label>
                <input
                  type="number"
                  value={formData.trailerLength}
                  onChange={(e) => setFormData({...formData, trailerLength: e.target.value})}
                  required
                  min="20"
                  max="60"
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

              {/* Weight Limit */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Weight Limit (lbs) *
                </label>
                <input
                  type="number"
                  value={formData.weightLimit}
                  onChange={(e) => setFormData({...formData, weightLimit: e.target.value})}
                  required
                  min="10000"
                  max="80000"
                  step="1000"
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

              {/* Door Type */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                  Door Type
                </label>
                <select
                  value={formData.doorType}
                  onChange={(e) => setFormData({...formData, doorType: e.target.value})}
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
                  <option value="Swing">Swing</option>
                  <option value="Roll">Roll</option>
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
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {/* Form Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)',
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
                <Save size={16} />
                {editing ? 'Update' : 'Add'} Truck
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '10px 20px',
                  background: colors.background.secondary,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: colors.text.primary,
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
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

      {/* Truck List */}
      {trucks.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: colors.background.secondary,
          borderRadius: '12px',
          border: `1px dashed ${colors.border.accent}`
        }}>
          <Truck size={48} color={colors.text.tertiary} style={{ marginBottom: '16px' }} />
          <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: colors.text.primary }}>
            No Trucks Yet
          </h4>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
            Add your first truck to start managing your fleet
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {trucks.map((truck) => (
            <div
              key={truck.id}
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
                  marginBottom: '8px',
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {truck.truck_number}
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px', color: colors.text.secondary }}>
                  <span><strong>Type:</strong> {truck.trailer_type}</span>
                  <span><strong>Length:</strong> {truck.trailer_length} ft</span>
                  <span><strong>Weight:</strong> {truck.weight_limit.toLocaleString()} lbs</span>
                  <span><strong>Doors:</strong> {truck.door_type}</span>
                  <span>
                    <strong>Status:</strong>{' '}
                    <span style={{
                      color: truck.status === 'active' ? colors.accent.success : truck.status === 'maintenance' ? colors.accent.warning : colors.text.tertiary
                    }}>
                      {truck.status}
                    </span>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleEdit(truck)}
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
                  onClick={() => handleDelete(truck.id)}
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
          ))}
        </div>
      )}
    </div>
  );
};
