import { useState, useEffect, useCallback, useRef } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../hooks/useCredits';
import { useMobile } from '../../hooks/useMobile';
import { geocodeAddress } from '../../utils/pcMilerClient';
import { buildRequestPayload } from '../../utils/buildRequestPayload';
import { findRouteHomeBackhauls, computeNegotiation, netCreditAtGross, isNoRateLoad, effectivePickupDate } from '../../utils/routeHomeMatching';
import { CityStateInput } from '../CityStateInput';
import { getLoadsForMatching } from '../../utils/getLoadsForMatching';
import { isExpiredInProgress, finishPayload } from '../../utils/autoFinishRequests';
import { CANCELLATION_REASONS } from '../../utils/cancellationReasons';
import { FLEET_MODES, unionModes } from '../../utils/fleetModes';
import { sendBackhaulChangeNotification, detectBackhaulChanges } from '../../utils/notificationService';
import { RouteHomeMap } from '../RouteHomeMap';
import { RouteMap } from '../RouteMap';
import { LoadShareMenu } from '../LoadShareMenu';
import { CoDriverV2 } from './CoDriverV2';
import {
  Plus, Search, MapPin, Truck, Package, RefreshCw,
  Edit, Trash2, X, AlertCircle, CheckCircle, Clock,
  ChevronRight, DollarSign, Navigation, Bell,
  TrendingUp, Map, Calendar,
} from '../../icons';

const t = tokens;

// ─── Load board constants ────────────────────────────────────────────────────

const DF_EQUIP_PATH = {
  'Dry Van':      'van',
  'Van':          'van',
  'Flatbed':      'flatbed',
  'Refrigerated': 'reefer',
  'Reefer':       'reefer',
  'Step Deck':    'stepdeck',
  'Power Only':   'poweronly',
  'Hot Shot':     'hotshot',
};

const LOAD_BOARD_CONFIG = {
  directfreight: {
    name: 'Direct Freight',
    url: (id, match) => {
      const equip  = DF_EQUIP_PATH[match?.equipmentType] || 'all';
      const oState = match?.pickup_state   || '';
      const dState = match?.delivery_state || '';
      const oCity  = match?.pickup_city    || '';
      const dCity  = match?.delivery_city  || '';
      const date   = match?.pickupDate ? String(match.pickupDate).split('T')[0] : '';
      let url = `https://www.directfreight.com/home/boards/find/loads/${equip}`;
      if (oState) url += `/${oState}`;
      const params = new URLSearchParams();
      if (oState) params.set('origin_state',        oState);
      if (dState) params.set('destination_state',   dState);
      if (oCity)  params.set('origin_city',          oCity);
      if (dCity)  params.set('destination_city',     dCity);
      if (date)   params.set('ship_date',             date);
      params.set('origin_radius', '100');
      params.set('destination_radius', '100');
      params.set('sort_parameter', 'age');
      return `${url}?${params.toString()}`;
    },
  },
  truckerpath: {
    name: 'TruckerPath',
    url: (id) => {
      const numeric = id ? String(id).replace(/^TP:/i, '') : null;
      return numeric ? `https://loadboard.truckerpath.com/loads/${numeric}` : 'https://loadboard.truckerpath.com/';
    },
  },
  dat: {
    name: 'DAT',
    url: (id) => id ? `https://www.dat.com/load/${id}` : 'https://www.dat.com/',
  },
  truckstop: {
    name: 'Truckstop',
    url: (id) => id ? `https://main.truckstop.com/PostingDetails/Loads/${id}` : 'https://main.truckstop.com/',
  },
};

// ─── Match field normalizers (handle both camelCase and snake_case) ──────────

const mOriginAddr   = m => m.origin?.address   || `${m.pickup_city}, ${m.pickup_state}`;
const mDestAddr     = m => m.destination?.address || `${m.delivery_city}, ${m.delivery_state}`;
const mDistance     = m => m.distance ?? m.distance_miles ?? 0;
const mAdditional   = m => m.additionalMiles ?? m.additional_miles ?? 0;
const mToPickup     = m => m.finalToPickup ?? m.final_to_pickup ?? 0;
const mRevPerMile   = m => m.revenuePerMile ?? m.revenue_per_mile ?? 0;
const mTotalRev     = m => m.totalRevenue ?? m.total_revenue ?? 0;
const mPickupDate   = m => m.pickupDate ?? m.pickup_date;
const mDeliveryDate = m => m.deliveryDate ?? m.delivery_date;
const mOriginLat    = m => m.origin?.lat ?? m.pickup_lat;
const mOriginLng    = m => m.origin?.lng ?? m.pickup_lng;
const mDestLat      = m => m.destination?.lat ?? m.delivery_lat;
const mDestLng      = m => m.destination?.lng ?? m.delivery_lng;
const mWeight       = m => m.weight ?? m.loadWeight;
const mLength       = m => m.trailerLength ?? m.trailer_length;
const mEquipType    = m => m.equipmentType ?? m.equipment_type ?? 'Dry Van';
const mFreight      = m => m.freightType ?? m.freight_type;

// Amber pill flagging a load whose pickup is ±1 day off the requested date.
// Renders nothing for an exact match or when there's no requested/load date.
function DateFitBadge({ dateFit }) {
  if (!dateFit || dateFit.fit === 'exact' || dateFit.fit == null) return null;
  const late = dateFit.fit === 'late';
  return (
    <span
      title={late ? 'Picks up a day after your requested date' : 'Picks up a day before your requested date'}
      style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '5px', padding: '0 5px', whiteSpace: 'nowrap', lineHeight: '15px' }}
    >
      {late ? '▲ +1 day' : '▼ −1 day'}
    </span>
  );
}

// ─── Shared primitives ───────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: t.colors.page.cardBg,
      border: `1px solid ${t.colors.page.cardBorder}`,
      borderRadius: t.radius['2xl'],
      boxShadow: t.shadow.card,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, style = {} }) {
  return (
    <div style={{
      fontSize: t.font.size.xs,
      fontWeight: t.font.weight.semibold,
      color: t.colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:    { bg: '#dcfce7', color: '#16a34a', label: 'Active' },
    open:      { bg: '#dcfce7', color: '#16a34a', label: 'Active' },
    paused:    { bg: '#fef9c3', color: '#854d0e', label: 'Paused' },
    pending:     { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending' },
    in_progress: { bg: '#fef9c3', color: '#854d0e', label: 'Searching' },
    cancelled:   { bg: '#fee2e2', color: '#dc2626', label: 'Cancelled' },
    completed:   { bg: '#f1f5f9', color: '#64748b', label: 'Completed' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: t.radius.full,
      fontSize: t.font.size.xs,
      fontWeight: t.font.weight.semibold,
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function PrimaryBtn({ children, onClick, disabled, style = {}, type = 'button' }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: disabled ? '#e2e8f0' : hovered ? t.colors.accent.blueHover : t.colors.accent.blue,
        color: disabled ? '#94a3b8' : '#fff',
        border: 'none',
        borderRadius: t.radius.lg,
        padding: '8px 16px',
        fontSize: t.font.size.sm,
        fontWeight: t.font.weight.semibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.12s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function CreditBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      marginLeft: '6px', paddingLeft: '8px',
      borderLeft: '1px solid rgba(255,255,255,0.28)',
      fontSize: '11px', fontWeight: 700, opacity: 0.9, whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        display: 'inline-block',
      }} />
      1 credit
    </span>
  );
}

function GhostBtn({ children, onClick, style = {}, type = 'button' }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#f1f5f9' : 'transparent',
        color: t.colors.text.secondary,
        border: `1px solid ${t.colors.border.default}`,
        borderRadius: t.radius.lg,
        padding: '8px 14px',
        fontSize: t.font.size.sm,
        fontWeight: t.font.weight.medium,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.12s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled, style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '8px 10px',
        border: `1px solid ${t.colors.border.default}`,
        borderRadius: t.radius.lg,
        fontSize: t.font.size.sm,
        color: t.colors.text.primary,
        background: disabled ? '#f8fafc' : '#fff',
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

function SelectInput({ value, onChange, children, disabled, style = {} }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '8px 10px',
        border: `1px solid ${t.colors.border.default}`,
        borderRadius: t.radius.lg,
        fontSize: t.font.size.sm,
        color: t.colors.text.primary,
        background: disabled ? '#f8fafc' : '#fff',
        outline: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function Field({ label, children, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', ...style }}>
      <label style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: t.colors.accent.red, fontSize: t.font.size.xs, marginTop: '4px' }}>
      <AlertCircle size={13} color={t.colors.accent.red} />
      {msg}
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.65 : 1 }}>
      <div
        onClick={() => { if (!disabled) onChange(!checked); }}
        style={{
          width: '36px', height: '20px',
          borderRadius: '10px',
          background: checked ? t.colors.accent.blue : '#cbd5e1',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.15s',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '18px' : '2px',
          width: '16px', height: '16px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.15s',
        }} />
      </div>
      {label && <span style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary }}>{label}</span>}
    </label>
  );
}

// ─── New / Edit Request Form ─────────────────────────────────────────────────

const BLANK_FORM = {
  requestName: '',
  datumText: '',
  datumCity: '',
  datumState: '',
  datumLat: null,
  datumLng: null,
  selectedFleetId: '',
  equipmentAvailableDate: '',
  equipmentNeededDate: '',
  driverHomeBy: '',
  isRelay: false,
  modes: [],
  autoRefresh: false,
  autoRefreshInterval: 1,
  maxAutoRefreshes: '',
  notificationEnabled: false,
  notificationMethod: 'email',
};

function RequestForm({ fleets, initialValues = null, onSave, onCancel }) {
  const [form, setForm] = useState(() => initialValues ? {
    requestName: initialValues.request_name || '',
    datumText: initialValues.datum_point || [initialValues.datum_city, initialValues.datum_state].filter(Boolean).join(', '),
    datumCity: initialValues.datum_city || '',
    datumState: initialValues.datum_state || '',
    datumLat: initialValues.datum_lat || null,
    datumLng: initialValues.datum_lng || null,
    selectedFleetId: initialValues.fleet_id || '',
    equipmentAvailableDate: initialValues.equipment_available_date || '',
    equipmentNeededDate: initialValues.equipment_needed_date || '',
    driverHomeBy: initialValues.driver_home_by || '',
    isRelay: initialValues.is_relay || false,
    modes: Array.isArray(initialValues.modes) ? initialValues.modes : [],
    autoRefresh: initialValues.auto_refresh || false,
    autoRefreshInterval: initialValues.auto_refresh_interval ? initialValues.auto_refresh_interval / 60 : 1,
    maxAutoRefreshes: initialValues.max_auto_refreshes != null ? String(initialValues.max_auto_refreshes) : '',
    notificationEnabled: initialValues.notification_enabled || false,
    notificationMethod: initialValues.notification_method || 'email',
  } : { ...BLANK_FORM, selectedFleetId: fleets.length === 1 ? fleets[0].id : '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // An already-saved request has a validated datum (datum_point is always set on save,
  // even for v1-created rows that never stored coords) — treat it as verified on load so
  // editing an unrelated field doesn't falsely fail. Editing the datum flips this off.
  const [datumVerified, setDatumVerified] = useState(!!(initialValues?.datum_lat || initialValues?.datum_point));
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const { user } = useAuth();

  const set = (key, val) => setForm(f => {
    const next = { ...f, [key]: val };
    // Auto-refresh is only useful with notifications, so force them on when it's enabled.
    if (key === 'autoRefresh' && val) {
      next.notificationEnabled = true;
      if (!next.notificationMethod) next.notificationMethod = 'email';
    }
    return next;
  });

  // CityStateInput resolution (item 002): suggestion pick or blur-geocode.
  const handleDatumResolve = (r) => {
    if (r && r.lat != null && r.lng != null) {
      setForm(f => ({ ...f, datumText: r.label, datumCity: r.city, datumState: r.state, datumLat: r.lat, datumLng: r.lng }));
      setDatumVerified(true);
      setErrors(e => ({ ...e, datumText: null })); // clear stale typo error once verify succeeds
    } else {
      setForm(f => ({ ...f, datumLat: null, datumLng: null }));
      setDatumVerified(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.requestName.trim()) e.requestName = 'Required';
    if (!form.datumText.trim()) e.datumText = 'Required';
    else if (!datumVerified) e.datumText = "We couldn't find that location — check the spelling.";
    if (!form.selectedFleetId) e.selectedFleetId = 'Select a fleet';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const refreshCreditLabel = (intervalHours) => {
    if (intervalHours === 0.25) return { interval: 'every 15 minutes', cost: '4 credits per hour' };
    if (intervalHours === 0.5) return { interval: 'every 30 minutes', cost: '2 credits per hour' };
    if (intervalHours === 1)   return { interval: 'every 1 hour',     cost: '1 credit per hour' };
    if (intervalHours === 4)   return { interval: 'every 4 hours',    cost: '1 credit every 4 hours' };
    return { interval: `every ${intervalHours} hours`, cost: `1 credit every ${intervalHours} hours` };
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const payload = buildRequestPayload(form, user.id);
      if (initialValues?.id) {
        await db.requests.update(initialValues.id, payload);
      } else {
        await db.requests.create(payload);
      }
      onSave();
    } catch (err) {
      console.error('Error saving request:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (form.autoRefresh) {
      setShowRefreshConfirm(true);
      return;
    }
    await doSave();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card style={{ padding: '28px' }}>
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '24px' }}>
          {initialValues ? 'Edit Request' : 'New Backhaul Request'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <Field label="Request Name" style={{ gridColumn: '1 / -1' }}>
            <Input value={form.requestName} onChange={e => set('requestName', e.target.value)} placeholder="e.g. ATL Return Run" />
            <ErrorMsg msg={errors.requestName} />
          </Field>

          <Field label="Datum (Return Location)" style={{ gridColumn: '1 / -1' }}>
            <CityStateInput
              value={form.datumText}
              onChange={(v) => { set('datumText', v); setDatumVerified(false); }}
              onResolve={handleDatumResolve}
              placeholder="City, ST (e.g. Burlington, NC)"
              accentColor={t.colors.accent.blue}
              inputStyle={{ width: '100%', padding: '8px 10px', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.lg, fontSize: t.font.size.sm, color: t.colors.text.primary, background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
            <ErrorMsg msg={errors.datumText} />
            {datumVerified && (
              <span style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px', display: 'block' }}>
                ✓ Location verified
              </span>
            )}
          </Field>

          <Field label="Fleet">
            <SelectInput value={form.selectedFleetId} onChange={e => set('selectedFleetId', e.target.value)}>
              <option value="">Select fleet…</option>
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </SelectInput>
            <ErrorMsg msg={errors.selectedFleetId} />
          </Field>

          <Field label="Begin Pickup Window">
            <Input type="date" value={form.equipmentAvailableDate} onChange={e => set('equipmentAvailableDate', e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </Field>

          <Field label="End Pickup Window">
            <Input type="date" value={form.equipmentNeededDate} onChange={e => set('equipmentNeededDate', e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </Field>

          {/* #81: dispatcher-visibility only — not sent to load-board search params */}
          <Field label="Driver Needed Home By">
            <Input type="date" value={form.driverHomeBy} onChange={e => set('driverHomeBy', e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </Field>
        </div>

        <div style={{ borderTop: `1px solid ${t.colors.border.default}`, paddingTop: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Toggle checked={form.isRelay} onChange={v => set('isRelay', v)} label="Relay mode — driver picks up en route home" />

          <div>
            <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.secondary, marginBottom: '8px' }}>
              Modes <span style={{ fontWeight: t.font.weight.medium, color: t.colors.text.muted }}>(optional — combined with the fleet's modes for this search)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {FLEET_MODES.map((m) => {
                const checked = form.modes.includes(m);
                return (
                  <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', border: `1px solid ${checked ? t.colors.accent.blue : t.colors.border.default}`, borderRadius: t.radius.lg, background: checked ? t.colors.accent.blueLight : '#fff', cursor: 'pointer', fontSize: t.font.size.sm, color: t.colors.text.primary, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setForm(f => ({ ...f, modes: f.modes.includes(m) ? f.modes.filter(x => x !== m) : [...f.modes, m] }))}
                    />
                    {m}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Toggle checked={form.autoRefresh} onChange={v => set('autoRefresh', v)} label="Auto-refresh results" />
            {form.autoRefresh && (
              <div style={{ marginTop: '10px', marginLeft: '46px' }}>
                <Field label="Refresh interval">
                  <SelectInput value={form.autoRefreshInterval} onChange={e => set('autoRefreshInterval', parseFloat(e.target.value))} style={{ width: '180px' }}>
                    <option value={0.25}>Every 15 minutes</option>
                    <option value={0.5}>Every 30 minutes</option>
                    <option value={1}>Every 1 hour</option>
                    <option value={4}>Every 4 hours</option>
                  </SelectInput>
                </Field>
                <div style={{ marginTop: '10px' }}>
                  <Field label="Stop after (refreshes)">
                    <Input
                      type="number"
                      value={form.maxAutoRefreshes}
                      onChange={e => set('maxAutoRefreshes', e.target.value)}
                      placeholder="Unlimited"
                      style={{ width: '180px' }}
                    />
                  </Field>
                  <div style={{ marginTop: '4px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                    Leave blank for unlimited. Auto-refresh turns itself off once this many refreshes have run.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <Toggle checked={form.notificationEnabled || form.autoRefresh} onChange={v => set('notificationEnabled', v)} disabled={form.autoRefresh} label="Notify me when top loads change" />
            {form.autoRefresh && (
              <div style={{ marginTop: '4px', marginLeft: '46px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                Required while auto-refresh is on.
              </div>
            )}
            {(form.notificationEnabled || form.autoRefresh) && (
              <div style={{ marginTop: '10px', marginLeft: '46px' }}>
                <Field label="Notification method">
                  <SelectInput value={form.notificationMethod} onChange={e => set('notificationMethod', e.target.value)} style={{ width: '180px' }}>
                    <option value="email">Email</option>
                    <option value="text">Text (SMS)</option>
                    <option value="both">Both</option>
                  </SelectInput>
                </Field>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <PrimaryBtn type="submit" disabled={saving}>
            {saving ? 'Saving…' : (initialValues ? 'Update Request' : 'Save Request')}
          </PrimaryBtn>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        </div>
      </Card>

      {showRefreshConfirm && (() => {
        const { interval, cost } = refreshCreditLabel(form.autoRefreshInterval);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
            onClick={() => setShowRefreshConfirm(false)}>
            <div style={{ background: '#fff', borderRadius: t.radius['2xl'], padding: '32px', maxWidth: '420px', width: '100%', boxShadow: t.shadow.lg }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '22px', marginBottom: '10px' }}>🪙</div>
              <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '10px' }}>Auto-refresh uses credits</div>
              <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary, lineHeight: 1.6, marginBottom: '24px' }}>
                With auto-refresh set to <strong>{interval}</strong>, this request will consume <strong>{cost}</strong>. Each refresh runs a new search and deducts 1 credit.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <PrimaryBtn onClick={() => { setShowRefreshConfirm(false); doSave(); }} disabled={saving}>
                  {saving ? 'Saving…' : 'Yes, save request'}
                </PrimaryBtn>
                <GhostBtn onClick={() => setShowRefreshConfirm(false)}>Go back</GhostBtn>
              </div>
            </div>
          </div>
        );
      })()}
    </form>
  );
}

// ─── Request list (left panel) ───────────────────────────────────────────────

function RequestCard({ request, active, onSelect, onEdit, onDelete, onFinish }) {
  const [hovered, setHovered] = useState(false);
  const isActive = ['active', 'open', 'pending', 'in_progress'].includes(request.status);

  return (
    <div
      onClick={() => onSelect(request)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 14px',
        borderRadius: t.radius.xl,
        cursor: 'pointer',
        background: active ? t.colors.accent.blueLight : hovered ? '#f8fafc' : 'transparent',
        borderLeft: `3px solid ${active ? t.colors.accent.blue : 'transparent'}`,
        marginBottom: '4px',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
        <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, lineHeight: 1.3 }}>
          {request.request_name}
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        <MapPin size={11} color={t.colors.text.muted} />
        {request.datum_point}
      </div>
      {request.equipment_available_date && (
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={11} color={t.colors.text.muted} />
          Avail {new Date(request.equipment_available_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {request.equipment_needed_date && ` – ${new Date(request.equipment_needed_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </div>
      )}
      {request.status === 'in_progress' && onFinish && (
        <div style={{ marginTop: '8px' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onFinish(request)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: t.colors.accent.greenLight, border: `1px solid ${t.colors.accent.green}40`, borderRadius: t.radius.lg, color: t.colors.accent.green, fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, cursor: 'pointer' }}>
            <CheckCircle size={12} /> Finish & keep load
          </button>
        </div>
      )}
      {(hovered || active) && isActive && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(request)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.text.muted, padding: '2px', display: 'flex', alignItems: 'center' }}>
            <Edit size={13} />
          </button>
          <button onClick={() => onDelete(request)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', display: 'flex', alignItems: 'center' }}>
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function RequestListPanel({ requests, selectedId, onSelect, onEdit, onDelete, onFinish, onNew, isMobile }) {
  const active = requests.filter(r => ['active', 'open', 'pending', 'in_progress'].includes(r.status));
  const archived = requests.filter(r => !['active', 'open', 'pending', 'in_progress'].includes(r.status));

  return (
    <div style={{
      width: isMobile ? '100%' : '280px',
      minWidth: isMobile ? '100%' : '280px',
      height: '100%',
      background: t.colors.page.cardBg,
      borderRight: isMobile ? 'none' : `1px solid ${t.colors.page.cardBorder}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 16px 12px', borderBottom: `1px solid ${t.colors.page.cardBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
          <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>
            Requests
          </div>
          <PrimaryBtn onClick={onNew} style={{ padding: '5px 10px', fontSize: t.font.size.xs }}>
            <Plus size={13} /> New
          </PrimaryBtn>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {requests.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: t.colors.text.muted, fontSize: t.font.size.sm }}>
            No requests yet.<br />Click "New" to get started.
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <SectionLabel style={{ paddingLeft: '6px', marginBottom: '8px' }}>Active</SectionLabel>
                {active.map(r => (
                  <RequestCard key={r.id} request={r} active={selectedId === r.id} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} onFinish={onFinish} />
                ))}
              </>
            )}
            {archived.length > 0 && (
              <>
                <SectionLabel style={{ paddingLeft: '6px', marginBottom: '8px', marginTop: active.length ? '16px' : 0 }}>History</SectionLabel>
                {archived.map(r => (
                  <RequestCard key={r.id} request={r} active={selectedId === r.id} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} onFinish={onFinish} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Match result card ────────────────────────────────────────────────────────

const RANK_COLORS = {
  1: { bg: '#f0fdf4', border: '#bbf7d0', badge: '#16a34a', text: '#15803d' },
  2: { bg: '#eff6ff', border: '#bfdbfe', badge: '#2563eb', text: '#1d4ed8' },
  3: { bg: '#eff6ff', border: '#bfdbfe', badge: '#2563eb', text: '#1d4ed8' },
};
const DEFAULT_RANK_COLORS = { bg: '#f8fafc', border: '#e2e8f0', badge: '#64748b', text: '#475569' };

function fmtMoney(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    // A date-only 'YYYY-MM-DD' parses as UTC midnight, which renders as the
    // previous day in US timezones. Anchor to local noon to keep the calendar day.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())
      ? new Date(`${dateStr}T12:00:00`)
      : new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function fmtNum(n, decimals = 1) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(n);
}

function MatchCard({ match, rank, fleet, request, onViewDetails, onMapClick, onHaulThis, onNegotiate, onTruckstopClick, isPending }) {
  const rc = RANK_COLORS[rank] || DEFAULT_RANK_COLORS;

  const hasRateConfig = match.has_rate_config;
  const primaryRevenue = hasRateConfig ? match.customer_net_credit : mTotalRev(match);
  const revenueLabel   = hasRateConfig ? 'Net Credit' : 'Gross Revenue';

  const sourceLabel = {
    directfreight: 'DirectFreight',
    truckerpath:   'TruckerPath',
    dat:           'DAT',
    truckstop:     'Truckstop',
    imported:      'Imported',
  }[match.source] || match.source;

  const boardCfg = match.source && match.source !== 'demo' && LOAD_BOARD_CONFIG[match.source];
  const boardHref = boardCfg
    ? boardCfg.url(match.source_load_id || match.load_id, match)
    : null;

  // const loadId = match.load_id || match.id;
  // const [aiAnalysis, setAiAnalysis] = useState(null);
  // const [aiLoading, setAiLoading] = useState(false);
  // const [aiFeedback, setAiFeedback] = useState(null);
  // const handleAiAnalyze = async () => { ... };
  // const handleAiFeedback = async (rating) => { ... };
  // const submitAiFeedback = async (rating, comment) => { ... };

  return (
    <div style={{
      background: rc.bg,
      border: `1px solid ${rc.border}`,
      borderRadius: t.radius.xl,
      marginBottom: '12px',
      overflow: 'hidden',
    }}>
      {/* ── Header: rank + board link + revenue ── */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{
            padding: '4px 12px',
            borderRadius: t.radius.full,
            background: `${rc.badge}20`,
            fontSize: t.font.size.xs,
            fontWeight: t.font.weight.bold,
            color: rc.badge,
          }}>
            #{rank}
          </div>
          {match.source === 'truckstop' ? (
            boardHref ? (
              <button
                onClick={e => { e.stopPropagation(); onTruckstopClick && onTruckstopClick(match, boardHref); }}
                title="View load on Truckstop"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.9 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.9'}
              >
                <img src="/Waypoint%20Default.png" alt="View on Truckstop" style={{ height: '20px', display: 'block' }} />
              </button>
            ) : (
              <img src="/Waypoint%20Default.png" alt="Truckstop load" style={{ height: '20px', display: 'block', opacity: 0.9 }} />
            )
          ) : (boardCfg && boardHref && (
            <a
              href={boardHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                padding: '3px 8px',
                background: '#fff',
                border: `1px solid ${t.colors.border.default}`,
                borderRadius: t.radius.md,
                fontSize: '11px',
                fontWeight: t.font.weight.bold,
                color: t.colors.accent.blue,
                textDecoration: 'none',
                letterSpacing: '0.02em',
              }}
            >
              {boardCfg.name} ↗
            </a>
          ))}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {isNoRateLoad(match) ? (
            <>
              <div style={{ fontSize: t.font.size.md, fontWeight: t.font.weight.bold, color: t.colors.accent.amber }}>Call for rate</div>
              <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '5px' }}>No posted rate</div>
              <button
                onClick={e => { e.stopPropagation(); onNegotiate(match); }}
                style={{ padding: '4px 10px', background: 'none', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md, color: t.colors.accent.blue, fontSize: '11px', fontWeight: t.font.weight.bold, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <TrendingUp size={12} /> Negotiate
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: rc.text }}>
                {fmtMoney(primaryRevenue)}
              </div>
              <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{revenueLabel}</div>
              {hasRateConfig && (
                <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                  Gross: {fmtMoney(mTotalRev(match))} · {fmtMoney(mRevPerMile(match))}/mi
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 3-col route: PICKUP | distance | DELIVERY ── */}
      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
            <MapPin size={13} color={t.colors.accent.blue} />
            <span style={{ fontSize: '10px', fontWeight: t.font.weight.bold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pickup</span>
          </div>
          <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, lineHeight: 1.3 }}>
            {mOriginAddr(match)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            {fmtDate(mPickupDate(match))}
            <DateFitBadge dateFit={match.date_fit} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <Navigation size={18} color={t.colors.accent.blue} />
          <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.secondary, whiteSpace: 'nowrap' }}>
            {fmtNum(mDistance(match), 0)} mi
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '10px', fontWeight: t.font.weight.bold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Delivery</span>
            <MapPin size={13} color='#16a34a' />
          </div>
          <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, lineHeight: 1.3 }}>
            {mDestAddr(match)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
            {fmtDate(mDeliveryDate(match))}
          </div>
        </div>
      </div>

      {/* ── Metrics grid ── */}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${rc.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
        {[
          { label: 'Equipment', value: mEquipType(match) },
          { label: 'Weight', value: mWeight(match) ? `${fmtNum(mWeight(match) / 1000, 0)}k lbs` : '—' },
          { label: 'Length', value: mLength(match) ? `${mLength(match)} ft` : '—' },
          { label: 'OOR Miles', value: `+${fmtNum(mAdditional(match), 0)} mi` },
          { label: 'To Pickup', value: `${fmtNum(mToPickup(match), 0)} mi` },
          { label: '$/Mile', value: mRevPerMile(match) ? `$${mRevPerMile(match).toFixed(2)}` : '—' },
          match.days_to_pay != null && { label: 'Pay Terms', value: `Net ${match.days_to_pay}` },
          match.age_hours > 0 && { label: 'Posted', value: match.age_hours < 24 ? `${match.age_hours}h ago` : `${Math.floor(match.age_hours / 24)}d ago` },
          match.fuel_cost != null && { label: 'Est. Fuel', value: `$${match.fuel_cost.toFixed(0)}` },
          match.experience_factor && { label: 'Broker', value: match.experience_factor },
        ].filter(Boolean).map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: '10px', fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Financial breakdown ── */}
      {hasRateConfig && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${rc.border}`, background: 'rgba(255,255,255,0.7)' }}>
          <div style={{ fontSize: '10px', fontWeight: t.font.weight.bold, color: t.colors.accent.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Financial Breakdown
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '10px' }}>
            {[
              { label: 'Customer Share', value: fmtMoney(match.customer_share) },
              { label: 'Mileage Exp', value: `-${fmtMoney(match.mileage_expense)}` },
              { label: `Stop Exp (${match.stop_count ?? 0})`, value: `-${fmtMoney(match.stop_expense)}` },
              { label: 'Fuel Surcharge', value: `-${fmtMoney(match.fuel_surcharge)}` },
              ...(match.other_charges > 0 ? [{ label: 'Other Charges', value: `-${fmtMoney(match.other_charges)}` }] : []),
              { label: 'Carrier Revenue', value: fmtMoney(match.carrier_revenue) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.secondary }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${rc.border}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '10px', color: t.colors.text.muted }}>
              FSC: ({match.fsc_per_mile?.toFixed(3)}/mi × {fmtNum(mAdditional(match), 0)} OOR mi) = {fmtMoney(match.fuel_surcharge)}
            </div>
            <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: (match.customer_net_credit ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
              Net: {fmtMoney(match.customer_net_credit)}
            </div>
          </div>
        </div>
      )}

      {/* ── Broker / Shipper / Freight ── */}
      {(match.broker || match.shipper || mFreight(match)) && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${rc.border}`, background: 'rgba(255,255,255,0.5)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
          <div><strong style={{ color: t.colors.text.primary }}>Broker:</strong> {match.broker || '—'}</div>
          <div><strong style={{ color: t.colors.text.primary }}>Shipper:</strong> {match.shipper || '—'}</div>
          <div><strong style={{ color: t.colors.text.primary }}>Freight:</strong> {mFreight(match) || '—'}</div>
          {match.credit && <div><strong style={{ color: t.colors.text.primary }}>Credit:</strong> {match.credit}</div>}
          {match.experience_factor && <div><strong style={{ color: t.colors.text.primary }}>Rating:</strong> {match.experience_factor}</div>}
        </div>
      )}
      {(match.contactPhone || match.companyEmail) && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${rc.border}`, background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: t.font.size.xs }}>
          <span style={{ color: t.colors.text.muted, fontWeight: t.font.weight.semibold }}>Contact Broker:</span>
          {match.contactPhone && <>
            <a href={`tel:${match.contactPhone}`} onClick={e => e.stopPropagation()} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 10px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md, whiteSpace: 'nowrap' }}>Call</a>
            <a href={`sms:${match.contactPhone}`} onClick={e => e.stopPropagation()} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 10px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md, whiteSpace: 'nowrap' }}>Text</a>
            <span style={{ color: t.colors.text.secondary }}>{match.contactPhone}</span>
          </>}
          {match.companyEmail && <a href={`mailto:${match.companyEmail}`} onClick={e => e.stopPropagation()} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 10px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md, whiteSpace: 'nowrap' }}>Email</a>}
        </div>
      )}
      {match.special_info && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${rc.border}`, background: 'rgba(255,255,255,0.5)', fontSize: t.font.size.xs }}>
          <span style={{ color: t.colors.text.muted, fontWeight: t.font.weight.semibold }}>Special Instructions: </span>
          <span style={{ color: t.colors.text.primary, fontStyle: 'italic' }}>{match.special_info}</span>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${rc.border}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onViewDetails(match)}
            style={{
              flex: 1, padding: '9px 12px',
              background: t.colors.accent.blue,
              border: 'none',
              borderRadius: t.radius.lg,
              color: '#fff',
              fontSize: t.font.size.xs,
              fontWeight: t.font.weight.bold,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            }}
          >
            <Package size={13} /> View Details
          </button>
          <button
            onClick={() => onMapClick(match)}
            style={{
              flex: 1, padding: '9px 12px',
              background: 'transparent',
              border: `1px solid ${t.colors.accent.blue}`,
              borderRadius: t.radius.lg,
              color: t.colors.accent.blue,
              fontSize: t.font.size.xs,
              fontWeight: t.font.weight.bold,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            }}
          >
            <Map size={13} /> View on Map
          </button>
        </div>
        <button
          onClick={() => onHaulThis(match)}
          style={{
            width: '100%', padding: '9px 12px',
            background: '#16a34a',
            border: 'none',
            borderRadius: t.radius.lg,
            color: '#fff',
            fontSize: t.font.size.xs,
            fontWeight: t.font.weight.bold,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          }}
        >
          <TrendingUp size={13} /> Haul This Load
          {isPending && (
            <span style={{ marginLeft: '4px', background: 'rgba(255,255,255,0.25)', borderRadius: '10px', padding: '1px 6px', fontSize: '10px' }}>viewed on TS</span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Route Details Modal ──────────────────────────────────────────────────────

function RouteDetailsModal({ match, request, fleetHome, onClose, onHaulThis, onViewMap }) {
  if (!match) return null;

  const directMiles    = match.direct_return_miles ?? mAdditional(match) ?? 0;
  const datumToPickup  = match.datum_to_pickup_miles ?? mToPickup(match) ?? 0;
  const pickupToDelivery = match.pickup_to_delivery_miles ?? mDistance(match) ?? 0;
  const deliveryToHome = match.delivery_to_home_miles ?? 0;
  const totalWithBackhaul = match.total_miles ?? match.oorMiles ?? 0;
  const extraMiles     = mAdditional(match);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: t.radius['2xl'], maxWidth: '800px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: t.shadow.lg }}
      >
        {/* Modal header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.colors.border.default}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '2px' }}>
              {mOriginAddr(match)} → {mDestAddr(match)}
            </div>
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
              {mEquipType(match)} · {mWeight(match) ? `${fmtNum(mWeight(match))} lbs` : ''} · {mLength(match) ? `${mLength(match)} ft` : ''} · {mFreight(match) || ''}
            </div>
            {/* #81: dispatcher signal — display only. Kept in the left header block so the
                right side stays free for the upcoming "send this load" action. */}
            {request?.driver_home_by && (
              <div style={{ marginTop: '4px', fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.accent.blue, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} /> Driver Needed Home By: {fmtDate(request.driver_home_by)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* #82: Share this load — Email / Text / Copy */}
            <LoadShareMenu
              match={match}
              request={request}
              fleetHome={fleetHome}
              palette={{ accent: t.colors.accent.blue, text: t.colors.text.primary, textMuted: t.colors.text.muted, border: t.colors.border.default, cardBg: '#fff', inputBg: '#fff' }}
            />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.text.muted, padding: '4px', fontSize: '20px', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Route Comparison */}
          <div>
            <SectionLabel style={{ marginBottom: '12px' }}>Route Comparison</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Empty return */}
              <div style={{ padding: '16px', background: '#f8fafc', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl }}>
                <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.text.muted, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Truck size={13} color={t.colors.text.muted} /> EMPTY RETURN
                </div>
                <div style={{ fontSize: t.font.size.xs, color: t.colors.text.secondary, display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{request?.datum_point}</span>
                  <span>→</span>
                  <span>Home</span>
                </div>
                <div style={{ borderTop: `1px solid ${t.colors.border.default}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{fmtNum(directMiles, 0)} mi</span>
                  <span style={{ fontWeight: t.font.weight.bold, color: '#dc2626' }}>$0</span>
                </div>
              </div>

              {/* With backhaul */}
              <div style={{ padding: '16px', background: t.colors.accent.blueLight, border: `2px solid ${t.colors.accent.blue}`, borderRadius: t.radius.xl }}>
                <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.accent.blue, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <TrendingUp size={13} color={t.colors.accent.blue} /> WITH BACKHAUL
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Datum → Pickup</span>
                    <span style={{ fontWeight: t.font.weight.semibold }}>{fmtNum(datumToPickup, 0)} mi</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Load ({mOriginAddr(match)} → {mDestAddr(match)})</span>
                    <span style={{ fontWeight: t.font.weight.semibold }}>{fmtNum(pickupToDelivery, 0)} mi</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Delivery → Home</span>
                    <span style={{ fontWeight: t.font.weight.semibold }}>{fmtNum(deliveryToHome, 0)} mi</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${t.colors.accent.blue}40`, paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{fmtNum(totalWithBackhaul, 0)} mi</span>
                    <span style={{ fontWeight: t.font.weight.bold, color: t.colors.accent.blue }}>+{fmtMoney(mTotalRev(match))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net impact bar */}
            <div style={{ marginTop: '10px', padding: '12px 16px', background: t.colors.accent.blueLight, border: `1px solid ${t.colors.accent.blue}40`, borderRadius: t.radius.xl, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.accent.blue }}>+{fmtMoney(mTotalRev(match))}</div>
                <div style={{ fontSize: '10px', color: t.colors.text.muted }}>Extra Revenue</div>
              </div>
              <div>
                <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: extraMiles > 0 ? '#f59e0b' : t.colors.accent.blue }}>
                  {extraMiles > 0 ? '+' : ''}{fmtNum(extraMiles, 0)} mi
                </div>
                <div style={{ fontSize: '10px', color: t.colors.text.muted }}>Extra Miles</div>
              </div>
              <div>
                <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: '#16a34a' }}>+{fmtMoney(mRevPerMile(match))}/mi</div>
                <div style={{ fontSize: '10px', color: t.colors.text.muted }}>Revenue Per Mile</div>
              </div>
            </div>
          </div>

          {/* Financial Breakdown */}
          {match.has_rate_config && (
            <div>
              <SectionLabel style={{ marginBottom: '12px' }}>Financial Breakdown</SectionLabel>
              <div style={{ padding: '16px', background: '#f8fafc', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                  {[
                    { label: 'Gross Revenue', value: fmtMoney(mTotalRev(match)), color: t.colors.text.primary },
                    { label: 'Customer Share', value: fmtMoney(match.customer_share), color: t.colors.text.primary },
                    { label: 'Carrier Revenue', value: fmtMoney(match.carrier_revenue), color: t.colors.accent.blue },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>{label}</div>
                      <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${t.colors.border.default}`, paddingTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                  {[
                    { label: 'Mileage Exp', value: `-${fmtMoney(match.mileage_expense)}` },
                    { label: `Stop Exp (${match.stop_count ?? 0})`, value: `-${fmtMoney(match.stop_expense)}` },
                    { label: 'Fuel Surcharge', value: `-${fmtMoney(match.fuel_surcharge)}`, note: `${match.fsc_per_mile?.toFixed(3)}/mi × ${fmtNum(extraMiles, 0)} mi` },
                    ...(match.other_charges > 0 ? [{ label: 'Other Charges', value: `-${fmtMoney(match.other_charges)}` }] : []),
                  ].map(({ label, value, note }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>{label}</div>
                      <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: '#dc2626' }}>{value}</div>
                      {note && <div style={{ fontSize: '10px', color: t.colors.text.muted }}>{note}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `2px solid ${t.colors.border.default}`, paddingTop: '10px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>Customer Net Credit:</span>
                  <span style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: (match.customer_net_credit ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtMoney(match.customer_net_credit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Load Details */}
          <div>
            <SectionLabel style={{ marginBottom: '12px' }}>Load Details</SectionLabel>
            <div style={{ padding: '16px', background: '#f8fafc', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {[
                  match.source && { label: 'Load Source', value: match.source === 'truckstop' ? <img src="/Waypoint%20Default.png" alt="Truckstop Waypoint" title="Truckstop load" style={{ height: '16px', display: 'block' }} /> : ({ directfreight: 'DirectFreight', truckerpath: 'TruckerPath', dat: 'DAT', imported: 'Imported' }[match.source] || match.source) },
                  (match.df_load_number || match.source_load_id || match.load_id) && { label: 'Load Number', value: match.df_load_number || match.source_load_id || match.load_id, mono: true },
                  { label: 'Pickup Date', value: match.pickup_time ? `${fmtDate(mPickupDate(match))} · ${match.pickup_time}` : fmtDate(mPickupDate(match)) },
                  { label: 'Delivery Date', value: match.delivery_time ? `${fmtDate(mDeliveryDate(match))} · ${match.delivery_time}` : fmtDate(mDeliveryDate(match)) },
                  { label: 'Broker', value: match.broker || '—' },
                  { label: 'Shipper', value: match.shipper || '—' },
                  { label: 'Freight', value: mFreight(match) || '—' },
                  { label: 'Distance Source', value: match.distance_source === 'pcmiler' ? 'PC*Miler' : 'Estimated', color: match.distance_source === 'pcmiler' ? '#16a34a' : t.colors.text.secondary },
                  match.posted_rate_per_mile > 0 && { label: 'Posted $/mi', value: `$${match.posted_rate_per_mile.toFixed(2)}` },
                  match.days_to_pay != null && { label: 'Pay Terms', value: `Net ${match.days_to_pay}` },
                  match.age_hours > 0 && { label: 'Posted', value: match.age_hours < 24 ? `${match.age_hours}h ago` : `${Math.floor(match.age_hours / 24)}d ago`, color: match.age_hours > 48 ? '#dc2626' : undefined },
                  match.fuel_cost != null && { label: 'Est. Fuel Cost', value: `$${match.fuel_cost.toFixed(2)}` },
                  match.experience_factor && { label: 'Broker Rating', value: match.experience_factor, color: match.experience_factor === 'A' ? '#16a34a' : undefined },
                  match.credit && { label: 'Broker Credit', value: match.credit },
                  match.equipment_options && { label: 'Equip. Options', value: match.equipment_options, color: t.colors.accent.blue },
                  match.contactPhone && {
                    label: 'Contact Broker',
                    value: (
                      <span style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <a href={`tel:${match.contactPhone}`} onClick={e => e.stopPropagation()} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 8px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md, fontSize: t.font.size.xs, whiteSpace: 'nowrap' }}>Call</a>
                        <a href={`sms:${match.contactPhone}`} onClick={e => e.stopPropagation()} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 8px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md, fontSize: t.font.size.xs, whiteSpace: 'nowrap' }}>Text</a>
                        <span style={{ color: t.colors.text.secondary, fontSize: t.font.size.xs }}>{match.contactPhone}</span>
                      </span>
                    )
                  },
                  match.companyEmail && {
                    label: 'Broker Email',
                    value: <a href={`mailto:${match.companyEmail}`} onClick={e => e.stopPropagation()} style={{ color: t.colors.accent.blue, textDecoration: 'none', wordBreak: 'break-all' }}>{match.companyEmail}</a>
                  },
                  match.special_info && { label: 'Special Instructions', value: match.special_info, span: true },
                ].filter(Boolean).map(({ label, value, mono, color, span }) => (
                  <div key={label} style={span ? { gridColumn: '1 / -1' } : {}}>
                    <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: t.font.size.sm, fontWeight: span ? t.font.weight.normal : t.font.weight.semibold, color: color || t.colors.text.primary, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all', fontStyle: span ? 'italic' : 'normal' }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer CTA — sticky so the actions stay visible without scrolling (#82 bonus) */}
          <div style={{ display: 'flex', gap: '10px', position: 'sticky', bottom: 0, background: '#fff', margin: '0 -24px -24px', padding: '12px 24px 16px', borderTop: `1px solid ${t.colors.border.default}` }}>
            <button
              onClick={onHaulThis}
              style={{ flex: 1, padding: '12px 20px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.xl, color: '#fff', fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <TrendingUp size={16} /> Haul This Load
            </button>
            <button
              onClick={onViewMap}
              style={{ padding: '12px 16px', background: 'transparent', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.xl, color: t.colors.accent.blue, fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Map size={15} /> View on Map
            </button>
            <button
              onClick={onClose}
              style={{ padding: '12px 16px', background: 'transparent', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl, color: t.colors.text.muted, fontSize: t.font.size.sm, fontWeight: t.font.weight.medium, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Map Modal ────────────────────────────────────────────────────────────────

function MapModal({ match, onClose }) {
  if (!match) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '1200px', height: '80vh', background: '#fff', borderRadius: t.radius['2xl'], overflow: 'hidden', boxShadow: t.shadow.lg }}
      >
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.colors.border.default}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
            {mOriginAddr(match)} → {mDestAddr(match)}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.text.muted, fontSize: '22px', lineHeight: 1, padding: '2px' }}>✕</button>
        </div>
        <div style={{ height: 'calc(100% - 54px)' }}>
          <RouteMap
            route={{
              origin_lat: mOriginLat(match),
              origin_lng: mOriginLng(match),
              dest_lat: mDestLat(match),
              dest_lng: mDestLng(match),
              origin_city: mOriginAddr(match),
              dest_city: mDestAddr(match),
              distance_miles: mDistance(match),
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Haul Confirm Dialog ──────────────────────────────────────────────────────

function HaulConfirmDialog({ match, completing, onConfirm, onClose }) {
  const [keepSearching, setKeepSearching] = useState(false);
  if (!match) return null;
  return (
    <div
      onClick={() => !completing && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: t.radius['2xl'], padding: '28px', maxWidth: '460px', width: '100%', boxShadow: t.shadow.lg }}
      >
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '6px' }}>
          Confirm Haul
        </div>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginBottom: '20px' }}>
          Record this as a completed haul? This will log the net revenue to your dashboard.
        </div>
        <div style={{ background: '#f8fafc', borderRadius: t.radius.xl, padding: '14px', marginBottom: '20px' }}>
          <div style={{ fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '2px' }}>
            {mOriginAddr(match)} → {mDestAddr(match)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '12px' }}>
            {fmtNum(mAdditional(match), 0)} out-of-route miles
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>Gross Revenue</div>
              <div style={{ fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{fmtMoney(mTotalRev(match))}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>Net Revenue</div>
              <div style={{ fontWeight: t.font.weight.bold, color: (match.customer_net_credit ?? match.netRevenue ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtMoney(match.customer_net_credit ?? match.netRevenue ?? 0)}</div>
            </div>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '20px' }}>
          <input type="checkbox" checked={keepSearching} onChange={(e) => setKeepSearching(e.target.checked)} disabled={completing} style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }} />
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
            <span style={{ fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>Keep checking for matching loads</span><br />
            Leaves this request open with auto-refresh running (credits still apply). Leave unchecked if this is your final load — the request completes and auto-refresh turns off.
          </span>
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => onConfirm(keepSearching)}
            disabled={completing}
            style={{ flex: 1, padding: '11px 20px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.xl, color: '#fff', fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.7 : 1 }}
          >
            {completing ? 'Recording…' : (keepSearching ? 'Confirm Haul & Keep Searching' : 'Confirm Haul')}
          </button>
          <button
            onClick={onClose}
            disabled={completing}
            style={{ padding: '11px 20px', background: 'transparent', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl, color: t.colors.text.muted, fontSize: t.font.size.sm, fontWeight: t.font.weight.medium, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Negotiation helper for $0 / no-rate loads (item 005).
function NegotiationDialog({ match, matches, onClose }) {
  if (!match) return null;
  const neg = computeNegotiation(match);
  const others = (matches || []).filter(m => m !== match);
  const rankAt = (gross) => {
    if (!neg) return null;
    const nc = netCreditAtGross(gross, neg.routeCharges, neg.customerPct);
    return others.filter(m => (m.customer_net_credit ?? -Infinity) > nc).length + 1;
  };
  const total = (matches || []).length;
  const charges = neg ? [
    ['Mileage', match.mileage_expense], ['Stops', match.stop_expense],
    ['Fuel surcharge', match.fuel_surcharge], ['Other charges', match.other_charges],
  ] : [];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: t.radius['2xl'], padding: '28px', maxWidth: '480px', width: '100%', boxShadow: t.shadow.lg, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '4px' }}>Negotiate this load</div>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginBottom: '16px' }}>{mOriginAddr(match)} → {mDestAddr(match)}</div>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary, background: t.colors.accent.amberLight, border: `1px solid ${t.colors.accent.amber}40`, borderRadius: t.radius.lg, padding: '12px', marginBottom: '20px' }}>
          The broker posted <strong>no rate</strong> — often an invitation to call and negotiate. Here's a number to lead with.
        </div>

        {neg ? (
          <>
            <div style={{ background: '#f8fafc', borderRadius: t.radius.xl, padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: t.font.weight.bold, color: t.colors.text.muted, marginBottom: '8px' }}>Route charges to cover ({fmtNum(mAdditional(match), 0)} OOR mi)</div>
              {charges.map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: t.font.size.sm, color: t.colors.text.secondary, marginBottom: '4px' }}>
                  <span>{label}</span><span>{fmtMoney(val || 0)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.primary, borderTop: `1px solid ${t.colors.border.default}`, marginTop: '6px', paddingTop: '6px' }}>
                <span>Total to clear</span><span>{fmtMoney(neg.routeCharges)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: t.radius.xl, padding: '14px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: t.font.weight.bold, color: t.colors.text.muted }}>Walk-away floor</div>
                <div style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary }}>{fmtMoney(neg.breakevenGross)}</div>
                <div style={{ fontSize: '10px', color: t.colors.text.muted }}>covers charges (net $0)</div>
              </div>
              <div style={{ flex: 1, background: t.colors.accent.greenLight, border: `1px solid ${t.colors.status.active}40`, borderRadius: t.radius.xl, padding: '14px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: t.font.weight.bold, color: t.colors.status.active }}>Lead with</div>
                <div style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.black, color: t.colors.status.active }}>{fmtMoney(neg.targetGross)}</div>
                <div style={{ fontSize: '10px', color: t.colors.text.muted }}>breakeven +{Math.round(neg.margin * 100)}%</div>
              </div>
            </div>

            <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary, lineHeight: 1.5 }}>
              If you land <strong style={{ color: t.colors.text.primary }}>{fmtMoney(neg.targetGross)}</strong>, this load would rank <strong style={{ color: t.colors.status.active }}>#{rankAt(neg.targetGross)}</strong> of {total} by customer net credit.
              <br />At the floor of <strong style={{ color: t.colors.text.primary }}>{fmtMoney(neg.breakevenGross)}</strong> it would rank #{rankAt(neg.breakevenGross)}.
            </div>
          </>
        ) : (
          <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary }}>
            Set your fleet rate config (cost per mile, fuel surcharge, stop rate) to get a suggested number to negotiate.
          </div>
        )}

        <button onClick={onClose} style={{ marginTop: '20px', width: '100%', padding: '11px', background: 'transparent', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.xl, color: t.colors.text.muted, fontSize: t.font.size.sm, fontWeight: t.font.weight.medium, cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}

// ─── Results panel (right side when request selected) ────────────────────────

function ResultsPanel({ request, fleet, matches, routeData, datumCoords, isLoading, error, onRun, onEdit, onComplete, timeUntilRefresh }) {
  const isMobile = useMobile();
  const [mapVisible, setMapVisible] = useState(true);
  const [mapFocusLoad, setMapFocusLoad] = useState(null);

  // Modal state
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [mapMatch, setMapMatch] = useState(null);
  const [haulMatch, setHaulMatch] = useState(null);
  const [negotiateMatch, setNegotiateMatch] = useState(null);
  const [completing, setCompleting] = useState(false);

  // Pending / nudge state
  const [pendingLoads, setPendingLoads] = useState(new Set());
  const [toastLoad, setToastLoad] = useState(null);
  const toastTimerRef = useRef(null);

  const fleetHome = fleet ? { lat: fleet.home_lat, lng: fleet.home_lng, address: fleet.home_address } : null;

  const handleHaulConfirm = async (keepSearching = false) => {
    if (!haulMatch) return;
    setCompleting(true);
    // NaN is not caught by ??, so coerce all numeric fields explicitly
    const safeNum = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
    try {
      // Item 008: "keep searching" → interim in_progress, auto-refresh stays on.
      // Final load → completed + auto_refresh off (no further credits). Option A:
      // only a completed request counts toward the dashboard (single haul).
      await db.requests.update(request.id, {
        status: keepSearching ? 'in_progress' : 'completed',
        revenue_amount: safeNum(mTotalRev(haulMatch)),
        net_revenue: safeNum(haulMatch.customer_net_credit ?? haulMatch.netRevenue),
        out_of_route_miles: safeNum(mAdditional(haulMatch)),
        load_distance_miles: safeNum(mDistance(haulMatch)) || null,
        completed_at: keepSearching ? null : new Date().toISOString(),
        hauled_load_id: haulMatch.load_id || haulMatch.source_load_id || null,
        hauled_load_source: haulMatch.source || null,
        ...(keepSearching ? {} : { auto_refresh: false }),
      });
      const id = haulMatch.load_id || haulMatch.id;
      setPendingLoads(prev => { const next = new Set(prev); next.delete(id); return next; });
      setHaulMatch(null);
      if (onComplete) onComplete();
    } catch (err) {
      console.error('Error recording haul:', err?.message || err, err?.details || '');
    } finally {
      setCompleting(false);
    }
  };

  const handleTruckstopClick = (match, href) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    const id = match.load_id || match.id;
    setPendingLoads(prev => { const next = new Set(prev); next.add(id); return next; });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastLoad(match);
    toastTimerRef.current = setTimeout(() => setToastLoad(null), 5000);
  };

  const dismissPending = (id) => {
    setPendingLoads(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.colors.page.cardBorder}`, background: t.colors.page.cardBg }}>
        <div style={{ fontSize: isMobile ? t.font.size.base : t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '2px' }}>
          {request.request_name}
        </div>
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><MapPin size={11} />{request.datum_point}</span>
          {fleet && <span>· {fleet.name}</span>}
          {!isLoading && matches.length > 0 && <span>· {matches.length} match{matches.length !== 1 ? 'es' : ''}</span>}
          {/* #81: dispatcher signal — display only, does not affect matching */}
          {request.driver_home_by && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: t.colors.accent.blue, fontWeight: t.font.weight.semibold }}>
              · <Calendar size={11} /> Driver Needed Home By: {fmtDate(request.driver_home_by)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <GhostBtn onClick={() => setMapVisible(v => !v)} style={{ padding: '6px 12px', fontSize: t.font.size.xs }}>
            {mapVisible ? 'Hide Map' : 'Show Map'}
          </GhostBtn>
          <GhostBtn onClick={() => onEdit(request)} style={{ padding: '6px 10px', fontSize: t.font.size.xs }}>
            <Edit size={13} /> Edit
          </GhostBtn>
          <PrimaryBtn onClick={onRun} disabled={isLoading} style={{ padding: '6px 14px', fontSize: t.font.size.xs }}>
            <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            {isLoading ? 'Searching…' : <><span>Run Search</span><CreditBadge /></>}
          </PrimaryBtn>
          {request.auto_refresh && timeUntilRefresh && !isLoading && (
            <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} />
              {timeUntilRefresh}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
        {/* Map */}
        {mapVisible && datumCoords && fleetHome && (
          <Card style={{ marginBottom: '20px', overflow: 'hidden' }}>
            <RouteHomeMap
              datumPoint={datumCoords}
              fleetHome={fleetHome}
              backhauls={matches}
              routeData={routeData}
              selectedLoadId={mapFocusLoad?.load_id}
            />
          </Card>
        )}

        {/* Loading state */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '110px', borderRadius: t.radius.xl, background: '#f1f5f9', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <AlertCircle size={32} color="#ef4444" style={{ margin: '0 auto 12px' }} />
            <div style={{ color: t.colors.text.primary, fontWeight: t.font.weight.semibold, marginBottom: '6px' }}>Search failed</div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>{error}</div>
          </Card>
        )}

        {/* Empty state — no matches */}
        {!isLoading && !error && matches.length === 0 && datumCoords && (
          <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
            <Package size={36} color={t.colors.text.muted} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>
              No matches found
            </div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm, maxWidth: '360px', margin: '0 auto' }}>
              No loads were found along this route. Try a different datum point or check that the fleet's home address is set correctly.
            </div>
          </Card>
        )}

        {/* Prompt to run (first visit) */}
        {!isLoading && !error && matches.length === 0 && !datumCoords && (
          <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
            <Search size={36} color={t.colors.text.muted} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>
              Ready to search
            </div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm, marginBottom: '20px' }}>
              Click "Run Search" to find backhaul loads along this route.
            </div>
            <PrimaryBtn onClick={onRun}>
              <Search size={14} /> Run Search <CreditBadge />
            </PrimaryBtn>
          </Card>
        )}

        {/* Match cards */}
        {!isLoading && matches.length > 0 && (
          <>
            <SectionLabel style={{ marginBottom: '12px' }}>
              {matches.length} Load{matches.length !== 1 ? 's' : ''} Found — Ranked by {matches[0]?.has_rate_config ? 'Net Credit' : 'Revenue'}
            </SectionLabel>

            {/* Pending loads banner */}
            {pendingLoads.size > 0 && (() => {
              const pending = matches.filter(m => pendingLoads.has(m.load_id || m.id));
              if (!pending.length) return null;
              return (
                <div style={{ marginBottom: '12px', padding: '14px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: t.radius.xl }}>
                  <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: '#15803d', marginBottom: '8px' }}>Did you book one of these?</div>
                  {pending.map(m => {
                    const id = m.load_id || m.id;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ flex: 1, minWidth: '140px', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
                          {mOriginAddr(m)} → {mDestAddr(m)}
                        </span>
                        <button onClick={() => { setHaulMatch(m); dismissPending(id); }} style={{ padding: '4px 12px', background: '#16a34a', border: 'none', borderRadius: t.radius.md, color: '#fff', fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Mark as Hauled
                        </button>
                        <button onClick={() => dismissPending(id)} style={{ padding: '4px 8px', background: 'none', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.md, color: t.colors.text.muted, fontSize: t.font.size.xs, cursor: 'pointer' }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {matches.map((match, idx) => (
              <MatchCard
                key={match.load_id || idx}
                match={match}
                rank={idx + 1}
                fleet={fleet}
                request={request}
                onViewDetails={m => setSelectedMatch(m)}
                onMapClick={m => { setMapFocusLoad(m); setMapMatch(m); }}
                onHaulThis={m => setHaulMatch(m)}
                onNegotiate={m => setNegotiateMatch(m)}
                onTruckstopClick={handleTruckstopClick}
                isPending={pendingLoads.has(match.load_id || match.id)}
              />
            ))}
          </>
        )}
      </div>

      {/* Co-driver — only shown when there are results */}
      {matches.length > 0 && (
        <CoDriverV2
          context="results"
          contextData={{ matches, fleet, request }}
        />
      )}

      {/* Modals */}
      <RouteDetailsModal
        match={selectedMatch}
        request={request}
        fleetHome={fleetHome}
        onClose={() => setSelectedMatch(null)}
        onHaulThis={() => { setHaulMatch(selectedMatch); setSelectedMatch(null); }}
        onViewMap={() => { setMapMatch(selectedMatch); setSelectedMatch(null); }}
      />
      <MapModal
        match={mapMatch}
        onClose={() => setMapMatch(null)}
      />
      <HaulConfirmDialog
        match={haulMatch}
        completing={completing}
        onConfirm={handleHaulConfirm}
        onClose={() => setHaulMatch(null)}
      />
      <NegotiationDialog
        match={negotiateMatch}
        matches={matches}
        onClose={() => setNegotiateMatch(null)}
      />

      {/* Truckstop nudge toast */}
      {toastLoad && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 20000, background: '#fff', border: '1px solid #86efac', borderRadius: t.radius.xl, padding: '16px', maxWidth: '340px', boxShadow: t.shadow.lg, animation: 'fadeInUp 0.2s ease' }}>
          <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '2px' }}>
            {mOriginAddr(toastLoad)} → {mDestAddr(toastLoad)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '12px' }}>
            If you book it, mark it as hauled to track your revenue.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setHaulMatch(toastLoad); setToastLoad(null); }} style={{ flex: 1, padding: '8px 12px', background: '#16a34a', border: 'none', borderRadius: t.radius.lg, color: '#fff', fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, cursor: 'pointer' }}>
              Mark as Hauled
            </button>
            <button onClick={() => setToastLoad(null)} style={{ padding: '8px 12px', background: 'none', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.lg, color: t.colors.text.muted, fontSize: t.font.size.xs, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Empty / placeholder right panel ─────────────────────────────────────────

function EmptyRight() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: t.colors.page.bg }}>
      <div style={{ textAlign: 'center', maxWidth: '320px' }}>
        <div style={{
          width: '64px', height: '64px',
          borderRadius: t.radius['2xl'],
          background: t.colors.accent.blueLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Search size={28} color={t.colors.accent.blue} />
        </div>
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '8px' }}>
          Find Backhaul Loads
        </div>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, lineHeight: 1.6 }}>
          Select a request from the list or create a new one to find loads along your route home.
        </div>
      </div>
    </div>
  );
}

// ─── Credits insufficient banner ──────────────────────────────────────────────

function NoCreditsBanner({ onDismiss }) {
  return (
    <div style={{
      margin: '16px 24px 0',
      padding: '14px 16px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: t.radius.xl,
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: t.font.size.sm, color: '#991b1b' }}>
        <strong>Insufficient credits.</strong> Purchase more credits to run a search.
      </div>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', padding: '2px', display: 'flex', alignItems: 'center' }}>
        <X size={15} />
      </button>
    </div>
  );
}

// ─── Main SearchView ──────────────────────────────────────────────────────────

export function SearchView() {
  const { user } = useAuth();
  const { deductCredit } = useCredits();

  const [requests, setRequests] = useState([]);
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState('empty'); // 'empty' | 'form' | 'results'
  const [editingRequest, setEditingRequest] = useState(null);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedFleet, setSelectedFleet] = useState(null);
  const [matches, setMatches] = useState([]);
  const [routeData, setRouteData] = useState(null);
  const [datumCoords, setDatumCoords] = useState(null);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [noCredits, setNoCredits] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState(''); // #37: cancellation reason (parity with v1)
  const [nextRefreshTime, setNextRefreshTime] = useState(null);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('');
  const previousMatchesRef = useRef([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const reqs = await loadData();
      // Notification deep-link (#51): ?request=<id> opens that request's results.
      // We don't auto-run a search (costs a credit; zero-copy = no stored loads) —
      // selecting shows the request with a Run button.
      const reqId = new URLSearchParams(window.location.search).get('request');
      if (reqId && Array.isArray(reqs)) {
        const match = reqs.find(r => r.id === reqId);
        if (match) handleSelectRequest(match);
        const url = new URL(window.location.href);
        url.searchParams.delete('request');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    })();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') setMode('form');
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      let [reqs, fls] = await Promise.all([
        db.requests.getAll(user.id),
        db.fleets.getAll(user.id),
      ]);
      reqs = reqs || [];
      // Item 008: auto-complete in_progress requests past their equipment-needed date,
      // keeping the hauled load + revenue and stopping further auto-refresh.
      const expired = reqs.filter(r => isExpiredInProgress(r));
      if (expired.length) {
        const patch = finishPayload();
        await Promise.all(expired.map(r => db.requests.update(r.id, patch).catch(err => console.error('Auto-finish failed:', err?.message || err))));
        const expiredIds = new Set(expired.map(r => r.id));
        reqs = reqs.map(r => expiredIds.has(r.id) ? { ...r, ...patch } : r);
      }
      setRequests(reqs);
      setFleets(fls || []);
      return reqs;
    } finally {
      setLoading(false);
    }
  };

  const handleFinishRequest = async (req) => {
    try {
      await db.requests.update(req.id, finishPayload());
      await loadData();
    } catch (err) {
      console.error('Error finishing request:', err?.message || err);
    }
  };

  const runMatching = useCallback(async (request) => {
    if (!request) return;
    setIsMatching(true);
    setMatchError(null);
    setNoCredits(false);
    setMatches([]);
    setRouteData(null);
    setDatumCoords(null);

    try {
      const [fleetData, geocoded] = await Promise.all([
        db.fleets.getById(request.fleet_id),
        (request.datum_lat && request.datum_lng)
          ? Promise.resolve({ lat: request.datum_lat, lng: request.datum_lng, label: request.datum_point })
          : geocodeAddress(request.datum_city && request.datum_state
              ? `${request.datum_city}, ${request.datum_state}`
              : request.datum_point),
      ]);

      const fleet = fleetData;
      setSelectedFleet(fleet);

      if (!fleet.home_lat || !fleet.home_lng) {
        throw new Error("Fleet home address is not geocoded. Go to Fleets → Profile and verify the home base address.");
      }

      const rawProfile = Array.isArray(fleet.fleet_profiles)
        ? fleet.fleet_profiles[0]
        : fleet.fleet_profiles;

      const fleetProfile = rawProfile || { trailerType: 'Dry Van', trailerLength: 53, weightLimit: 45000 };

      const hasRateConfig = rawProfile && (rawProfile.revenue_split_carrier != null || rawProfile.mileage_rate != null);
      const rateConfig = hasRateConfig ? {
        revenueSplitCarrier: rawProfile.revenue_split_carrier || 20,
        mileageRate: rawProfile.mileage_rate ? parseFloat(rawProfile.mileage_rate) : 0,
        stopRate: rawProfile.stop_rate ? parseFloat(rawProfile.stop_rate) : 0,
        otherCharge1Amount: rawProfile.other_charge_1_amount ? parseFloat(rawProfile.other_charge_1_amount) : 0,
        otherCharge2Amount: rawProfile.other_charge_2_amount ? parseFloat(rawProfile.other_charge_2_amount) : 0,
        fuelPeg: rawProfile.fuel_peg ? parseFloat(rawProfile.fuel_peg) : 0,
        fuelMpg: rawProfile.fuel_mpg ? parseFloat(rawProfile.fuel_mpg) : 6,
        doePaddRate: rawProfile.doe_padd_rate ? parseFloat(rawProfile.doe_padd_rate) : 0,
      } : null;

      const datumPoint = geocoded
        ? { address: geocoded.label || request.datum_point, lat: geocoded.lat, lng: geocoded.lng }
        : { address: request.datum_point, lat: fleet.home_lat, lng: fleet.home_lng };

      setDatumCoords({ lat: datumPoint.lat, lng: datumPoint.lng });

      const fleetHome = { lat: fleet.home_lat, lng: fleet.home_lng, address: fleet.home_address };
      const geocodeFailed = datumPoint.lat === fleet.home_lat && datumPoint.lng === fleet.home_lng;
      const homeRadiusMiles = geocodeFailed ? 200 : 100;
      const corridorWidthMiles = geocodeFailed ? 300 : 100;

      const requestContext = {
        datumCity: request.datum_city || (request.datum_point || '').split(',')[0]?.trim() || '',
        datumState: request.datum_state || (request.datum_point || '').split(',')[1]?.trim() || '',
        datumLat: datumPoint.lat || 0,
        datumLng: datumPoint.lng || 0,
        homeCity: fleet.home_city || '',
        homeState: fleet.home_state || '',
        homeLat: fleet.home_lat || 0,
        homeLng: fleet.home_lng || 0,
        equipmentType: fleetProfile.trailerType || fleetProfile.trailer_type || 'Dry Van',
        modes: unionModes(rawProfile?.modes, request.modes), // #36: fleet modes + request modes
        // Past available date → treat as "available now" (load board rejects past dates).
        pickupDate: effectivePickupDate(request.equipment_available_date),
      };

      const [creditResult, loadsResult] = await Promise.all([
        deductCredit('Backhaul search').catch(err => {
          console.error('Credit deduction error:', err);
          return { success: false, error: err.message };
        }),
        getLoadsForMatching(user.id, request.fleet_id, requestContext),
      ]);
      const { loads: loadsForMatching } = loadsResult || { loads: [] };

      if (!creditResult.success) {
        setNoCredits(true);
        return;
      }

      const result = await findRouteHomeBackhauls(
        datumPoint,
        fleetHome,
        fleetProfile,
        loadsForMatching,
        homeRadiusMiles,
        corridorWidthMiles,
        rateConfig,
        request.is_relay || false,
        effectivePickupDate(request.equipment_available_date)
      );

      const opportunities = result.opportunities || [];

      if (request.notification_enabled && previousMatchesRef.current.length > 0) {
        const change = detectBackhaulChanges(previousMatchesRef.current, opportunities);
        if (change) {
          sendBackhaulChangeNotification({
            method: request.notification_method || 'email',
            email: fleet?.email,
            phone: fleet?.phone_number,
            requestName: request.request_name,
            fleetName: fleet?.name,
            oldTopMatch: change.oldMatch,
            newTopMatch: change.newMatch,
            changeType: change.type,
            requestId: request.id,
          }).catch(err => console.error('Notification error:', err));
        }
      }
      previousMatchesRef.current = opportunities;

      setMatches(opportunities);
      setRouteData(result.routeData || null);
    } catch (err) {
      console.error('Matching error:', err);
      setMatchError(err.message || 'An error occurred during search.');
    } finally {
      setIsMatching(false);
    }
  }, [user, deductCredit]);

  // Auto-refresh timer — must be after runMatching to avoid TDZ
  useEffect(() => {
    if (!selectedRequest?.auto_refresh) {
      setNextRefreshTime(null);
      return;
    }
    const intervalMinutes = selectedRequest.auto_refresh_interval || 240;
    const intervalMs = intervalMinutes * 60 * 1000;
    const maxRefreshes = selectedRequest.max_auto_refreshes; // null = unlimited
    let count = selectedRequest.auto_refresh_count || 0;
    setNextRefreshTime(new Date(Date.now() + intervalMs));
    const timer = setInterval(async () => {
      runMatching(selectedRequest);
      count += 1;
      // Persist the running count; self-disable once the cap is reached.
      const reachedLimit = maxRefreshes != null && count >= maxRefreshes;
      const updates = { auto_refresh_count: count, ...(reachedLimit ? { auto_refresh: false } : {}) };
      try {
        const updated = await db.requests.update(selectedRequest.id, updates);
        if (reachedLimit) {
          clearInterval(timer);
          setNextRefreshTime(null);
          setSelectedRequest(prev => (prev?.id === selectedRequest.id ? { ...prev, ...(updated || updates) } : prev));
          return;
        }
      } catch (err) {
        console.error('Failed to update auto-refresh count:', err?.message || err);
      }
      setNextRefreshTime(new Date(Date.now() + intervalMs));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [selectedRequest?.id, selectedRequest?.auto_refresh, selectedRequest?.auto_refresh_interval, selectedRequest?.max_auto_refreshes, runMatching]);

  // Countdown display
  useEffect(() => {
    if (!nextRefreshTime) { setTimeUntilRefresh(''); return; }
    const update = () => {
      const diff = nextRefreshTime - Date.now();
      if (diff <= 0) { setTimeUntilRefresh('Refreshing…'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeUntilRefresh(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [nextRefreshTime]);

  const handleSelectRequest = (request) => {
    previousMatchesRef.current = [];
    setSelectedRequest(request);
    setMode('results');
    setMatches([]);
    setRouteData(null);
    setDatumCoords(null);
    setMatchError(null);
    setNoCredits(false);
    setEditingRequest(null);
  };

  const handleNew = () => {
    setEditingRequest(null);
    setMode('form');
  };

  const handleEdit = (request) => {
    setEditingRequest(request);
    setMode('form');
  };

  const handleFormSave = async () => {
    const freshRequests = await loadData();
    if (selectedRequest) {
      const updated = freshRequests.find(r => r.id === selectedRequest.id);
      if (updated) setSelectedRequest(updated);
    }
    setMode(selectedRequest ? 'results' : 'empty');
    setEditingRequest(null);
  };

  const handleFormCancel = () => {
    setMode(selectedRequest ? 'results' : 'empty');
    setEditingRequest(null);
  };

  const handleDelete = (request) => {
    setDeleteReason('');
    setDeleteTarget(request);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteReason) return; // #37: reason required (parity with v1)
    try {
      await db.requests.update(deleteTarget.id, {
        status: 'cancelled',
        cancellation_reason: deleteReason,
        cancelled_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error(e);
    }
    if (selectedRequest?.id === deleteTarget.id) {
      setSelectedRequest(null);
      setMode('empty');
    }
    setDeleteTarget(null);
    setDeleteReason('');
    await loadData();
  };

  const isMobile = useMobile();

  // On mobile, track which panel is showing: 'list' or 'detail'
  const showingDetail = isMobile && (mode === 'form' || mode === 'results');
  const showingList   = !isMobile || !showingDetail;

  const handleMobileBack = () => {
    setMode('empty');
    setSelectedRequest(null);
    setEditingRequest(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', background: t.colors.page.bg }}>
        {!isMobile && (
          <div style={{ width: '280px', background: t.colors.page.cardBg, borderRight: `1px solid ${t.colors.page.cardBorder}`, padding: '20px 16px' }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: '70px', borderRadius: t.radius.xl, background: '#f1f5f9', marginBottom: '8px', animation: 'shimmer 1.5s infinite' }} />)}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>Loading…</div>
        </div>
        <style>{`@keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: t.colors.page.bg, overflow: 'hidden' }}>
      {/* Left panel — hidden on mobile when detail is showing */}
      {showingList && (
        <RequestListPanel
          requests={requests}
          selectedId={selectedRequest?.id}
          onSelect={handleSelectRequest}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onFinish={handleFinishRequest}
          onNew={handleNew}
          isMobile={isMobile}
        />
      )}

      {/* Right panel — full-screen on mobile when a request is selected */}
      {(!isMobile || showingDetail) && (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Mobile back header */}
          {isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px',
              background: t.colors.page.cardBg,
              borderBottom: `1px solid ${t.colors.page.cardBorder}`,
              flexShrink: 0,
            }}>
              <button
                onClick={handleMobileBack}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.colors.accent.blue, fontSize: t.font.size.sm,
                  fontWeight: t.font.weight.semibold, padding: '4px 0',
                }}
              >
                ‹ Requests
              </button>
              {selectedRequest && (
                <span style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedRequest.request_name}
                </span>
              )}
            </div>
          )}

          {noCredits && <NoCreditsBanner onDismiss={() => setNoCredits(false)} />}

          {mode === 'empty' && <EmptyRight />}

          {mode === 'form' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px' }}>
              <RequestForm
                fleets={fleets}
                initialValues={editingRequest}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
              />
            </div>
          )}

          {mode === 'results' && selectedRequest && (
            <ResultsPanel
              request={selectedRequest}
              fleet={selectedFleet}
              matches={matches}
              routeData={routeData}
              datumCoords={datumCoords}
              isLoading={isMatching}
              error={matchError}
              onRun={() => runMatching(selectedRequest)}
              onEdit={handleEdit}
              onComplete={loadData}
              timeUntilRefresh={timeUntilRefresh}
            />
          )}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div
          onClick={() => setDeleteTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: t.radius['2xl'], padding: '28px', maxWidth: '380px', width: '90%', boxShadow: t.shadow.lg }}>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '10px' }}>Cancel Request</div>
            <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary, marginBottom: '16px' }}>
              Cancel "<strong>{deleteTarget.request_name}</strong>"? This marks it as cancelled and removes it from your active list.
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.secondary, marginBottom: '5px' }}>
                Reason for cancellation <span style={{ color: t.colors.accent.red }}>*</span>
              </label>
              <select
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.lg, fontSize: t.font.size.sm, color: t.colors.text.primary, background: '#fff', fontFamily: t.font.family }}
              >
                <option value="">-- Select a reason --</option>
                {CANCELLATION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <PrimaryBtn onClick={confirmDelete} disabled={!deleteReason} style={{ background: deleteReason ? '#dc2626' : undefined }}>Yes, Cancel It</PrimaryBtn>
              <GhostBtn onClick={() => setDeleteTarget(null)}>Keep It</GhostBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
