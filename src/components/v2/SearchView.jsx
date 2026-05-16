import { useState, useEffect, useCallback } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../hooks/useCredits';
import { useMobile } from '../../hooks/useMobile';
import { geocodeAddress } from '../../utils/pcMilerClient';
import { buildRequestPayload } from '../../utils/buildRequestPayload';
import { findRouteHomeBackhauls } from '../../utils/routeHomeMatching';
import { getLoadsForMatching } from '../../utils/getLoadsForMatching';
import { RouteHomeMap } from '../RouteHomeMap';
import { RouteMap } from '../RouteMap';
import { CoDriverV2 } from './CoDriverV2';
import {
  Plus, Search, MapPin, Truck, Package, RefreshCw,
  Edit, Trash2, X, AlertCircle, CheckCircle, Clock,
  ChevronRight, DollarSign, Navigation, Bell,
  TrendingUp, Map,
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
    url: (id) => id ? `https://truckstop.com/load-board/load-details/${id}` : 'https://truckstop.com/',
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
    pending:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending' },
    cancelled: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelled' },
    completed: { bg: '#f1f5f9', color: '#64748b', label: 'Completed' },
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

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '36px', height: '20px',
          borderRadius: '10px',
          background: checked ? t.colors.accent.blue : '#cbd5e1',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.15s',
          cursor: 'pointer',
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
  datumCity: '',
  datumState: '',
  datumLat: null,
  datumLng: null,
  selectedFleetId: '',
  equipmentAvailableDate: '',
  equipmentNeededDate: '',
  isRelay: false,
  autoRefresh: false,
  autoRefreshInterval: 1,
  notificationEnabled: false,
  notificationMethod: 'email',
};

function RequestForm({ fleets, initialValues = null, onSave, onCancel }) {
  const [form, setForm] = useState(() => initialValues ? {
    requestName: initialValues.request_name || '',
    datumCity: initialValues.datum_city || '',
    datumState: initialValues.datum_state || '',
    datumLat: initialValues.datum_lat || null,
    datumLng: initialValues.datum_lng || null,
    selectedFleetId: initialValues.fleet_id || '',
    equipmentAvailableDate: initialValues.equipment_available_date || '',
    equipmentNeededDate: initialValues.equipment_needed_date || '',
    isRelay: initialValues.is_relay || false,
    autoRefresh: initialValues.auto_refresh || false,
    autoRefreshInterval: initialValues.auto_refresh_interval ? initialValues.auto_refresh_interval / 60 : 1,
    notificationEnabled: initialValues.notification_enabled || false,
    notificationMethod: initialValues.notification_method || 'email',
  } : { ...BLANK_FORM, selectedFleetId: fleets.length === 1 ? fleets[0].id : '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [datumVerified, setDatumVerified] = useState(!!(initialValues?.datum_lat));
  const { user } = useAuth();

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleDatumBlur = async () => {
    const city = form.datumCity.trim();
    const state = form.datumState.trim();
    if (!city || !state) return;
    setDatumVerified(false);
    try {
      const result = await geocodeAddress(`${city}, ${state}`);
      if (result?.lat && result?.lng) {
        setForm(f => ({ ...f, datumLat: result.lat, datumLng: result.lng }));
        setDatumVerified(true);
      }
    } catch { /* geocode failure is non-fatal */ }
  };

  const validate = () => {
    const e = {};
    if (!form.requestName.trim()) e.requestName = 'Required';
    if (!form.datumCity.trim()) e.datumCity = 'Required';
    if (!form.datumState.trim() || form.datumState.trim().length !== 2) e.datumState = '2-letter state required';
    if (!form.selectedFleetId) e.selectedFleetId = 'Select a fleet';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
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

          <Field label="Datum City">
            <Input
              value={form.datumCity}
              onChange={e => { set('datumCity', e.target.value); setDatumVerified(false); }}
              onBlur={handleDatumBlur}
              placeholder="e.g. Burlington"
            />
            <ErrorMsg msg={errors.datumCity} />
          </Field>
          <Field label="Datum State">
            <Input
              value={form.datumState}
              onChange={e => { set('datumState', e.target.value.toUpperCase().slice(0, 2)); setDatumVerified(false); }}
              onBlur={handleDatumBlur}
              placeholder="NC"
              maxLength={2}
              style={{ textTransform: 'uppercase' }}
            />
            <ErrorMsg msg={errors.datumState} />
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

          <Field label="Equipment Available Date">
            <Input type="date" value={form.equipmentAvailableDate} onChange={e => set('equipmentAvailableDate', e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </Field>

          <Field label="Equipment Needed By">
            <Input type="date" value={form.equipmentNeededDate} onChange={e => set('equipmentNeededDate', e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </Field>
        </div>

        <div style={{ borderTop: `1px solid ${t.colors.border.default}`, paddingTop: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Toggle checked={form.isRelay} onChange={v => set('isRelay', v)} label="Relay mode — driver picks up en route home" />

          <div>
            <Toggle checked={form.autoRefresh} onChange={v => set('autoRefresh', v)} label="Auto-refresh results" />
            {form.autoRefresh && (
              <div style={{ marginTop: '10px', marginLeft: '46px' }}>
                <Field label="Refresh interval">
                  <SelectInput value={form.autoRefreshInterval} onChange={e => set('autoRefreshInterval', parseFloat(e.target.value))} style={{ width: '180px' }}>
                    <option value={0.5}>Every 30 minutes</option>
                    <option value={1}>Every 1 hour</option>
                    <option value={4}>Every 4 hours</option>
                  </SelectInput>
                </Field>
              </div>
            )}
          </div>

          <div>
            <Toggle checked={form.notificationEnabled} onChange={v => set('notificationEnabled', v)} label="Notify me when top loads change" />
            {form.notificationEnabled && (
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
    </form>
  );
}

// ─── Request list (left panel) ───────────────────────────────────────────────

function RequestCard({ request, active, onSelect, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const isActive = ['active', 'open', 'pending'].includes(request.status);

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

function RequestListPanel({ requests, selectedId, onSelect, onEdit, onDelete, onNew, isMobile }) {
  const active = requests.filter(r => ['active', 'open', 'pending'].includes(r.status));
  const archived = requests.filter(r => !['active', 'open', 'pending'].includes(r.status));

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
                  <RequestCard key={r.id} request={r} active={selectedId === r.id} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </>
            )}
            {archived.length > 0 && (
              <>
                <SectionLabel style={{ paddingLeft: '6px', marginBottom: '8px', marginTop: active.length ? '16px' : 0 }}>History</SectionLabel>
                {archived.map(r => (
                  <RequestCard key={r.id} request={r} active={selectedId === r.id} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
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
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function fmtNum(n, decimals = 1) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(n);
}

function MatchCard({ match, rank, fleet, request, onViewDetails, onMapClick, onHaulThis }) {
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

  // AI state (self-contained per card)
  const loadId = match.load_id || match.id;
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState(null);

  const handleAiAnalyze = async () => {
    if (aiAnalysis || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match: { ...match, rank }, fleet, request }),
      });
      let data;
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok || data.error) {
        console.error('AI analyze-load error:', data.error || res.status);
        setAiAnalysis(data.error || `Service unavailable (${res.status})`);
        return;
      }
      setAiAnalysis(data.analysis || 'No analysis returned.');
    } catch (err) {
      console.error('AI analyze-load fetch error:', err);
      setAiAnalysis('Unable to reach AI service. Check that the app is deployed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiFeedback = async (rating) => {
    setAiFeedback({ rating, comment: '', showInput: rating === 'down', submitted: false });
    if (rating === 'up') submitAiFeedback(rating, '');
  };

  const submitAiFeedback = async (rating, comment) => {
    try {
      await fetch('/api/ai/analyze-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: true,
          fleet_id: fleet?.id,
          user_id: fleet?.user_id,
          load_id: loadId,
          rating,
          comment: comment?.trim() || null,
          analysis: aiAnalysis || null,
          load_data: {
            origin: mOriginAddr(match),
            destination: mDestAddr(match),
            equipment_type: mEquipType(match),
            additional_miles: mAdditional(match),
            net_revenue: match.customer_net_credit,
            revenue_per_mile: mRevPerMile(match),
          },
        }),
      });
    } catch { /* non-critical */ } finally {
      setAiFeedback(f => f ? { ...f, submitted: true } : f);
    }
  };

  const verdict = aiAnalysis?.match(/^(TAKE IT|PASS|NEGOTIATE)/i)?.[0]?.toUpperCase();
  const verdictColor = verdict === 'TAKE IT' ? '#16a34a' : verdict === 'NEGOTIATE' ? '#2563eb' : verdict === 'PASS' ? '#dc2626' : t.colors.text.muted;

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
          {boardCfg && boardHref && (
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
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: rc.text }}>
            {fmtMoney(primaryRevenue)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{revenueLabel}</div>
          {hasRateConfig && (
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
              Gross: {fmtMoney(mTotalRev(match))} · {fmtMoney(mRevPerMile(match))}/mi
            </div>
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
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
            {fmtDate(mPickupDate(match))}
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
        ].map(({ label, value }) => (
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
        </div>
      )}

      {/* ── AI Analysis ── */}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${rc.border}` }}>
        {!aiAnalysis && !aiLoading && (
          <button
            onClick={handleAiAnalyze}
            style={{
              width: '100%', padding: '9px',
              background: 'transparent',
              border: `1px dashed ${t.colors.border.default}`,
              borderRadius: t.radius.lg,
              color: t.colors.text.muted,
              fontSize: t.font.size.xs,
              fontWeight: t.font.weight.semibold,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            ✦ Ask AI: Should I take this load?
          </button>
        )}
        {aiLoading && (
          <div style={{ padding: '10px', background: '#f8fafc', borderRadius: t.radius.lg, fontSize: t.font.size.xs, color: t.colors.text.muted, textAlign: 'center' }}>
            Analyzing load…
          </div>
        )}
        {aiAnalysis && (
          <div style={{ padding: '12px', background: `${verdictColor}0d`, border: `1px solid ${verdictColor}40`, borderRadius: t.radius.lg }}>
            {verdict && (
              <div style={{ fontSize: '10px', fontWeight: t.font.weight.bold, color: verdictColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                ✦ {verdict}
              </div>
            )}
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.primary, lineHeight: 1.6 }}>
              {aiAnalysis.replace(/^(TAKE IT|PASS|NEGOTIATE)[.:—\s]*/i, '')}
            </div>
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${verdictColor}30` }}>
              {aiFeedback?.submitted ? (
                <div style={{ fontSize: '11px', color: t.colors.text.muted }}>Thanks for the feedback.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: t.colors.text.muted }}>Was this helpful?</span>
                  <button
                    onClick={() => handleAiFeedback('up')}
                    style={{ background: aiFeedback?.rating === 'up' ? '#dcfce7' : 'transparent', border: `1px solid ${aiFeedback?.rating === 'up' ? '#16a34a' : '#e2e8f0'}`, borderRadius: '6px', padding: '2px 7px', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}
                  >👍</button>
                  <button
                    onClick={() => handleAiFeedback('down')}
                    style={{ background: aiFeedback?.rating === 'down' ? '#fee2e2' : 'transparent', border: `1px solid ${aiFeedback?.rating === 'down' ? '#dc2626' : '#e2e8f0'}`, borderRadius: '6px', padding: '2px 7px', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}
                  >👎</button>
                  {aiFeedback?.showInput && (
                    <div style={{ width: '100%', marginTop: '6px' }}>
                      <textarea
                        placeholder="What would have been more helpful? (optional)"
                        value={aiFeedback.comment || ''}
                        onChange={e => setAiFeedback(f => ({ ...f, comment: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.md, fontSize: '11px', lineHeight: 1.5, resize: 'vertical', minHeight: '50px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                      <button
                        onClick={() => submitAiFeedback('down', aiFeedback.comment)}
                        style={{ marginTop: '4px', padding: '5px 12px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.md, color: '#fff', fontSize: '11px', fontWeight: t.font.weight.bold, cursor: 'pointer' }}
                      >Submit</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${rc.border}`, display: 'flex', gap: '8px' }}>
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
    </div>
  );
}

// ─── Route Details Modal ──────────────────────────────────────────────────────

function RouteDetailsModal({ match, request, onClose, onHaulThis, onViewMap }) {
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
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.text.muted, padding: '4px', fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>✕</button>
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
                  match.source && { label: 'Load Source', value: ({ directfreight: 'DirectFreight', truckerpath: 'TruckerPath', dat: 'DAT', truckstop: 'Truckstop' }[match.source] || match.source) },
                  (match.df_load_number || match.source_load_id || match.load_id) && { label: 'Load Number', value: match.df_load_number || match.source_load_id || match.load_id, mono: true },
                  { label: 'Pickup Date', value: fmtDate(mPickupDate(match)) },
                  { label: 'Delivery Date', value: fmtDate(mDeliveryDate(match)) },
                  { label: 'Broker', value: match.broker || '—' },
                  { label: 'Shipper', value: match.shipper || '—' },
                  { label: 'Freight', value: mFreight(match) || '—' },
                  { label: 'Distance Source', value: match.distance_source === 'pcmiler' ? 'PC*Miler' : 'Estimated', color: match.distance_source === 'pcmiler' ? '#16a34a' : t.colors.text.secondary },
                  match.posted_rate_per_mile > 0 && { label: 'Posted $/mi', value: `$${match.posted_rate_per_mile.toFixed(2)}` },
                  match.contactPhone && { label: 'Contact', value: match.contactPhone },
                ].filter(Boolean).map(({ label, value, mono, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: '10px', color: t.colors.text.muted, marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: color || t.colors.text.primary, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div style={{ display: 'flex', gap: '10px' }}>
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onConfirm}
            disabled={completing}
            style={{ flex: 1, padding: '11px 20px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.xl, color: '#fff', fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.7 : 1 }}
          >
            {completing ? 'Recording…' : 'Confirm Haul'}
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

// ─── Results panel (right side when request selected) ────────────────────────

function ResultsPanel({ request, fleet, matches, routeData, datumCoords, isLoading, error, onRun, onEdit, onComplete }) {
  const isMobile = useMobile();
  const [mapVisible, setMapVisible] = useState(true);
  const [mapFocusLoad, setMapFocusLoad] = useState(null);

  // Modal state
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [mapMatch, setMapMatch] = useState(null);
  const [haulMatch, setHaulMatch] = useState(null);
  const [completing, setCompleting] = useState(false);

  const fleetHome = fleet ? { lat: fleet.home_lat, lng: fleet.home_lng, address: fleet.home_address } : null;

  const handleHaulConfirm = async () => {
    if (!haulMatch) return;
    setCompleting(true);
    try {
      await db.requests.update(request.id, {
        status: 'completed',
        revenue_amount: mTotalRev(haulMatch),
        net_revenue: haulMatch.customer_net_credit ?? haulMatch.netRevenue ?? 0,
        out_of_route_miles: mAdditional(haulMatch),
        completed_at: new Date().toISOString(),
      });
      setHaulMatch(null);
      if (onComplete) onComplete();
    } catch (err) {
      console.error('Error recording haul:', err);
    } finally {
      setCompleting(false);
    }
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
            {isLoading ? 'Searching…' : 'Run Search'}
          </PrimaryBtn>
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
              <Search size={14} /> Run Search
            </PrimaryBtn>
          </Card>
        )}

        {/* Match cards */}
        {!isLoading && matches.length > 0 && (
          <>
            <SectionLabel style={{ marginBottom: '12px' }}>
              {matches.length} Load{matches.length !== 1 ? 's' : ''} Found — Ranked by {matches[0]?.has_rate_config ? 'Net Credit' : 'Revenue'}
            </SectionLabel>
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
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

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') setMode('form');
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqs, fls] = await Promise.all([
        db.requests.getAll(user.id),
        db.fleets.getAll(user.id),
      ]);
      setRequests(reqs || []);
      setFleets(fls || []);
      return reqs || [];
    } finally {
      setLoading(false);
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
        pickupDate: request.equipment_available_date || '',
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
        request.is_relay || false
      );

      setMatches(result.opportunities || []);
      setRouteData(result.routeData || null);
    } catch (err) {
      console.error('Matching error:', err);
      setMatchError(err.message || 'An error occurred during search.');
    } finally {
      setIsMatching(false);
    }
  }, [user, deductCredit]);

  const handleSelectRequest = (request) => {
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
    setDeleteTarget(request);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await db.requests.update(deleteTarget.id, { status: 'cancelled' });
    } catch (e) {
      console.error(e);
    }
    if (selectedRequest?.id === deleteTarget.id) {
      setSelectedRequest(null);
      setMode('empty');
    }
    setDeleteTarget(null);
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
            <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary, marginBottom: '20px' }}>
              Cancel "<strong>{deleteTarget.request_name}</strong>"? This marks it as cancelled and removes it from your active list.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <PrimaryBtn onClick={confirmDelete} style={{ background: '#dc2626' }}>Yes, Cancel It</PrimaryBtn>
              <GhostBtn onClick={() => setDeleteTarget(null)}>Keep It</GhostBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
