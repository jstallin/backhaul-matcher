import { useState } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { db } from '../../lib/supabase';
import { X, CheckCircle, Clock, ChevronRight, DollarSign, Calendar } from '../../icons';

const t = tokens;

const fmt$ = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v ?? 0);

const fmtDateTime = (val) => {
  if (!val) return '—';
  const d = typeof val === 'string' ? new Date(val) : val;
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const STATUS_CONFIG = {
  pending:     { label: 'Not Booked',  bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  booked:      { label: 'Booked',      bg: '#fffbeb', color: '#b45309', border: '#fcd34d' },
  hauled:      { label: 'Hauled',      bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
};

const PLAN_STATUS_CONFIG = {
  active:      { label: 'Active',      bg: '#eff6ff', color: '#2563eb' },
  in_progress: { label: 'In Progress', bg: '#fffbeb', color: '#b45309' },
  completed:   { label: 'Completed',   bg: '#f0fdf4', color: '#16a34a' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{
      fontSize: t.font.size.xs,
      fontWeight: t.font.weight.bold,
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: t.radius.full,
      padding: '2px 10px',
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function LoadDetailCard({ load, loadKey, status, planId, onUpdated, stepLabel, accentColor }) {
  const [updating, setUpdating] = useState(false);
  const phone = load.contactPhone || load.contact_phone;
  const broker = load.broker || load.company_name;
  const loadRef = load.df_load_number || load.source_load_id || load.load_id;

  const markAs = async (newStatus) => {
    setUpdating(true);
    try {
      const updated = await db.workWeekPlans.updateLoadStatus(planId, loadKey, newStatus);
      onUpdated(updated);
    } catch (err) {
      console.error('Failed to update load status:', err?.message || err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${accentColor}30`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: t.radius.lg,
      overflow: 'hidden',
      background: '#fff',
    }}>
      {/* Step header */}
      <div style={{
        padding: '10px 14px',
        background: accentColor + '08',
        borderBottom: `1px solid ${accentColor}20`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {stepLabel}
        </span>
        <StatusPill status={status} />
      </div>

      <div style={{ padding: '14px' }}>
        {/* Route */}
        <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '8px' }}>
          {load.pickup_city}, {load.pickup_state}
          <ChevronRight size={14} color={t.colors.text.muted} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />
          {load.delivery_city}, {load.delivery_state}
        </div>

        {/* Details row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
          {load.equipment_type && <span>{load.equipment_type}</span>}
          {load.weight_lbs && <span>{Number(load.weight_lbs).toLocaleString()} lbs</span>}
          {load.distance_miles > 0 && <span>{Math.round(load.distance_miles)} mi</span>}
          {loadRef && <span style={{ color: t.colors.text.muted }}>#{loadRef}</span>}
        </div>

        {/* Revenue */}
        <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.accent.green, marginBottom: '10px' }}>
          {fmt$(Number(load.total_revenue))}
        </div>

        {/* Broker info */}
        {(broker || load.shipper || phone) && (
          <div style={{ padding: '10px', background: '#f8fafc', borderRadius: t.radius.md, marginBottom: '10px', fontSize: t.font.size.xs }}>
            {broker && (
              <div style={{ marginBottom: '4px' }}>
                <strong style={{ color: t.colors.text.primary }}>Broker:</strong>{' '}
                <span style={{ color: t.colors.text.secondary }}>{broker}</span>
              </div>
            )}
            {load.shipper && load.shipper !== broker && (
              <div style={{ marginBottom: '4px' }}>
                <strong style={{ color: t.colors.text.primary }}>Shipper:</strong>{' '}
                <span style={{ color: t.colors.text.secondary }}>{load.shipper}</span>
              </div>
            )}
            {phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: t.colors.text.muted, fontWeight: t.font.weight.semibold }}>Contact:</span>
                <a href={`tel:${phone}`} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '3px 12px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md }}>Call</a>
                <a href={`sms:${phone}`} style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '3px 12px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md }}>Text</a>
                <span style={{ color: t.colors.text.secondary }}>{phone}</span>
              </div>
            )}
          </div>
        )}

        {/* Status actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {status === 'pending' && (
            <button
              onClick={() => markAs('booked')}
              disabled={updating}
              style={{ padding: '7px 16px', background: t.colors.accent.blue, color: '#fff', border: 'none', borderRadius: t.radius.md, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1 }}
            >
              {updating ? 'Saving…' : 'Mark as Booked'}
            </button>
          )}
          {status === 'booked' && (
            <>
              <button
                onClick={() => markAs('hauled')}
                disabled={updating}
                style={{ padding: '7px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: t.radius.md, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1 }}
              >
                {updating ? 'Saving…' : 'Mark as Hauled'}
              </button>
              <button
                onClick={() => markAs('pending')}
                disabled={updating}
                style={{ padding: '7px 16px', background: 'none', color: t.colors.text.muted, border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.md, fontSize: t.font.size.sm, cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1 }}
              >
                Undo
              </button>
            </>
          )}
          {status === 'hauled' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold }}>
                <CheckCircle size={16} color="#16a34a" />
                Hauled
              </div>
              <button
                onClick={() => markAs('booked')}
                disabled={updating}
                style={{ padding: '7px 12px', background: 'none', color: t.colors.text.muted, border: `1px solid ${t.colors.border.default}`, borderRadius: t.radius.md, fontSize: t.font.size.xs, cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1 }}
              >
                Undo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlanDetailModal({ plan: initialPlan, onClose, onPlanUpdated }) {
  const [plan, setPlan] = useState(initialPlan);
  const outbound = plan.outbound_load || {};
  const ret = plan.return_load || {};
  const s = plan.chain_summary || {};
  const planCfg = PLAN_STATUS_CONFIG[plan.status] || PLAN_STATUS_CONFIG.active;

  const handleUpdated = (updated) => {
    setPlan(updated);
    if (onPlanUpdated) onPlanUpdated(updated);
  };

  const routeLabel = outbound.pickup_city && ret.delivery_city
    ? `${outbound.pickup_city} → ${outbound.delivery_city || ret.pickup_city} → ${ret.delivery_city}`
    : 'Work Week Plan';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />

      {/* Panel */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '560px',
        height: '100%',
        background: t.colors.page.bg,
        boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: `1px solid ${t.colors.page.cardBorder}`,
          background: '#fff',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <Calendar size={15} color={t.colors.accent.green} />
                <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Work Week Plan
                </span>
                <span style={{
                  fontSize: t.font.size.xs, fontWeight: t.font.weight.bold,
                  color: planCfg.color, background: planCfg.bg,
                  borderRadius: t.radius.full, padding: '2px 8px',
                }}>
                  {planCfg.label}
                </span>
              </div>
              <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {routeLabel}
              </div>
              {s.totalRevenue != null && (
                <div style={{ marginTop: '4px', fontSize: t.font.size.sm, color: t.colors.text.secondary }}>
                  {fmt$(s.totalRevenue)}
                  {s.totalMiles != null && ` · ${Math.round(s.totalMiles).toLocaleString()} mi`}
                  {s.revenuePerTotalMile != null && ` · ${s.revenuePerTotalMile.toFixed(2)}/mi`}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: t.colors.text.muted, flexShrink: 0, borderRadius: t.radius.md }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Deadline */}
          {plan.week_deadline && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
              <Clock size={12} color={t.colors.text.muted} />
              Return by {fmtDateTime(plan.week_deadline)}
            </div>
          )}
        </div>

        {/* Completed banner */}
        {plan.status === 'completed' && (
          <div style={{ padding: '12px 20px', background: '#f0fdf4', borderBottom: `1px solid #bbf7d0`, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <CheckCircle size={16} color="#16a34a" />
            <span style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: '#15803d' }}>
              All loads hauled — week plan complete!
            </span>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Booking order: return first (anchor), then outbound */}
            <LoadDetailCard
              load={ret}
              loadKey="return_status"
              status={plan.return_status || 'pending'}
              planId={plan.id}
              onUpdated={handleUpdated}
              stepLabel="Step 1 — Book this first (anchor load)"
              accentColor={t.colors.accent.blue}
            />
            <LoadDetailCard
              load={outbound}
              loadKey="outbound_status"
              status={plan.outbound_status || 'pending'}
              planId={plan.id}
              onUpdated={handleUpdated}
              stepLabel="Step 2 — Then book this outbound"
              accentColor={t.colors.accent.green}
            />

            {/* Financial summary */}
            {(s.totalRevenue != null || s.totalMiles != null) && (
              <div style={{
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: t.radius.lg,
                border: `1px solid ${t.colors.page.cardBorder}`,
                fontSize: t.font.size.sm,
              }}>
                <div style={{ fontWeight: t.font.weight.semibold, color: t.colors.text.muted, fontSize: t.font.size.xs, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                  Plan Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {s.totalRevenue != null && (
                    <div>
                      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px' }}>Gross Revenue</div>
                      <div style={{ fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{fmt$(s.totalRevenue)}</div>
                    </div>
                  )}
                  {s.revenuePerTotalMile != null && (
                    <div>
                      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px' }}>Rev / Mile</div>
                      <div style={{ fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>${s.revenuePerTotalMile.toFixed(2)}</div>
                    </div>
                  )}
                  {s.totalMiles != null && (
                    <div>
                      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px' }}>Total Miles</div>
                      <div style={{ fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{Math.round(s.totalMiles).toLocaleString()} mi</div>
                    </div>
                  )}
                  {s.arrivalHome && (
                    <div>
                      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px' }}>Est. Home By</div>
                      <div style={{ fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{fmtDateTime(s.arrivalHome)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
