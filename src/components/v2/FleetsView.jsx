import { useState, useEffect } from 'react';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../styles/tokens.v2';
import { useMobile } from '../../hooks/useMobile';
import { geocodeAddress } from '../../utils/pcMilerClient';
import { buildFleetPayload } from '../../utils/buildFleetPayload';
import { Plus, Truck, User, Edit, Trash2, CheckCircle, MapPin, Save, AlertCircle } from '../../icons';

const t = tokens;

// ─── Design primitives ────────────────────────────────────────────────────────

const inputBase = {
  padding: '8px 12px',
  border: `1px solid ${t.colors.border.default}`,
  borderRadius: t.radius.lg,
  fontSize: t.font.size.base,
  color: t.colors.text.primary,
  background: '#fff',
  outline: 'none',
  fontFamily: t.font.family,
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

function Input({ value, onChange, placeholder, type = 'text', disabled, min, max, step, onBlur }) {
  return (
    <input
      type={type} value={value ?? ''} placeholder={placeholder}
      disabled={disabled} min={min} max={max} step={step}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onFocus={(e) => { e.target.style.borderColor = t.colors.accent.blue; }}
      onBlurCapture={(e) => { e.target.style.borderColor = t.colors.border.default; }}
      style={{ ...inputBase, background: disabled ? t.colors.page.bg : '#fff', cursor: disabled ? 'not-allowed' : 'text' }}
    />
  );
}

function SelectInput({ value, onChange, options, disabled }) {
  return (
    <select
      value={value ?? ''} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, background: disabled ? t.colors.page.bg : '#fff', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <option value="">Select…</option>
      {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

function Field({ label, required, hint, children, span = 1 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <label style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.secondary }}>
        {label}{required && <span style={{ color: t.colors.accent.red, marginLeft: '3px' }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{hint}</div>}
    </div>
  );
}

function FormGrid({ children, cols = 2 }) {
  const isMobile = useMobile();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${cols}, 1fr)`, gap: '14px 20px' }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '20px 0 12px' }}>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, loading: isLoading, style = {} }) {
  return (
    <button
      onClick={onClick} disabled={disabled || isLoading}
      style={{ padding: '9px 20px', background: (disabled || isLoading) ? t.colors.border.default : t.colors.accent.blue, border: 'none', borderRadius: t.radius.lg, color: (disabled || isLoading) ? t.colors.text.muted : '#fff', fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, cursor: (disabled || isLoading) ? 'not-allowed' : 'pointer', fontFamily: t.font.family, display: 'flex', alignItems: 'center', gap: '6px', ...style }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, danger, style = {} }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${danger ? t.colors.accent.red + '60' : t.colors.border.default}`, borderRadius: t.radius.lg, color: danger ? t.colors.accent.red : t.colors.text.secondary, fontSize: t.font.size.sm, fontWeight: t.font.weight.medium, cursor: 'pointer', fontFamily: t.font.family, display: 'flex', alignItems: 'center', gap: '5px', ...style }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:      { color: t.colors.status.active, bg: t.colors.accent.greenLight, label: 'Active' },
    maintenance: { color: t.colors.accent.amber,  bg: t.colors.accent.amberLight, label: 'Maintenance' },
    inactive:    { color: t.colors.text.muted,    bg: t.colors.page.bg,           label: 'Inactive' },
    on_leave:    { color: t.colors.accent.amber,  bg: t.colors.accent.amberLight, label: 'On Leave' },
  };
  const s = map[status] ?? map.inactive;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: t.radius.full, background: s.bg, color: s.color, fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: t.colors.accent.redLight, border: `1px solid ${t.colors.accent.red}30`, borderRadius: t.radius.lg, color: t.colors.accent.red, fontSize: t.font.size.sm }}>
      <AlertCircle size={15} color={t.colors.accent.red} />
      {msg}
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: t.radius['2xl'], padding: '28px 32px', maxWidth: '400px', width: '90%', boxShadow: t.shadow.lg }}>
        <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '8px' }}>Are you sure?</div>
        <div style={{ fontSize: t.font.size.base, color: t.colors.text.secondary, marginBottom: '24px' }}>{message}</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <PrimaryBtn onClick={onConfirm} style={{ background: t.colors.accent.red }}>Delete</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── TRAILER TYPE OPTIONS ─────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const FLEET_TRAILER_TYPES = ['Dry Van', 'Refrigerated', 'Flatbed', 'Step Deck', 'Removable Gooseneck', 'Hotshot', 'Power Only'];
const EQUIPMENT_VARIATIONS = ['Conestoga', 'Tanker', 'Curtain Side', 'Extendable', 'Lowboy'];
const FLEET_MODES = ['Truck Load', 'LTL', 'Intermodal', 'Partial', 'Drayage', 'Parcel', 'Air', 'Water', 'Ocean'];
const TRUCK_TRAILER_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Lowboy', 'Tanker'];
const TRUCK_STATUSES = [{ value: 'active', label: 'Active' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'inactive', label: 'Inactive' }];
const DRIVER_STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'on_leave', label: 'On Leave' }];
const PADD_REGIONS = [
  { value: 'national', label: 'National Average' },
  { value: 'east_coast', label: 'East Coast' },
  { value: 'midwest', label: 'Midwest' },
  { value: 'gulf_coast', label: 'Gulf Coast' },
  { value: 'rocky_mountain', label: 'Rocky Mountain' },
  { value: 'west_coast', label: 'West Coast' },
];

// ─── Profile Tab ──────────────────────────────────────────────────────────────

const emptyProfileForm = () => ({
  name: '', mcNumber: '', dotNumber: '', phoneNumber: '', email: '', homeAddress: '',
  homeLat: null, homeLng: null, trailerType: '', equipmentVariation: '', modes: [],
  revenueSplitCarrier: 20, mileageRate: '', stopRate: '', fuelPeg: '', fuelMpg: 6.0,
  doePaddRegion: 'national', doePaddRate: '',
  otherCharge1Name: '', otherCharge1Description: '', otherCharge1Amount: '',
  otherCharge2Name: '', otherCharge2Description: '', otherCharge2Amount: '',
});

function ProfileTab({ fleet, onSaved, onDeleted }) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyProfileForm());
  const [geocoded, setGeocoded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Populate form when fleet changes
  useEffect(() => {
    if (!fleet) { setForm(emptyProfileForm()); setGeocoded(false); return; }
    const fp = Array.isArray(fleet.fleet_profiles) ? fleet.fleet_profiles[0] : fleet.fleet_profiles;
    setForm({
      name: fleet.name ?? '',
      mcNumber: fleet.mc_number ?? '',
      dotNumber: fleet.dot_number ?? '',
      phoneNumber: fleet.phone_number ?? '',
      email: fleet.email ?? '',
      homeAddress: fleet.home_address ?? '',
      homeLat: fleet.home_lat ?? null,
      homeLng: fleet.home_lng ?? null,
      trailerType: fp?.trailer_type ?? '',
      equipmentVariation: fp?.equipment_variation ?? '',
      modes: Array.isArray(fp?.modes) ? fp.modes : [],
      revenueSplitCarrier: fp?.revenue_split_carrier ?? 20,
      mileageRate: fp?.mileage_rate ?? '',
      stopRate: fp?.stop_rate ?? '',
      fuelPeg: fp?.fuel_peg ?? '',
      fuelMpg: fp?.fuel_mpg ?? 6.0,
      doePaddRegion: fp?.doe_padd_region ?? 'national',
      doePaddRate: fp?.doe_padd_rate ?? '',
      otherCharge1Name: fp?.other_charge_1_name ?? '',
      otherCharge1Description: fp?.other_charge_1_description ?? '',
      otherCharge1Amount: fp?.other_charge_1_amount ?? '',
      otherCharge2Name: fp?.other_charge_2_name ?? '',
      otherCharge2Description: fp?.other_charge_2_description ?? '',
      otherCharge2Amount: fp?.other_charge_2_amount ?? '',
    });
    setGeocoded(!!(fleet.home_lat && fleet.home_lng));
  }, [fleet?.id]);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleGeocode = async () => {
    if (!form.homeAddress.trim()) return;
    setGeocoding(true);
    setGeocoded(false);
    const result = await geocodeAddress(form.homeAddress);
    if (result?.lat && result?.lng) {
      setForm((f) => ({ ...f, homeLat: result.lat, homeLng: result.lng, homeAddress: result.label || f.homeAddress }));
      setGeocoded(true);
      setError(''); // clear any stale verify error now that it resolves
    } else {
      setError('Could not verify that address. Check the spelling and try again.');
    }
    setGeocoding(false);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) return setError('Fleet name is required.');
    if (!form.phoneNumber.trim()) return setError('Phone number is required.');
    if (!form.email.trim()) return setError('Email is required.');
    if (!form.homeAddress.trim()) return setError('Home address is required.');
    if (!form.homeLat || !form.homeLng) return setError('Please verify the home address before saving.');

    setSaving(true);
    try {
      const { fleetData, profileData } = buildFleetPayload(form);

      if (fleet) {
        await db.fleets.update(fleet.id, fleetData);
        await db.fleetProfiles.update(fleet.id, profileData);
      } else {
        const newFleet = await db.fleets.create({ ...fleetData, user_id: user.id });
        await db.fleetProfiles.update(newFleet.id, profileData);
      }
      onSaved();
    } catch (err) {
      console.error('Save fleet error:', err);
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!fleet) return;
    setDeleting(true);
    setError('');
    try {
      await db.fleets.delete(fleet.id);
      setConfirmDelete(false);
      onDeleted?.();
    } catch (err) {
      console.error('Delete fleet error:', err);
      setError(err.message || 'Failed to delete fleet. Please try again.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const carrierPct = Number(form.revenueSplitCarrier) || 0;
  const customerPct = 100 - carrierPct;
  const fscPreview = form.doePaddRate && form.fuelPeg && form.fuelMpg
    ? ((parseFloat(form.doePaddRate) - parseFloat(form.fuelPeg)) / parseFloat(form.fuelMpg)).toFixed(3)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <ErrorMsg msg={error} />

      {/* Basic Info */}
      <SectionLabel>Fleet Info</SectionLabel>
      <FormGrid>
        <Field label="Fleet Name" required span={2}>
          <Input value={form.name} onChange={set('name')} placeholder="Acme Logistics" />
        </Field>
        {/* MC/DOT Number fields — commented out, may not need these
        <Field label="MC Number"><Input value={form.mcNumber} onChange={set('mcNumber')} placeholder="MC-123456" /></Field>
        <Field label="DOT Number"><Input value={form.dotNumber} onChange={set('dotNumber')} placeholder="1234567" /></Field>
        */}
        <Field label="Phone" required><Input value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="(555) 867-5309" /></Field>
        <Field label="Email" required><Input value={form.email} onChange={set('email')} type="email" placeholder="dispatch@fleet.com" /></Field>
      </FormGrid>

      {/* Home Base */}
      <SectionLabel>Home Base</SectionLabel>
      <FormGrid cols={1}>
        <Field label="Home Address" required hint="City, State or full street address">
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <Input
                value={form.homeAddress}
                onChange={(v) => { setForm((f) => ({ ...f, homeAddress: v, homeLat: null, homeLng: null })); setGeocoded(false); }}
                placeholder="Davidson, NC"
              />
            </div>
            <button
              onClick={handleGeocode}
              disabled={geocoding || !form.homeAddress.trim()}
              style={{ padding: '8px 14px', background: geocoded ? t.colors.accent.greenLight : t.colors.accent.blueLight, border: `1px solid ${geocoded ? t.colors.accent.green + '60' : t.colors.accent.blue + '60'}`, borderRadius: t.radius.lg, color: geocoded ? t.colors.accent.green : t.colors.accent.blue, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, cursor: geocoding ? 'wait' : 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: t.font.family }}
            >
              {geocoded ? <><CheckCircle size={13} color={t.colors.accent.green} /> Verified</> : geocoding ? 'Verifying…' : <><MapPin size={13} /> Verify</>}
            </button>
          </div>
          {geocoded && form.homeLat && (
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '4px' }}>
              {form.homeLat.toFixed(4)}, {form.homeLng.toFixed(4)}
            </div>
          )}
        </Field>
      </FormGrid>
      <FormGrid cols={2}>
        <Field label="Default Trailer Type">
          <SelectInput value={form.trailerType} onChange={set('trailerType')} options={FLEET_TRAILER_TYPES} />
        </Field>
        <Field label="Equipment Variation" hint="Optional — Conestoga, Tanker, etc.">
          <SelectInput value={form.equipmentVariation} onChange={set('equipmentVariation')} options={EQUIPMENT_VARIATIONS} />
        </Field>
      </FormGrid>
      <FormGrid cols={1}>
        <Field label="Modes" hint="Optional — transport modes this fleet will take (e.g. Partial). Leave empty for no preference.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {FLEET_MODES.map((m) => {
              const checked = form.modes.includes(m);
              return (
                <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', border: `1px solid ${checked ? t.colors.accent.blue : t.colors.border.default}`, borderRadius: t.radius.lg, background: checked ? t.colors.accent.blueLight : '#fff', cursor: 'pointer', fontSize: t.font.size.sm, color: t.colors.text.primary, userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setForm((f) => ({ ...f, modes: f.modes.includes(m) ? f.modes.filter((x) => x !== m) : [...f.modes, m] }))}
                  />
                  {m}
                </label>
              );
            })}
          </div>
        </Field>
      </FormGrid>

      {/* Rate Configuration */}
      <SectionLabel>Rate Configuration</SectionLabel>
      <FormGrid>
        <Field label="Carrier %" hint="Percentage of gross backhaul revenue allocated to the carrier">
          <Input value={form.revenueSplitCarrier} onChange={set('revenueSplitCarrier')} type="number" min={1} max={99} placeholder="20" />
        </Field>
        <Field label="Customer %">
          <div style={{ ...inputBase, background: t.colors.page.bg, color: t.colors.text.secondary, fontWeight: t.font.weight.semibold, cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
            {carrierPct > 0 && carrierPct < 100 ? customerPct : '—'}%
          </div>
        </Field>
        <Field label="Mileage Rate ($/mile)" hint="Rate per mile, loaded and empty">
          <Input value={form.mileageRate} onChange={set('mileageRate')} type="number" step="0.01" placeholder="2.00" />
        </Field>
        <Field label="Stop Rate ($/stop)" hint="Rate per stop on the backhaul route">
          <Input value={form.stopRate} onChange={set('stopRate')} type="number" step="0.01" placeholder="50.00" />
        </Field>
      </FormGrid>

      <SectionLabel>Fuel Surcharge</SectionLabel>
      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '12px' }}>FSC per mile = (DOE PADD Rate − PEG) / MPG</div>
      <FormGrid>
        <Field label="PEG ($/gal)" hint="Fuel cost per gallon already included in your mileage rate">
          <Input value={form.fuelPeg} onChange={set('fuelPeg')} type="number" step="0.001" placeholder="1.200" />
        </Field>
        <Field label="MPG" hint="Contractual miles per gallon (typically 6–8)">
          <Input value={form.fuelMpg} onChange={set('fuelMpg')} type="number" step="0.1" min={1} max={15} placeholder="6.0" />
        </Field>
        <Field label="PADD Region">
          <SelectInput value={form.doePaddRegion} onChange={set('doePaddRegion')} options={PADD_REGIONS} />
        </Field>
        <Field label="DOE PADD Rate ($/gal)" hint="Current diesel price from EIA.gov">
          <Input value={form.doePaddRate} onChange={set('doePaddRate')} type="number" step="0.001" placeholder="3.736" />
        </Field>
      </FormGrid>
      {fscPreview && parseFloat(fscPreview) > 0 && (
        <div style={{ marginTop: '10px', padding: '10px 14px', background: t.colors.accent.blueLight, border: `1px solid ${t.colors.accent.blue}30`, borderRadius: t.radius.lg, fontSize: t.font.size.sm, color: t.colors.text.primary }}>
          <strong>Fuel Surcharge Rate: ${fscPreview}/mi</strong>
          <span style={{ color: t.colors.text.muted, marginLeft: '10px' }}>
            (DOE ${form.doePaddRate} − PEG ${form.fuelPeg}) / {form.fuelMpg} MPG × OOR Miles
          </span>
        </div>
      )}

      <SectionLabel>Other Charges</SectionLabel>
      <FormGrid cols={3}>
        <Field label="Charge 1 Name"><Input value={form.otherCharge1Name} onChange={set('otherCharge1Name')} placeholder="Layover" /></Field>
        <Field label="Description" hint="Max 25 chars"><Input value={form.otherCharge1Description} onChange={(v) => set('otherCharge1Description')(v.slice(0, 25))} placeholder="Driver layover fee" /></Field>
        <Field label="Amount ($)"><Input value={form.otherCharge1Amount} onChange={set('otherCharge1Amount')} type="number" step="0.01" placeholder="150.00" /></Field>
        <Field label="Charge 2 Name"><Input value={form.otherCharge2Name} onChange={set('otherCharge2Name')} placeholder="TONU" /></Field>
        <Field label="Description" hint="Max 25 chars"><Input value={form.otherCharge2Description} onChange={(v) => set('otherCharge2Description')(v.slice(0, 25))} placeholder="Truck order not used" /></Field>
        <Field label="Amount ($)"><Input value={form.otherCharge2Amount} onChange={set('otherCharge2Amount')} type="number" step="0.01" placeholder="300.00" /></Field>
      </FormGrid>

      <div style={{ marginTop: '24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <PrimaryBtn onClick={handleSave} loading={saving}>
          <Save size={15} />{saving ? 'Saving…' : 'Save Profile'}
        </PrimaryBtn>
        {fleet && (
          <GhostBtn onClick={() => setConfirmDelete(true)} danger style={{ marginLeft: 'auto' }}>
            <Trash2 size={14} /> Delete Fleet
          </GhostBtn>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete ${fleet?.name || 'this fleet'}? This also removes its trucks, drivers, and rate config, and cannot be undone.`}
          onConfirm={deleting ? () => {} : handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Trucks Tab ───────────────────────────────────────────────────────────────

const emptyTruckForm = () => ({ truckNumber: '', trailerType: '', trailerLength: '', weightLimit: '', doorType: '', status: 'active' });

function TrucksTab({ fleet, onChanged }) {
  const [trucks, setTrucks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTruckForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!fleet) return;
    const t_ = Array.isArray(fleet.trucks) ? fleet.trucks : [];
    setTrucks(t_);
  }, [fleet?.id, fleet?.trucks]);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const openNew = () => { setEditing(null); setForm(emptyTruckForm()); setError(''); setShowForm(true); };
  const openEdit = (truck) => { setEditing(truck); setForm({ truckNumber: truck.truck_number, trailerType: truck.trailer_type, trailerLength: truck.trailer_length, weightLimit: truck.weight_limit, doorType: truck.door_type ?? '', status: truck.status }); setError(''); setShowForm(true); };
  const cancelForm = () => { setShowForm(false); setEditing(null); };

  const handleSave = async () => {
    setError('');
    if (!form.truckNumber.trim()) return setError('Truck number is required.');
    if (!form.trailerType) return setError('Trailer type is required.');
    const len = Number(form.trailerLength);
    const wt = Number(form.weightLimit);
    if (!len || len < 20 || len > 60) return setError('Trailer length must be between 20 and 60 ft.');
    if (!wt || wt < 10000 || wt > 80000) return setError('Weight limit must be between 10,000 and 80,000 lbs.');

    setSaving(true);
    try {
      const data = { truck_number: form.truckNumber, trailer_type: form.trailerType, trailer_length: len, weight_limit: wt, door_type: form.doorType || null, status: form.status, fleet_id: fleet.id };
      if (editing) {
        const updated = await db.trucks.update(editing.id, data);
        setTrucks((prev) => prev.map((t) => t.id === editing.id ? updated : t));
      } else {
        const created = await db.trucks.create(data);
        setTrucks((prev) => [...prev, created]);
      }
      cancelForm();
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to save truck.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (truck) => {
    try {
      await db.trucks.delete(truck.id);
      setTrucks((prev) => prev.filter((t) => t.id !== truck.id));
      setConfirmDelete(null);
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to delete truck.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>{trucks.length} truck{trucks.length !== 1 ? 's' : ''}</div>
        {!showForm && (
          <PrimaryBtn onClick={openNew}><Plus size={14} /> Add Truck</PrimaryBtn>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div style={{ background: t.colors.page.bg, border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl, padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: t.font.size.md, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '16px' }}>
            {editing ? 'Edit Truck' : 'New Truck'}
          </div>
          <ErrorMsg msg={error} />
          <FormGrid>
            <Field label="Truck Number" required><Input value={form.truckNumber} onChange={set('truckNumber')} placeholder="TRUCK-001" /></Field>
            <Field label="Trailer Type" required><SelectInput value={form.trailerType} onChange={set('trailerType')} options={TRUCK_TRAILER_TYPES} /></Field>
            <Field label="Trailer Length (ft)" required><Input value={form.trailerLength} onChange={set('trailerLength')} type="number" min={20} max={60} placeholder="53" /></Field>
            <Field label="Weight Limit (lbs)" required><Input value={form.weightLimit} onChange={set('weightLimit')} type="number" min={10000} max={80000} step={1000} placeholder="45000" /></Field>
            <Field label="Door Type"><SelectInput value={form.doorType} onChange={set('doorType')} options={['Swing', 'Roll']} /></Field>
            <Field label="Status"><SelectInput value={form.status} onChange={set('status')} options={TRUCK_STATUSES} /></Field>
          </FormGrid>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <PrimaryBtn onClick={handleSave} loading={saving}><Save size={14} />{saving ? 'Saving…' : 'Save Truck'}</PrimaryBtn>
            <GhostBtn onClick={cancelForm}>Cancel</GhostBtn>
          </div>
        </div>
      )}

      {/* Truck list */}
      {trucks.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: t.colors.text.muted }}>
          <Truck size={32} color={t.colors.border.strong} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: t.font.size.base }}>No trucks yet — add your first one</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {trucks.map((truck) => (
            <div key={truck.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', background: '#fff', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl }}>
              <div style={{ width: '36px', height: '36px', borderRadius: t.radius.lg, background: t.colors.accent.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Truck size={17} color={t.colors.accent.blue} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{truck.truck_number}</div>
                <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginTop: '2px' }}>
                  {truck.trailer_type} · {truck.trailer_length}ft · {truck.weight_limit?.toLocaleString()} lbs
                  {truck.door_type && ` · ${truck.door_type} doors`}
                </div>
              </div>
              <StatusBadge status={truck.status} />
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <GhostBtn onClick={() => openEdit(truck)}><Edit size={13} /> Edit</GhostBtn>
                <GhostBtn onClick={() => setConfirmDelete(truck)} danger><Trash2 size={13} /></GhostBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete ${confirmDelete.truck_number}? This cannot be undone.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Drivers Tab ──────────────────────────────────────────────────────────────

const emptyDriverForm = () => ({ firstName: '', lastName: '', email: '', phone: '', cdlNumber: '', cdlState: '', assignedTruckId: '', status: 'active' });

function DriversTab({ fleet, onChanged }) {
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks]   = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyDriverForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!fleet) return;
    setDrivers(Array.isArray(fleet.drivers) ? fleet.drivers : []);
    // Active trucks for assignment
    const allTrucks = Array.isArray(fleet.trucks) ? fleet.trucks : [];
    setTrucks(allTrucks.filter((t) => t.status === 'active'));
  }, [fleet?.id, fleet?.trucks, fleet?.drivers]);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const openNew = () => { setEditing(null); setForm(emptyDriverForm()); setError(''); setShowForm(true); };
  const openEdit = (d) => { setEditing(d); setForm({ firstName: d.first_name, lastName: d.last_name, email: d.email, phone: d.phone ?? '', cdlNumber: d.cdl_number ?? '', cdlState: d.cdl_state ?? '', assignedTruckId: d.assigned_truck_id ?? '', status: d.status }); setError(''); setShowForm(true); };
  const cancelForm = () => { setShowForm(false); setEditing(null); };

  const handleSave = async () => {
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    if (!form.lastName.trim()) return setError('Last name is required.');
    if (!editing && !form.email.trim()) return setError('Email is required for new drivers.');

    setSaving(true);
    try {
      const data = {
        first_name: form.firstName, last_name: form.lastName,
        phone: form.phone || null, cdl_number: form.cdlNumber || null,
        cdl_state: form.cdlState.toUpperCase() || null,
        assigned_truck_id: form.assignedTruckId || null,
        status: form.status, fleet_id: fleet.id,
      };
      if (editing) {
        const updated = await db.drivers.update(editing.id, data);
        setDrivers((prev) => prev.map((d) => d.id === editing.id ? updated : d));
      } else {
        const created = await db.drivers.create({ ...data, email: form.email });
        setDrivers((prev) => [...prev, created]);
        alert(`Driver ${form.firstName} ${form.lastName} created. Send them a Supabase invite from the admin panel to give them login access.`);
      }
      cancelForm();
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to save driver.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (driver) => {
    try {
      await db.drivers.delete(driver.id);
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
      setConfirmDelete(null);
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to delete driver.');
    }
  };

  const truckOptions = trucks.map((t) => ({ value: t.id, label: `${t.truck_number} (${t.trailer_type})` }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>{drivers.length} driver{drivers.length !== 1 ? 's' : ''}</div>
        {!showForm && <PrimaryBtn onClick={openNew}><Plus size={14} /> Add Driver</PrimaryBtn>}
      </div>

      {showForm && (
        <div style={{ background: t.colors.page.bg, border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl, padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: t.font.size.md, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '16px' }}>
            {editing ? 'Edit Driver' : 'New Driver'}
          </div>
          <ErrorMsg msg={error} />
          <FormGrid>
            <Field label="First Name" required><Input value={form.firstName} onChange={set('firstName')} placeholder="John" /></Field>
            <Field label="Last Name" required><Input value={form.lastName} onChange={set('lastName')} placeholder="Smith" /></Field>
            <Field label="Email" required={!editing}>
              <Input value={form.email} onChange={set('email')} type="email" placeholder="jsmith@fleet.com" disabled={!!editing} />
            </Field>
            <Field label="Phone"><Input value={form.phone} onChange={set('phone')} placeholder="(555) 867-5309" /></Field>
            <Field label="CDL Number"><Input value={form.cdlNumber} onChange={set('cdlNumber')} placeholder="D1234567" /></Field>
            <Field label="CDL State"><SelectInput value={form.cdlState} onChange={set('cdlState')} options={US_STATES} /></Field>
            <Field label="Assigned Truck"><SelectInput value={form.assignedTruckId} onChange={set('assignedTruckId')} options={truckOptions} /></Field>
            <Field label="Status"><SelectInput value={form.status} onChange={set('status')} options={DRIVER_STATUSES} /></Field>
          </FormGrid>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <PrimaryBtn onClick={handleSave} loading={saving}><Save size={14} />{saving ? 'Saving…' : 'Save Driver'}</PrimaryBtn>
            <GhostBtn onClick={cancelForm}>Cancel</GhostBtn>
          </div>
        </div>
      )}

      {drivers.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: t.colors.text.muted }}>
          <User size={32} color={t.colors.border.strong} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: t.font.size.base }}>No drivers yet — add your first one</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {drivers.map((driver) => {
            const assignedTruck = trucks.find((t) => t.id === driver.assigned_truck_id);
            return (
              <div key={driver.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', background: '#fff', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl }}>
                <div style={{ width: '36px', height: '36px', borderRadius: t.radius.full, background: t.colors.accent.purpleLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: t.font.size.md, fontWeight: t.font.weight.bold, color: t.colors.accent.purple }}>
                  {driver.first_name?.[0]}{driver.last_name?.[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>
                      {driver.first_name} {driver.last_name}
                    </div>
                    {driver.user_id && (
                      <span style={{ fontSize: t.font.size.xs, padding: '1px 7px', borderRadius: t.radius.full, background: t.colors.accent.greenLight, color: t.colors.accent.green, fontWeight: t.font.weight.semibold }}>
                        Has Login
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginTop: '2px' }}>
                    {driver.email}
                    {assignedTruck && ` · ${assignedTruck.truck_number}`}
                    {driver.cdl_number && ` · CDL: ${driver.cdl_number}`}
                  </div>
                </div>
                <StatusBadge status={driver.status} />
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <GhostBtn onClick={() => openEdit(driver)}><Edit size={13} /> Edit</GhostBtn>
                  <GhostBtn onClick={() => setConfirmDelete(driver)} danger><Trash2 size={13} /></GhostBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Remove ${confirmDelete.first_name} ${confirmDelete.last_name}? This cannot be undone.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Fleet Detail Panel ───────────────────────────────────────────────────────

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'trucks',  label: 'Trucks' },
  { id: 'drivers', label: 'Drivers' },
];

function FleetDetailPanel({ fleet, isNew, activeTab, setActiveTab, onSaved, onChanged, onDeleted }) {
  const isMobile = useMobile();

  if (!fleet && !isNew) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: t.colors.text.muted, flexDirection: 'column', gap: '12px' }}>
        <Truck size={36} color={t.colors.border.strong} />
        <div style={{ fontSize: t.font.size.md }}>Select a fleet or create a new one</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Fleet name header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? t.font.size.lg : t.font.size['2xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary, letterSpacing: '-0.01em' }}>
          {isNew ? 'New Fleet' : fleet.name}
        </h2>
        {!isNew && fleet.home_address && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color: t.colors.text.muted, fontSize: t.font.size.sm }}>
            <MapPin size={13} />
            {fleet.home_address}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `2px solid ${t.colors.border.default}`, marginBottom: '24px' }}>
        {(isNew ? TABS.slice(0, 1) : TABS).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: active ? `2px solid ${t.colors.accent.blue}` : '2px solid transparent', marginBottom: '-2px', color: active ? t.colors.accent.blue : t.colors.text.muted, fontSize: t.font.size.base, fontWeight: active ? t.font.weight.semibold : t.font.weight.medium, cursor: 'pointer', fontFamily: t.font.family, transition: 'color 0.15s' }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && <ProfileTab fleet={fleet} onSaved={onSaved} onDeleted={onDeleted} />}
      {activeTab === 'trucks'  && !isNew && <TrucksTab fleet={fleet} onChanged={onChanged} />}
      {activeTab === 'drivers' && !isNew && <DriversTab fleet={fleet} onChanged={onChanged} />}
    </div>
  );
}

// ─── Fleet List Panel ─────────────────────────────────────────────────────────

function FleetListPanel({ fleets, selectedId, onSelect, onNew, hiddenNewBtn }) {
  return (
    <div style={{ width: '260px', flexShrink: 0 }}>
      {!hiddenNewBtn && (
        <button
          onClick={onNew}
          style={{ width: '100%', padding: '10px 14px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.xl, color: '#fff', fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px', fontFamily: t.font.family }}
        >
          <Plus size={15} /> New Fleet
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {fleets.map((fleet) => {
          const active = fleet.id === selectedId;
          const truckCount = Array.isArray(fleet.trucks) ? fleet.trucks.length : 0;
          return (
            <div
              key={fleet.id}
              onClick={() => onSelect(fleet.id)}
              style={{ padding: '12px 14px', borderRadius: t.radius.xl, cursor: 'pointer', background: active ? '#fff' : 'transparent', border: active ? `1px solid ${t.colors.border.default}` : '1px solid transparent', boxShadow: active ? t.shadow.card : 'none', borderLeft: active ? `3px solid ${t.colors.accent.blue}` : '3px solid transparent', transition: 'all 0.12s' }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{fleet.name}</div>
              {fleet.home_address && (
                <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fleet.home_address}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                {/* MC number badge — commented out, may not need this
                {fleet.mc_number && (
                  <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>MC {fleet.mc_number}</span>
                )}
                */}
                {truckCount > 0 && (
                  <span style={{ fontSize: t.font.size.xs, padding: '1px 7px', borderRadius: t.radius.full, background: t.colors.accent.blueLight, color: t.colors.accent.blue, fontWeight: t.font.weight.medium }}>
                    {truckCount} truck{truckCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {fleets.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: t.colors.text.muted, fontSize: t.font.size.sm }}>
            No fleets yet
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FleetsView (main export) ─────────────────────────────────────────────────

export function FleetsView() {
  const { user } = useAuth();
  const isMobile = useMobile();
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const loadFleets = async () => {
    if (!user) return;
    try {
      const data = await db.fleets.getAll(user.id);
      setFleets(data || []);
      // Auto-select first if nothing selected
      if (!selectedId && data?.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      console.error('Load fleets error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFleets(); }, [user]);

  const handleSelect = (id) => { setSelectedId(id); setIsNew(false); setActiveTab('profile'); };
  const handleNew = () => { setSelectedId(null); setIsNew(true); setActiveTab('profile'); };
  const handleSaved = () => { setIsNew(false); loadFleets(); };
  const handleChanged = () => { loadFleets(); };
  const handleDeleted = () => { setSelectedId(null); setIsNew(false); setActiveTab('profile'); loadFleets(); };

  const selectedFleet = fleets.find((f) => f.id === selectedId) ?? null;
  const showingDetail = isMobile && (selectedId || isNew);

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {!isMobile && (
          <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1,2,3].map((i) => <div key={i} style={{ height: '76px', borderRadius: t.radius.xl, background: t.colors.border.default, opacity: 0.5 }} />)}
          </div>
        )}
        <div style={{ flex: 1, height: '400px', borderRadius: t.radius.xl, background: t.colors.border.default, opacity: 0.3 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: isMobile ? '0' : '24px', alignItems: 'flex-start', height: isMobile ? '100%' : 'auto' }}>
      {/* Fleet list — hidden on mobile when detail is open */}
      {(!isMobile || !showingDetail) && (
        <div style={isMobile ? { width: '100%' } : {}}>
          {isMobile && (
            <button
              onClick={handleNew}
              style={{ width: '100%', padding: '10px 14px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.xl, color: '#fff', fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px', fontFamily: t.font.family }}
            >
              <Plus size={15} /> New Fleet
            </button>
          )}
          <FleetListPanel
            fleets={fleets}
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew}
            hiddenNewBtn={isMobile}
          />
        </div>
      )}

      {/* Detail panel — full screen on mobile when open */}
      {(!isMobile || showingDetail) && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile && showingDetail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={() => { setSelectedId(null); setIsNew(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.accent.blue, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                ‹ Fleets
              </button>
            </div>
          )}
          <FleetDetailPanel
            fleet={selectedFleet}
            isNew={isNew}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onSaved={handleSaved}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
          />
        </div>
      )}
    </div>
  );
}
