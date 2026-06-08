import { useState, useEffect, useCallback } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../hooks/useCredits';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { useMobile } from '../../hooks/useMobile';
import { geocodeAddress } from '../../utils/pcMilerClient';
import { findRouteHomeBackhauls } from '../../utils/routeHomeMatching';
import { getLoadsForMatching } from '../../utils/getLoadsForMatching';
import { logActivityEvent, ACTIVITY_EVENTS } from '../../utils/activityEvents';
import { isRequestExpired, EXPIRED_HINT } from '../../utils/requestExpiry';

const t = tokens;

// ─── Metric computation (mirrors EstimateResults.jsx exactly) ─────────────────

const avg = (arr, field) =>
  arr.length ? arr.reduce((s, m) => s + (Number(m[field]) || 0), 0) / arr.length : 0;

const buildCategory = (source, annualVolume) => {
  const netCredit       = Number(source.customer_net_credit) || 0;
  const carrierSplit    = Number(source.carrier_revenue)     || 0;
  const oorMilesCost    = Number(source.mileage_expense)     || 0;
  const oorStopsCost    = Number(source.stop_expense)        || 0;
  const oorFsc          = Number(source.fuel_surcharge)      || 0;
  const otherCharges    = Number(source.other_charges)       || 0;
  const additionalMiles = Number(source.additionalMiles)     || 0;
  const stopCount       = Number(source.stop_count)          || 2;
  return {
    netCredit,
    annualCredit:       netCredit    * annualVolume,
    annualCarrierSplit: carrierSplit * annualVolume,
    annualOorMiles:     oorMilesCost * annualVolume,
    annualOorStops:     oorStopsCost * annualVolume,
    annualOorFsc:       oorFsc       * annualVolume,
    annualOtherCharges: otherCharges * annualVolume,
    carrierTotal:       (carrierSplit + oorMilesCost + oorStopsCost + oorFsc + otherCharges) * annualVolume,
    additionalMiles,
    annualMiles:        additionalMiles * annualVolume,
    stopCount,
  };
};

const computeMetrics = (matches, annualVolume) => {
  if (!matches.length) return null;
  const top5 = matches.slice(0, 5);
  const avgAllSource = {
    customer_net_credit: avg(matches, 'customer_net_credit'),
    carrier_revenue:     avg(matches, 'carrier_revenue'),
    mileage_expense:     avg(matches, 'mileage_expense'),
    stop_expense:        avg(matches, 'stop_expense'),
    fuel_surcharge:      avg(matches, 'fuel_surcharge'),
    other_charges:       avg(matches, 'other_charges'),
    additionalMiles:     avg(matches, 'additionalMiles'),
    stop_count:          avg(matches, 'stop_count'),
  };
  const avgTop5Source = {
    customer_net_credit: avg(top5, 'customer_net_credit'),
    carrier_revenue:     avg(top5, 'carrier_revenue'),
    mileage_expense:     avg(top5, 'mileage_expense'),
    stop_expense:        avg(top5, 'stop_expense'),
    fuel_surcharge:      avg(top5, 'fuel_surcharge'),
    other_charges:       avg(top5, 'other_charges'),
    additionalMiles:     avg(top5, 'additionalMiles'),
    stop_count:          avg(top5, 'stop_count'),
  };
  return {
    totalOpportunities: matches.length,
    highestNet:  buildCategory(matches[0], annualVolume),
    averageAll:  buildCategory(avgAllSource, annualVolume),
    averageTop5: buildCategory(avgTop5Source, annualVolume),
  };
};

const fmt$ = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v ?? 0);

const fmtNum = (v, decimals = 0) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v ?? 0);

const fmtDateLong = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Shared primitives ────────────────────────────────────────────────────────

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
    cancelled: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelled' },
    completed: { bg: '#f1f5f9', color: '#64748b', label: 'Completed' },
  };
  const s = map[status] || { bg: '#eff6ff', color: '#1d4ed8', label: status };
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
        fontFamily: t.font.family,
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
        fontFamily: t.font.family,
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
        fontFamily: t.font.family,
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
        fontFamily: t.font.family,
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
      <label style={{
        fontSize: t.font.size.xs,
        fontWeight: t.font.weight.semibold,
        color: t.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ color: t.colors.accent.red, fontSize: t.font.size.xs, marginTop: '4px' }}>
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

// ─── Estimate form ────────────────────────────────────────────────────────────

const BLANK_FORM = {
  requestName: '',
  datumPoint: '',
  selectedFleetId: '',
  equipmentAvailableDate: '',
  equipmentNeededDate: '',
  annualVolume: '',
  minNetCredit: '',
  isRelay: false,
};

function EstimateForm({ fleets, initialValues, onSave, onCancel }) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => {
    if (initialValues) {
      return {
        requestName: initialValues.request_name || '',
        datumPoint: initialValues.datum_point || '',
        selectedFleetId: initialValues.fleet_id || '',
        equipmentAvailableDate: initialValues.equipment_available_date || '',
        equipmentNeededDate: initialValues.equipment_needed_date || '',
        annualVolume: initialValues.annual_volume != null ? String(initialValues.annual_volume) : '',
        minNetCredit: initialValues.min_net_credit != null ? String(initialValues.min_net_credit) : '',
        isRelay: initialValues.is_relay || false,
      };
    }
    return { ...BLANK_FORM, selectedFleetId: fleets.length === 1 ? fleets[0].id : '' };
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const e = {};
    if (!form.requestName.trim()) e.requestName = 'Required';
    if (!form.datumPoint.trim()) e.datumPoint = 'Required — enter "City, ST" or ZIP';
    if (!form.selectedFleetId) e.selectedFleetId = 'Select a fleet';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        request_name: form.requestName.trim(),
        datum_point: form.datumPoint.trim(),
        fleet_id: form.selectedFleetId,
        equipment_available_date: form.equipmentAvailableDate || null,
        equipment_needed_date: form.equipmentNeededDate || null,
        annual_volume: form.annualVolume !== '' ? Number(form.annualVolume) : null,
        min_net_credit: form.minNetCredit !== '' ? Number(form.minNetCredit) : null,
        is_relay: form.isRelay,
        status: 'active',
        user_id: user.id,
      };
      if (initialValues?.id) {
        await db.estimateRequests.update(initialValues.id, payload);
      } else {
        await db.estimateRequests.create(payload);
      }
      onSave();
    } catch (err) {
      console.error('Error saving estimate:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card style={{ padding: '28px' }}>
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '24px' }}>
          {initialValues ? 'Edit Estimate' : 'New Estimate Request'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <Field label="Request Name" style={{ gridColumn: '1 / -1' }}>
            <Input value={form.requestName} onChange={e => set('requestName', e.target.value)} placeholder="e.g. ATL Annual Projection" />
            <ErrorMsg msg={errors.requestName} />
          </Field>

          <Field label="Empty City, ST">
            <Input value={form.datumPoint} onChange={e => set('datumPoint', e.target.value)} placeholder="City, ST or ZIP" />
            <ErrorMsg msg={errors.datumPoint} />
          </Field>

          <Field label="Fleet">
            <SelectInput value={form.selectedFleetId} onChange={e => set('selectedFleetId', e.target.value)}>
              <option value="">Select fleet…</option>
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name}{f.user_id !== user?.id ? ' · shared' : ''}</option>)}
            </SelectInput>
            <ErrorMsg msg={errors.selectedFleetId} />
          </Field>

          <Field label="Equipment Available Date">
            <Input type="date" value={form.equipmentAvailableDate} onChange={e => set('equipmentAvailableDate', e.target.value)} />
          </Field>

          <Field label="Equipment Needed By">
            <Input type="date" value={form.equipmentNeededDate} onChange={e => set('equipmentNeededDate', e.target.value)} />
          </Field>

          <Field label="Est. Loads Per Year (optional)">
            <Input type="number" value={form.annualVolume} onChange={e => set('annualVolume', e.target.value)} placeholder="250" />
          </Field>

          <Field label="Min Net Credit Per Load $ (optional)">
            <Input type="number" value={form.minNetCredit} onChange={e => set('minNetCredit', e.target.value)} placeholder="500" />
          </Field>
        </div>

        <div style={{ borderTop: `1px solid ${t.colors.border.default}`, paddingTop: '16px', marginBottom: '20px' }}>
          <Toggle checked={form.isRelay} onChange={v => set('isRelay', v)} label="Relay mode — driver picks up en route home" />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <PrimaryBtn type="submit" disabled={saving}>
            {saving ? 'Saving…' : initialValues ? 'Update Estimate' : 'Save Estimate'}
          </PrimaryBtn>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        </div>
      </Card>
    </form>
  );
}

// ─── Estimate list card ───────────────────────────────────────────────────────

function EstimateCard({ estimate, active, onSelect, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const isEditable = ['active', 'pending'].includes(estimate.status);
  const fleetName = estimate.fleets?.name || estimate.fleet_name || '';

  return (
    <div
      onClick={() => onSelect(estimate)}
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '5px' }}>
        <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, lineHeight: 1.3 }}>
          {estimate.request_name}
        </div>
        {/* #83: expired window overrides the status badge — edit dates to revive */}
        {isRequestExpired(estimate) ? (
          <span title={EXPIRED_HINT} style={{ padding: '2px 8px', borderRadius: t.radius.md, fontSize: '10px', fontWeight: t.font.weight.bold, background: t.colors.accent.redLight, color: t.colors.accent.red, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
            Inactive
          </span>
        ) : (
          <StatusBadge status={estimate.status} />
        )}
      </div>

      {fleetName && (
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px' }}>
          {fleetName}
        </div>
      )}

      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '4px' }}>
        {estimate.datum_point}
      </div>

      {(estimate.annual_volume != null || estimate.min_net_credit != null) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {estimate.annual_volume != null && (
            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: t.radius.full, background: t.colors.accent.purpleLight, color: t.colors.accent.purple, fontWeight: t.font.weight.medium }}>
              {estimate.annual_volume}/yr
            </span>
          )}
          {estimate.min_net_credit != null && (
            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: t.radius.full, background: t.colors.accent.greenLight, color: t.colors.accent.green, fontWeight: t.font.weight.medium }}>
              Min ${estimate.min_net_credit}
            </span>
          )}
        </div>
      )}

      {(hovered || active) && isEditable && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onEdit(estimate)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.text.muted, padding: '2px', fontSize: t.font.size.xs, display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(estimate)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', fontSize: t.font.size.xs, display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Estimate list panel (left) ───────────────────────────────────────────────

function EstimateListPanel({ estimates, selectedId, onSelect, onEdit, onDelete, onNew, isMobile }) {
  const active = estimates.filter(e => ['active', 'pending'].includes(e.status));
  const archived = estimates.filter(e => !['active', 'pending'].includes(e.status));

  return (
    <div className="est-left-panel" style={{
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>
            Estimates
          </div>
          <PrimaryBtn onClick={onNew} style={{ padding: '5px 10px', fontSize: t.font.size.xs }}>
            + New
          </PrimaryBtn>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {estimates.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: t.colors.text.muted, fontSize: t.font.size.sm }}>
            No estimates yet.<br />Click "New" to get started.
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <SectionLabel style={{ paddingLeft: '6px', marginBottom: '8px' }}>Active</SectionLabel>
                {active.map(e => (
                  <EstimateCard
                    key={e.id}
                    estimate={e}
                    active={selectedId === e.id}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </>
            )}
            {archived.length > 0 && (
              <>
                <SectionLabel style={{ paddingLeft: '6px', marginBottom: '8px', marginTop: active.length ? '16px' : 0 }}>History</SectionLabel>
                {archived.map(e => (
                  <EstimateCard
                    key={e.id}
                    estimate={e}
                    active={selectedId === e.id}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
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
const DEFAULT_RANK = { bg: '#f8fafc', border: '#e2e8f0', badge: '#64748b', text: '#475569' };

function fmtMoney(val) {
  if (val == null) return '—';
  return '$' + Math.round(val).toLocaleString();
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return dateStr; }
}

function MetricChip({ label, value }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: t.radius.md, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontSize: '10px', fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{value}</div>
    </div>
  );
}

function MatchCard({ match, rank }) {
  const [expanded, setExpanded] = useState(false);
  const rc = RANK_COLORS[rank] || DEFAULT_RANK;
  const hasRateConfig = match.has_rate_config;
  const primaryRevenue = hasRateConfig ? match.customer_net_credit : match.total_revenue;
  const revenueLabel = hasRateConfig ? 'Net Credit' : 'Gross Revenue';

  const sourceLabel = {
    directfreight: 'DirectFreight',
    truckerpath: 'TruckerPath',
    dat: 'DAT',
    truckstop: 'Truckstop',
    imported: 'Imported',
  }[match.source] || match.source;

  return (
    <div style={{ background: rc.bg, border: `1px solid ${rc.border}`, borderRadius: t.radius.xl, marginBottom: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{
          minWidth: '32px', height: '32px',
          borderRadius: t.radius.lg,
          background: rc.badge,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: t.font.size.xs, fontWeight: t.font.weight.bold,
          flexShrink: 0,
        }}>
          #{rank}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
              {match.pickup_city}, {match.pickup_state}
            </span>
            <span style={{ color: t.colors.text.muted, fontSize: t.font.size.xs }}>→</span>
            <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
              {match.delivery_city}, {match.delivery_state}
            </span>
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
            {fmtDate(match.pickup_date || match.pickupDate)} · {match.equipment_type || match.equipmentType || 'Dry Van'} · {sourceLabel}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: rc.text }}>
            {fmtMoney(primaryRevenue)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{revenueLabel}</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <MetricChip label="OOR Miles" value={match.additional_miles != null ? `+${Math.round(match.additional_miles)}mi` : '—'} />
        <MetricChip label="To Pickup" value={match.final_to_pickup != null ? `${Math.round(match.final_to_pickup)}mi` : '—'} />
        {(match.weight || match.loadWeight) && (
          <MetricChip label="Weight" value={`${(((match.weight || match.loadWeight)) / 1000).toFixed(0)}k lbs`} />
        )}
        {match.revenue_per_mile != null && (
          <MetricChip label="$/Mile" value={`$${match.revenue_per_mile.toFixed(2)}`} />
        )}
      </div>

      {expanded && hasRateConfig && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${rc.border}`, background: 'rgba(255,255,255,0.6)' }}>
          <SectionLabel style={{ marginBottom: '10px' }}>Financial Breakdown</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
            <div>Gross Revenue</div><div style={{ textAlign: 'right' }}>{fmtMoney(match.total_revenue)}</div>
            <div>Customer Share ({100 - (match.revenue_split_carrier || 0)}%)</div>
            <div style={{ textAlign: 'right', color: '#dc2626' }}>−{fmtMoney(match.customer_share)}</div>
            {match.mileage_expense > 0 && (
              <><div>Mileage Cost</div><div style={{ textAlign: 'right', color: '#dc2626' }}>−{fmtMoney(match.mileage_expense)}</div></>
            )}
            {match.stop_expense > 0 && (
              <><div>Stop Pay</div><div style={{ textAlign: 'right', color: '#dc2626' }}>−{fmtMoney(match.stop_expense)}</div></>
            )}
            {match.fuel_surcharge > 0 && (
              <><div>Fuel Surcharge</div><div style={{ textAlign: 'right', color: '#dc2626' }}>−{fmtMoney(match.fuel_surcharge)}</div></>
            )}
            <div style={{ fontWeight: t.font.weight.semibold, borderTop: `1px solid ${rc.border}`, paddingTop: '4px' }}>Net Credit</div>
            <div style={{ textAlign: 'right', fontWeight: t.font.weight.bold, color: rc.text, borderTop: `1px solid ${rc.border}`, paddingTop: '4px' }}>
              {fmtMoney(match.customer_net_credit)}
            </div>
          </div>
          {match.broker && (
            <div style={{ marginTop: '10px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
              Broker: {match.broker}{match.shipper ? ` · Shipper: ${match.shipper}` : ''}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '8px 16px 12px', borderTop: `1px solid ${rc.border}` }}>
        <button
          onClick={() => setExpanded(x => !x)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: t.font.size.xs, fontWeight: t.font.weight.medium, color: rc.text, padding: '4px 0', fontFamily: t.font.family }}
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
    </div>
  );
}

// ─── Estimate Report (analytical table) ─────────────────────────────────────

function EstimateReport({ estimate, fleet, matches, isLoading, error, hasRun, onRun, onEdit }) {
  const annualVolume  = estimate.annual_volume || 0;
  const minNetCredit  = estimate.min_net_credit ?? null;
  const today         = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const filtered = minNetCredit !== null
    ? matches.filter(m => (Number(m.customer_net_credit) || 0) >= minNetCredit)
    : matches;
  const metrics  = computeMetrics(filtered, annualVolume);
  const hasRates = filtered.length > 0 && filtered[0].has_rate_config;
  const canPrint = !isLoading && hasRun && matches.length > 0;

  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = '__est_print_style__';
    style.textContent = `
      @media print {
        @page { margin: 0.75in; }
        body > #root aside { display: none !important; }
        .est-left-panel { display: none !important; }
        .no-print { display: none !important; }
        #estimate-report { border: none !important; border-radius: 0 !important; box-shadow: none !important; }
        body { background: white !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    window.addEventListener('afterprint', () => {
      document.getElementById('__est_print_style__')?.remove();
    }, { once: true });
  };

  // table cell styles
  const borderColor = t.colors.page.cardBorder;
  const labelCell = { padding: '12px 18px', borderBottom: `1px solid ${borderColor}`, fontSize: t.font.size.sm, color: t.colors.text.secondary, fontWeight: t.font.weight.medium };
  const valCell   = (highlight = false) => ({
    padding: '12px 18px', textAlign: 'right', borderBottom: `1px solid ${borderColor}`,
    fontSize: t.font.size.sm, fontWeight: highlight ? t.font.weight.extrabold : t.font.weight.semibold,
    color: highlight ? t.colors.accent.green : t.colors.text.primary,
    background: highlight ? `${t.colors.accent.green}08` : 'transparent',
  });
  const subheadRow = (label) => (
    <tr>
      <td colSpan={4} style={{
        padding: '8px 18px 6px', fontSize: t.font.size.xs, fontWeight: t.font.weight.extrabold,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: t.colors.accent.green, background: `${t.colors.accent.green}0a`,
        borderBottom: `1px solid ${borderColor}`,
      }}>{label}</td>
    </tr>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: t.colors.page.bg }}>

      {/* Action bar (hidden on print) */}
      <div className="no-print" style={{ padding: '16px 24px', borderBottom: `1px solid ${t.colors.page.cardBorder}`, background: t.colors.page.cardBg, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{estimate.request_name}</div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{estimate.datum_point}{fleet ? ` · ${fleet.name}` : ''}{annualVolume ? ` · ${annualVolume} loads/yr` : ''}</div>
        </div>
        {canPrint && <GhostBtn onClick={handlePrint} style={{ fontSize: t.font.size.xs, padding: '6px 12px' }}>🖨 Print / Save PDF</GhostBtn>}
        <GhostBtn onClick={() => onEdit(estimate)} style={{ fontSize: t.font.size.xs, padding: '6px 10px' }}>✏️ Edit</GhostBtn>
        {/* #83: expired pickup window — run disabled until dates are edited forward */}
        <span title={isRequestExpired(estimate) ? EXPIRED_HINT : undefined}>
          <PrimaryBtn onClick={onRun} disabled={isLoading || isRequestExpired(estimate)} style={{ fontSize: t.font.size.xs, padding: '6px 14px', ...(isRequestExpired(estimate) ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>
            {isLoading ? 'Running…' : <><span>▶ Run Estimate</span><CreditBadge /></>}
          </PrimaryBtn>
        </span>
        {isRequestExpired(estimate) && (
          <span style={{ fontSize: t.font.size.xs, color: t.colors.accent.red, fontWeight: t.font.weight.semibold }}>{EXPIRED_HINT}</span>
        )}
      </div>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>

        {/* Loading shimmer */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[120, 60, 60, 60].map((h, i) => (
              <div key={i} style={{ height: h, borderRadius: t.radius.xl, background: '#f1f5f9', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <Card style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>Estimate failed</div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>{error}</div>
          </Card>
        )}

        {/* Ready state */}
        {!isLoading && !error && !hasRun && (
          <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📊</div>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>Ready to estimate</div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm, marginBottom: '20px' }}>Click "Run Estimate" to find loads along this route and project annual revenue.</div>
            <span title={isRequestExpired(estimate) ? EXPIRED_HINT : undefined}>
              <PrimaryBtn onClick={onRun} disabled={isRequestExpired(estimate)} style={isRequestExpired(estimate) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>▶ Run Estimate <CreditBadge /></PrimaryBtn>
            </span>
            {isRequestExpired(estimate) && (
              <div style={{ marginTop: '10px', fontSize: t.font.size.xs, color: t.colors.accent.red, fontWeight: t.font.weight.semibold }}>{EXPIRED_HINT}</div>
            )}
          </Card>
        )}

        {/* Report */}
        {!isLoading && !error && hasRun && (
          <div id="estimate-report" style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius['2xl'], boxShadow: t.shadow.card, overflow: 'hidden' }}>

            {/* Report header */}
            <div style={{ padding: '24px 28px', background: '#f8fafc', borderBottom: `1px solid ${borderColor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.extrabold, textTransform: 'uppercase', letterSpacing: '0.1em', color: t.colors.accent.green, marginBottom: '6px' }}>
                    Estimate Report
                  </div>
                  <div style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary, marginBottom: '4px' }}>
                    {estimate.request_name}
                  </div>
                  <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>{fleet?.name || ''}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: t.font.size.sm, color: t.colors.text.secondary, lineHeight: 1.8 }}>
                  <div><strong>Generated:</strong> {today}</div>
                  <div><strong>Fleet:</strong> {fleet?.name || '—'}</div>
                  {fleet?.home_address && <div><strong>Fleet Home:</strong> {fleet.home_address}</div>}
                  <div><strong>Datum:</strong> {estimate.datum_point}</div>
                  <div><strong>Pickup Window:</strong> {fmtDateLong(estimate.equipment_available_date)} – {fmtDateLong(estimate.equipment_needed_date)}</div>
                  {annualVolume > 0 && <div><strong>Annual Volume:</strong> {annualVolume} loads/yr</div>}
                </div>
              </div>
            </div>

            {/* Opportunity banner */}
            <div style={{ padding: '14px 28px', background: `${t.colors.accent.green}0d`, borderBottom: `1px solid ${t.colors.accent.green}25`, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>
                {metrics?.totalOpportunities ?? 0} Available Opportunities Found
              </span>
              {minNetCredit !== null && filtered.length < matches.length && (
                <span style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>
                  ({matches.length - filtered.length} below {fmt$(minNetCredit)} min excluded)
                </span>
              )}
              {estimate.is_relay && (
                <span style={{ padding: '2px 10px', background: `${t.colors.accent.green}20`, borderRadius: t.radius.full, fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.accent.green }}>
                  RELAY MODE
                </span>
              )}
              {!hasRates && matches.length > 0 && (
                <span style={{ fontSize: t.font.size.sm, color: t.colors.accent.amber, fontWeight: t.font.weight.semibold }}>
                  ⚠ Fleet rate config not set — financial calculations unavailable
                </span>
              )}
            </div>

            {/* Table */}
            {metrics && hasRates ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ padding: '14px 18px', textAlign: 'left',  fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, borderBottom: `2px solid ${borderColor}`, width: '38%' }}>Metric</th>
                        <th style={{ padding: '14px 18px', textAlign: 'right', fontSize: t.font.size.sm, fontWeight: t.font.weight.extrabold, color: t.colors.text.primary, borderBottom: `2px solid ${borderColor}` }}>Highest Net</th>
                        <th style={{ padding: '14px 18px', textAlign: 'right', fontSize: t.font.size.sm, fontWeight: t.font.weight.extrabold, color: t.colors.text.primary, borderBottom: `2px solid ${borderColor}` }}>Average (All {metrics.totalOpportunities})</th>
                        <th style={{ padding: '14px 18px', textAlign: 'right', fontSize: t.font.size.sm, fontWeight: t.font.weight.extrabold, color: t.colors.text.primary, borderBottom: `2px solid ${borderColor}` }}>Top 5 Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subheadRow('Customer Credit')}
                      <tr>
                        <td style={labelCell}>Net Credit per Load</td>
                        <td style={valCell(false)}>{fmt$(metrics.highestNet.netCredit)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageAll.netCredit)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageTop5.netCredit)}</td>
                      </tr>
                      {annualVolume > 0 && (
                        <tr>
                          <td style={labelCell}>Annual Credit ({annualVolume} loads)</td>
                          <td style={valCell(false)}>{fmt$(metrics.highestNet.annualCredit)}</td>
                          <td style={valCell(false)}>{fmt$(metrics.averageAll.annualCredit)}</td>
                          <td style={valCell(false)}>{fmt$(metrics.averageTop5.annualCredit)}</td>
                        </tr>
                      )}

                      {subheadRow('Route Activity')}
                      <tr>
                        <td style={labelCell}>Carrier Miles (per load)</td>
                        <td style={valCell(false)}>{fmtNum(metrics.highestNet.additionalMiles)} mi</td>
                        <td style={valCell(false)}>{fmtNum(metrics.averageAll.additionalMiles)} mi</td>
                        <td style={valCell(false)}>{fmtNum(metrics.averageTop5.additionalMiles)} mi</td>
                      </tr>
                      {annualVolume > 0 && (
                        <tr>
                          <td style={labelCell}>Total Annual Mileage Add ({annualVolume} loads)</td>
                          <td style={valCell(false)}>{fmtNum(metrics.highestNet.annualMiles)} mi</td>
                          <td style={valCell(false)}>{fmtNum(metrics.averageAll.annualMiles)} mi</td>
                          <td style={valCell(false)}>{fmtNum(metrics.averageTop5.annualMiles)} mi</td>
                        </tr>
                      )}
                      <tr>
                        <td style={labelCell}>Stops Added (per load)</td>
                        <td style={valCell(false)}>{fmtNum(metrics.highestNet.stopCount)}</td>
                        <td style={valCell(false)}>{fmtNum(metrics.averageAll.stopCount)}</td>
                        <td style={valCell(false)}>{fmtNum(metrics.averageTop5.stopCount)}</td>
                      </tr>

                      {subheadRow('Carrier Annual Revenue Components')}
                      <tr>
                        <td style={labelCell}>Backhaul % Split</td>
                        <td style={valCell(false)}>{fmt$(metrics.highestNet.annualCarrierSplit)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageAll.annualCarrierSplit)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageTop5.annualCarrierSplit)}</td>
                      </tr>
                      <tr>
                        <td style={labelCell}>OOR Miles (carrier miles × rate × vol)</td>
                        <td style={valCell(false)}>{fmt$(metrics.highestNet.annualOorMiles)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageAll.annualOorMiles)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageTop5.annualOorMiles)}</td>
                      </tr>
                      <tr>
                        <td style={labelCell}>OOR Stops ({fmtNum(metrics.highestNet.stopCount)} per load × stop rate × vol)</td>
                        <td style={valCell(false)}>{fmt$(metrics.highestNet.annualOorStops)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageAll.annualOorStops)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageTop5.annualOorStops)}</td>
                      </tr>
                      <tr>
                        <td style={labelCell}>OOR Fuel Surcharge (FSC × OOR mi × vol)</td>
                        <td style={valCell(false)}>{fmt$(metrics.highestNet.annualOorFsc)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageAll.annualOorFsc)}</td>
                        <td style={valCell(false)}>{fmt$(metrics.averageTop5.annualOorFsc)}</td>
                      </tr>
                      {(metrics.highestNet.annualOtherCharges > 0 || metrics.averageAll.annualOtherCharges > 0) && (
                        <tr>
                          <td style={labelCell}>Other Charges (annual)</td>
                          <td style={valCell(false)}>{fmt$(metrics.highestNet.annualOtherCharges)}</td>
                          <td style={valCell(false)}>{fmt$(metrics.averageAll.annualOtherCharges)}</td>
                          <td style={valCell(false)}>{fmt$(metrics.averageTop5.annualOtherCharges)}</td>
                        </tr>
                      )}

                      {subheadRow('Carrier Total Annual Revenue Addition')}
                      <tr style={{ background: `${t.colors.accent.green}08` }}>
                        <td style={{ ...labelCell, fontWeight: t.font.weight.extrabold, color: t.colors.text.primary, fontSize: t.font.size.base }}>Total Carrier Revenue Addition</td>
                        <td style={{ ...valCell(true), fontSize: t.font.size.base }}>{fmt$(metrics.highestNet.carrierTotal)}</td>
                        <td style={{ ...valCell(true), fontSize: t.font.size.base }}>{fmt$(metrics.averageAll.carrierTotal)}</td>
                        <td style={{ ...valCell(true), fontSize: t.font.size.base }}>{fmt$(metrics.averageTop5.carrierTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {minNetCredit !== null && (
                  <div style={{ padding: '14px 24px', borderTop: `1px solid ${borderColor}`, fontSize: t.font.size.sm, color: t.colors.text.muted }}>
                    <strong>Minimum Net Credit Threshold:</strong> {fmt$(minNetCredit)} per load — report shows only qualifying opportunities
                  </div>
                )}
              </>
            ) : metrics && !hasRates ? (
              <div style={{ padding: '48px', textAlign: 'center', color: t.colors.text.muted }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>💰</div>
                <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, marginBottom: '8px' }}>Fleet rate configuration required</div>
                <div style={{ fontSize: t.font.size.sm }}>Set revenue split %, mileage rate, stop rate, and fuel settings in Fleets → Profile.</div>
              </div>
            ) : (
              <div style={{ padding: '48px', textAlign: 'center', color: t.colors.text.muted }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                {minNetCredit !== null && matches.length > 0 && filtered.length === 0 ? (
                  <>
                    <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, marginBottom: '8px' }}>No opportunities meet the {fmt$(minNetCredit)} minimum net credit threshold.</div>
                    <div style={{ fontSize: t.font.size.sm }}>{matches.length} found but none qualified. Try lowering the minimum net credit.</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, marginBottom: '8px' }}>No matching opportunities found for this route.</div>
                    <div style={{ fontSize: t.font.size.sm }}>Try a different empty location or check fleet equipment settings.</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ─── (old AnnualProjectionCard placeholder — replaced by EstimateReport) ──────
function AnnualProjectionCard({ topMatch, annualVolume }) {
  if (!topMatch || !annualVolume) return null;

  const hasRateConfig = topMatch.has_rate_config;
  const annualRevenue = topMatch.total_revenue != null ? topMatch.total_revenue * annualVolume : null;
  const annualNet = hasRateConfig && topMatch.customer_net_credit != null
    ? topMatch.customer_net_credit * annualVolume
    : null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: `1px solid ${t.colors.accent.blue}30`,
      borderRadius: t.radius['2xl'],
      padding: '20px 24px',
      marginBottom: '20px',
    }}>
      <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.accent.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
        Annual Projection
      </div>
      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
        {annualRevenue != null && (
          <div>
            <div style={{ fontSize: t.font.size['3xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary }}>
              {fmtMoney(annualRevenue)}
            </div>
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>Estimated Annual Revenue</div>
          </div>
        )}
        {annualNet != null && (
          <div>
            <div style={{ fontSize: t.font.size['3xl'], fontWeight: t.font.weight.black, color: t.colors.accent.green }}>
              {fmtMoney(annualNet)}
            </div>
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>Estimated Annual Net Credit</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '10px' }}>
        Based on top match × {annualVolume.toLocaleString()} loads/year
      </div>
    </div>
  );
}

// ─── Results panel ────────────────────────────────────────────────────────────

function EstimateResultsPanel({ estimate, fleet, matches, isLoading, error, hasRun, onRun, onEdit }) {
  const annualVolume = estimate.annual_volume;
  const topMatch = matches[0] || null;
  const canPrint = !isLoading && hasRun && matches.length > 0;

  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = '__est_print_style__';
    style.textContent = `
      @media print {
        @page { margin: 0.75in; }
        body > #root aside,
        body > #root > div > div:first-child { display: none !important; }
        #estimate-print-area {
          position: fixed !important;
          inset: 0 !important;
          overflow: visible !important;
          background: white !important;
          padding: 0 !important;
        }
        #estimate-print-header { display: flex !important; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    window.addEventListener('afterprint', () => {
      document.getElementById('__est_print_style__')?.remove();
    }, { once: true });
  };

  return (
    <div id="estimate-print-area" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Print-only header */}
      <div id="estimate-print-header" style={{ display: 'none', padding: '0 0 16px', borderBottom: '2px solid #e2e8f0', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{estimate.request_name} — Estimate Report</div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {fleet?.name} · {estimate.datum_point} · Generated {new Date().toLocaleDateString()}
            {annualVolume ? ` · ${annualVolume} loads/yr projection` : ''}
          </div>
        </div>
      </div>

      <div className="no-print" style={{
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${t.colors.page.cardBorder}`,
        background: t.colors.page.cardBg,
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '2px' }}>
            {estimate.request_name}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{estimate.datum_point}</span>
            {fleet && <span>· {fleet.name}</span>}
            {estimate.annual_volume && <span>· {estimate.annual_volume} loads/yr projection</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {canPrint && (
            <GhostBtn onClick={handlePrint} style={{ padding: '6px 12px', fontSize: t.font.size.xs }}>
              🖨 Print / Save PDF
            </GhostBtn>
          )}
          <GhostBtn onClick={() => onEdit(estimate)} style={{ padding: '6px 10px', fontSize: t.font.size.xs }}>
            ✏️ Edit
          </GhostBtn>
          {/* #83: expired pickup window — run disabled until dates are edited forward */}
          <span title={isRequestExpired(estimate) ? EXPIRED_HINT : undefined}>
            <PrimaryBtn onClick={onRun} disabled={isLoading || isRequestExpired(estimate)} style={{ padding: '6px 14px', fontSize: t.font.size.xs, ...(isRequestExpired(estimate) ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>
              {isLoading ? '⏳ Running…' : <><span>▶ Run Estimate</span><CreditBadge /></>}
            </PrimaryBtn>
          </span>
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '110px', borderRadius: t.radius.xl, background: '#f1f5f9', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠️</div>
            <div style={{ color: t.colors.text.primary, fontWeight: t.font.weight.semibold, marginBottom: '6px' }}>Estimate failed</div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>{error}</div>
          </Card>
        )}

        {!isLoading && !error && !hasRun && (
          <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📊</div>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>
              Ready to estimate
            </div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm, marginBottom: '20px' }}>
              Click "Run Estimate" to find loads along this route and project annual revenue.
            </div>
            <span title={isRequestExpired(estimate) ? EXPIRED_HINT : undefined}>
              <PrimaryBtn onClick={onRun} disabled={isRequestExpired(estimate)} style={isRequestExpired(estimate) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>▶ Run Estimate <CreditBadge /></PrimaryBtn>
            </span>
            {isRequestExpired(estimate) && (
              <div style={{ marginTop: '10px', fontSize: t.font.size.xs, color: t.colors.accent.red, fontWeight: t.font.weight.semibold }}>{EXPIRED_HINT}</div>
            )}
          </Card>
        )}

        {!isLoading && !error && hasRun && matches.length === 0 && (
          <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>
              No matches found
            </div>
            <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm, maxWidth: '360px', margin: '0 auto' }}>
              No loads were found along this route. Try a different empty location or check the fleet home address.
            </div>
          </Card>
        )}

        {!isLoading && !error && matches.length > 0 && (
          <>
            {annualVolume && (
              <AnnualProjectionCard topMatch={topMatch} annualVolume={annualVolume} />
            )}

            <SectionLabel style={{ marginBottom: '12px' }}>
              {matches.length} Load{matches.length !== 1 ? 's' : ''} Found — Ranked by{topMatch?.has_rate_config ? ' Net Credit' : ' Revenue'}
            </SectionLabel>

            {matches.map((match, idx) => (
              <MatchCard key={match.load_id || idx} match={match} rank={idx + 1} />
            ))}
          </>
        )}
      </div>

      <style>{`
        @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ─── Empty right panel ────────────────────────────────────────────────────────

function EmptyRight() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: t.colors.page.bg }}>
      <div style={{ textAlign: 'center', maxWidth: '320px' }}>
        <div style={{
          width: '64px', height: '64px',
          borderRadius: t.radius['2xl'],
          background: t.colors.accent.purpleLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: '28px',
        }}>
          📊
        </div>
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '8px' }}>
          Revenue Estimates
        </div>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, lineHeight: 1.6 }}>
          Select an estimate or create a new one to project annual revenue potential from a route.
        </div>
      </div>
    </div>
  );
}

// ─── EstimatesView ────────────────────────────────────────────────────────────

export function EstimatesView() {
  const { user } = useAuth();
  const { deductCredit, openCheckout } = useCredits();
  const isMobile = useMobile();

  const [estimates, setEstimates] = useState([]);
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState('empty'); // 'empty' | 'form' | 'results'
  const [editingEstimate, setEditingEstimate] = useState(null);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [selectedFleet, setSelectedFleet] = useState(null);

  const [matches, setMatches] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [hasRun, setHasRun] = useState(false);

  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ests, fls] = await Promise.all([
        db.estimateRequests.getAll(user.id),
        db.fleets.getAll(user.id),
      ]);
      setEstimates(ests || []);
      setFleets(fls || []);
    } finally {
      setLoading(false);
    }
  };

  const runEstimate = useCallback(async (estimate) => {
    if (!estimate) return;
    // #83: expired pickup window — refuse to run so no credit is deducted.
    if (isRequestExpired(estimate)) {
      setMatchError(EXPIRED_HINT);
      return;
    }
    setIsMatching(true);
    setMatchError(null);
    setMatches([]);
    setHasRun(false);

    try {
      const [creditResult, fleetData, geocoded] = await Promise.all([
        deductCredit('Estimate search'),
        db.fleets.getById(estimate.fleet_id),
        geocodeAddress(estimate.datum_point),
      ]);

      if (!creditResult.success) {
        setBuyCreditsOpen(true);
        return;
      }

      setSelectedFleet(fleetData);

      if (!fleetData.home_lat || !fleetData.home_lng) {
        throw new Error('Fleet home address is not geocoded. Go to Fleets → Profile and verify the home base address.');
      }

      const rawProfile = Array.isArray(fleetData.fleet_profiles)
        ? fleetData.fleet_profiles[0]
        : fleetData.fleet_profiles;

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
        ? { address: geocoded.label || estimate.datum_point, lat: geocoded.lat, lng: geocoded.lng }
        : { address: estimate.datum_point, lat: fleetData.home_lat, lng: fleetData.home_lng };

      const fleetHome = { lat: fleetData.home_lat, lng: fleetData.home_lng, address: fleetData.home_address };
      const geocodeFailed = datumPoint.lat === fleetData.home_lat && datumPoint.lng === fleetData.home_lng;
      const homeRadiusMiles = geocodeFailed ? 200 : 100;
      const corridorWidthMiles = geocodeFailed ? 300 : 100;

      const [datumCityParsed = '', datumStateParsed = ''] = (estimate.datum_point || '').split(',').map(s => s.trim());
      const requestContext = {
        datumCity:     datumCityParsed || datumPoint.address || estimate.datum_point,
        datumState:    datumStateParsed,
        datumLat:      datumPoint.lat || 0,
        datumLng:      datumPoint.lng || 0,
        homeCity:      fleetData.home_city || fleetData.home_address || '',
        homeState:     fleetData.home_state || '',
        homeLat:       fleetData.home_lat || 0,
        homeLng:       fleetData.home_lng || 0,
        equipmentType: fleetProfile.trailerType || fleetProfile.trailer_type || 'Dry Van',
        modes:         Array.isArray(rawProfile?.modes) ? rawProfile.modes : [],
        pickupDate:    estimate.equipment_available_date || '',
      };

      const loadsResult = await getLoadsForMatching(user.id, estimate.fleet_id, requestContext);
      const { loads: loadsForMatching } = loadsResult || { loads: [] };

      logActivityEvent(ACTIVITY_EVENTS.SEARCH_RUN, { kind: 'estimate', request_id: estimate.id }); // #85
      const result = await findRouteHomeBackhauls(
        datumPoint,
        fleetHome,
        fleetProfile,
        loadsForMatching,
        homeRadiusMiles,
        corridorWidthMiles,
        rateConfig,
        estimate.is_relay || false
      );

      setMatches(result.opportunities || []);
      setHasRun(true);
    } catch (err) {
      console.error('Estimate matching error:', err);
      setMatchError(err.message || 'An error occurred during the estimate.');
    } finally {
      setIsMatching(false);
    }
  }, [user]);

  const handleSelectEstimate = (estimate) => {
    setSelectedEstimate(estimate);
    setMode('results');
    setMatches([]);
    setMatchError(null);
    setHasRun(false);
    setSelectedFleet(null);
    setEditingEstimate(null);
  };

  const handleNew = () => {
    setEditingEstimate(null);
    setMode('form');
  };

  const handleEdit = (estimate) => {
    setEditingEstimate(estimate);
    setMode('form');
  };

  const handleFormSave = async () => {
    await loadData();
    setMode(selectedEstimate ? 'results' : 'empty');
    setEditingEstimate(null);
  };

  const handleFormCancel = () => {
    setMode(selectedEstimate ? 'results' : 'empty');
    setEditingEstimate(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await db.estimateRequests.update(deleteTarget.id, { status: 'cancelled' });
    } catch (e) {
      console.error(e);
    }
    if (selectedEstimate?.id === deleteTarget.id) {
      setSelectedEstimate(null);
      setMode('empty');
    }
    setDeleteTarget(null);
    await loadData();
  };

  const showingDetail = isMobile && (mode === 'form' || mode === 'results');

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', background: t.colors.page.bg }}>
        {!isMobile && (
          <div style={{ width: '280px', background: t.colors.page.cardBg, borderRight: `1px solid ${t.colors.page.cardBorder}`, padding: '20px 16px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '70px', borderRadius: t.radius.xl, background: '#f1f5f9', marginBottom: '8px', animation: 'shimmer 1.5s infinite' }} />
            ))}
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
      {(!isMobile || !showingDetail) && (
        <EstimateListPanel
          estimates={estimates}
          selectedId={selectedEstimate?.id}
          onSelect={handleSelectEstimate}
          onEdit={handleEdit}
          onDelete={est => setDeleteTarget(est)}
          onNew={handleNew}
          isMobile={isMobile}
        />
      )}

      {(!isMobile || showingDetail) && (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {isMobile && showingDetail && (
            <div style={{ padding: '10px 14px', background: t.colors.page.cardBg, borderBottom: `1px solid ${t.colors.page.cardBorder}`, flexShrink: 0 }}>
              <button
                onClick={() => { setMode('empty'); setSelectedEstimate(null); setEditingEstimate(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.accent.blue, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, padding: '4px 0' }}
              >
                ‹ Estimates
              </button>
            </div>
          )}

          {mode === 'empty' && <EmptyRight />}

          {mode === 'form' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px' }}>
              <EstimateForm
                fleets={fleets}
                initialValues={editingEstimate}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
              />
            </div>
          )}

          {mode === 'results' && selectedEstimate && (
            <EstimateReport
              estimate={selectedEstimate}
              fleet={selectedFleet}
              matches={matches}
              isLoading={isMatching}
              error={matchError}
              hasRun={hasRun}
              onRun={() => runEstimate(selectedEstimate)}
              onEdit={handleEdit}
            />
          )}
        </div>
      )}

      {buyCreditsOpen && (
        <BuyCreditsModal
          onClose={() => setBuyCreditsOpen(false)}
          onPurchase={async (pkgId) => { await openCheckout(pkgId); setBuyCreditsOpen(false); }}
          insufficientCredits={true}
        />
      )}

      {deleteTarget && (
        <div
          onClick={() => setDeleteTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: t.radius['2xl'], padding: '28px', maxWidth: '380px', width: '90%', boxShadow: t.shadow.lg }}>
            <div style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '10px' }}>Cancel Estimate</div>
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
