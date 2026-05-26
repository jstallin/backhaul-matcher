import { useState, useEffect } from 'react';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { HaulMonitorLogo } from './HaulMonitorLogo';
import { Calendar, TrendingUp, AlertCircle, Clock, ChevronRight, CheckCircle } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCredits } from '../hooks/useCredits';
import { db } from '../lib/supabase';
import { getLoadsForMatching } from '../utils/getLoadsForMatching';
import { planWorkWeek, PLAN_DEFAULTS } from '../utils/weeklyPlanningAlgorithm';
import { parseFleetHome } from '../utils/parseFleetHome';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt$ = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v ?? 0);

const fmtMiles = (v) => `${Math.round(v).toLocaleString()} mi`;

const fmtDateTime = (date) => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(date));
};

const getDefaultDeadline = () => {
  const now = new Date();
  const daysToFriday = ((5 - now.getDay() + 7) % 7) || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysToFriday);
  friday.setHours(18, 0, 0, 0);
  return friday;
};

const toDateInputValue = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toTimeInputValue = (date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
};


const getLoadBoardUrl = (load) => {
  if (!load) return null;
  if (load.source === 'truckstop' && (load.source_load_id || load.load_id)) {
    return `https://main.truckstop.com/PostingDetails/Loads/${load.source_load_id || load.load_id}`;
  }
  return null;
};

const getSourceLabel = (load) => {
  if (!load?.source) return null;
  const map = { truckstop: 'Truckstop', directfreight: 'DirectFreight', truckerpath: 'TruckerPath', dat: 'DAT' };
  return map[load.source] || load.source;
};

// ─── Load mini card ───────────────────────────────────────────────────────────

function LoadMiniCard({ load, stepNumber, stepLabel, accentColor, colors }) {
  const url = getLoadBoardUrl(load);
  const sourceLabel = getSourceLabel(load);
  const loadRef = load.df_load_number || load.source_load_id || load.load_id;

  return (
    <div style={{
      border: `1px solid ${accentColor}30`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: '8px',
      padding: '12px 14px',
      background: accentColor + '06',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Step {stepNumber} — {stepLabel}
        </span>
        {sourceLabel && (
          <span style={{ fontSize: '10px', fontWeight: 600, color: colors.text.secondary, background: colors.background.secondary, borderRadius: '12px', padding: '2px 8px' }}>
            {sourceLabel}
          </span>
        )}
      </div>

      <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary, marginBottom: '6px' }}>
        {load.pickup_city}, {load.pickup_state} → {load.delivery_city}, {load.delivery_state}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
        {load.equipment_type && <span style={{ fontSize: '12px', color: colors.text.secondary }}>{load.equipment_type}</span>}
        {load.weight_lbs && <span style={{ fontSize: '12px', color: colors.text.secondary }}>{Number(load.weight_lbs).toLocaleString()} lbs</span>}
        {load.distance_miles && <span style={{ fontSize: '12px', color: colors.text.secondary }}>{Math.round(load.distance_miles)} mi</span>}
        {load.company_name && <span style={{ fontSize: '12px', color: colors.text.secondary }}>{load.company_name}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: colors.accent.success || '#10b981' }}>
          {fmt$(Number(load.total_revenue))}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loadRef && !url && <span style={{ fontSize: '11px', color: colors.text.secondary }}>#{loadRef}</span>}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', fontWeight: 600,
                color: colors.accent.primary,
                textDecoration: 'none',
                padding: '4px 10px',
                border: `1px solid ${colors.accent.primary}40`,
                borderRadius: '8px',
                background: `${colors.accent.primary}10`,
              }}
            >
              View on {sourceLabel} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── String bar ───────────────────────────────────────────────────────────────

function StringBar({ totalMiles, colors }) {
  const maxMiles = PLAN_DEFAULTS.maxStringMiles;
  const pct = Math.min(100, (totalMiles / maxMiles) * 100);

  const color = totalMiles > maxMiles ? '#ef4444'
    : totalMiles >= PLAN_DEFAULTS.minStringMiles ? '#10b981'
    : '#f59e0b';

  const label = totalMiles > maxMiles ? 'Over budget'
    : totalMiles >= PLAN_DEFAULTS.minStringMiles && totalMiles <= PLAN_DEFAULTS.stringMiles ? 'Optimal'
    : totalMiles > PLAN_DEFAULTS.stringMiles ? 'Acceptable'
    : 'Under optimal';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '11px', color: colors.text.secondary }}>Weekly miles</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color }}>{fmtMiles(totalMiles)} / {fmtMiles(maxMiles)} — {label}</span>
      </div>
      <div style={{ position: 'relative', height: '7px', background: colors.border.secondary, borderRadius: '4px' }}>
        <div style={{
          position: 'absolute',
          left: `${(PLAN_DEFAULTS.minStringMiles / maxMiles) * 100}%`,
          width: `${((PLAN_DEFAULTS.stringMiles - PLAN_DEFAULTS.minStringMiles) / maxMiles) * 100}%`,
          height: '100%', background: 'rgba(16,185,129,0.12)', borderRadius: '2px',
        }} />
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ position: 'relative', height: '14px', marginTop: '3px' }}>
        <span style={{ position: 'absolute', left: `${(PLAN_DEFAULTS.minStringMiles / maxMiles) * 100}%`, fontSize: '10px', color: colors.text.secondary, transform: 'translateX(-50%)' }}>2k</span>
        <span style={{ position: 'absolute', left: `${(PLAN_DEFAULTS.stringMiles / maxMiles) * 100}%`, fontSize: '10px', color: colors.text.secondary, transform: 'translateX(-50%)' }}>2.5k</span>
        <span style={{ position: 'absolute', right: 0, fontSize: '10px', color: colors.text.secondary }}>3k</span>
      </div>
    </div>
  );
}

// ─── Timeline primitives ─────────────────────────────────────────────────────

function Stop({ city, isHome, colors }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: isHome ? '12px' : '10px', height: isHome ? '12px' : '10px',
        borderRadius: '50%', flexShrink: 0,
        background: isHome ? colors.accent.primary : 'transparent',
        border: `2px solid ${isHome ? colors.accent.primary : colors.border.primary}`,
      }} />
      <span style={{ fontSize: '13px', fontWeight: isHome ? 600 : 500, color: colors.text.primary }}>
        {city}
      </span>
    </div>
  );
}

function Connector({ miles, type, revenue, colors }) {
  const isDeadhead = type === 'deadhead';
  const greenColor = colors.accent.success || '#10b981';
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
      <div style={{ width: '2px', minHeight: '20px', margin: '2px 5px', background: isDeadhead ? colors.border.secondary : greenColor, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
        <span style={{ fontSize: '11px', color: colors.text.secondary, fontStyle: isDeadhead ? 'italic' : 'normal' }}>
          {fmtMiles(miles)} {isDeadhead ? 'deadhead' : 'loaded'}
        </span>
        {revenue != null && !isDeadhead && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: greenColor }}>{fmt$(revenue)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Chain card ───────────────────────────────────────────────────────────────

function ChainCard({ chain, rank, fleetHomeName, colors, onSelect, isSelected, saving }) {
  const { outboundLoad, returnLoad, legs, totalMiles, totalRevenue, revenuePerTotalMile,
          departureTime, returnPickupTime, arrivalHome } = chain;

  const rpmColor = revenuePerTotalMile >= 3 ? (colors.accent.success || '#10b981')
    : revenuePerTotalMile >= 2 ? '#f59e0b'
    : '#ef4444';

  const greenColor = colors.accent.success || '#10b981';

  return (
    <div style={{
      background: colors.background.card,
      border: `1px solid ${colors.border.secondary}`,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: rank === 1 ? `${colors.accent.primary}0a` : undefined,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {rank === 1 && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent.primary, background: `${colors.accent.primary}18`, borderRadius: '12px', padding: '2px 8px' }}>
              Best Match
            </span>
          )}
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>Departs {fmtDateTime(departureTime)}</span>
          <ChevronRight size={12} color={colors.text.secondary} />
          <span style={{ fontSize: '12px', color: colors.text.secondary }}>Home by {fmtDateTime(arrivalHome)}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: rpmColor }}>{revenuePerTotalMile.toFixed(2)}/mi</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>{fmt$(totalRevenue)}</span>
        </div>
      </div>

      {/* Load cards */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <LoadMiniCard
          load={returnLoad}
          stepNumber={1}
          stepLabel="Book this first (anchor load)"
          accentColor={colors.accent.primary}
          colors={colors}
        />
        <LoadMiniCard
          load={outboundLoad}
          stepNumber={2}
          stepLabel="Then book this outbound"
          accentColor={greenColor}
          colors={colors}
        />
      </div>

      {/* Timeline */}
      <div style={{ padding: '0 16px 6px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Route</div>
        <Stop city={fleetHomeName || 'Home Base'} isHome colors={colors} />
        {legs.homeToPickup > 0 && <>
          <Connector miles={legs.homeToPickup} type="deadhead" colors={colors} />
          <Stop city={`${outboundLoad.pickup_city}, ${outboundLoad.pickup_state}`} colors={colors} />
        </>}
        <Connector miles={legs.outboundLoaded} type="loaded" revenue={Number(outboundLoad.total_revenue)} colors={colors} />
        <Stop city={`${outboundLoad.delivery_city}, ${outboundLoad.delivery_state}`} colors={colors} />
        {legs.deadhead > 0 && <>
          <Connector miles={legs.deadhead} type="deadhead" colors={colors} />
          <Stop city={`${returnLoad.pickup_city}, ${returnLoad.pickup_state}`} colors={colors} />
        </>}
        <Connector miles={legs.returnLoaded} type="loaded" revenue={Number(returnLoad.total_revenue)} colors={colors} />
        <Stop city={`${returnLoad.delivery_city}, ${returnLoad.delivery_state}`} colors={colors} />
        {legs.returnToHome > 0 && <Connector miles={legs.returnToHome} type="deadhead" colors={colors} />}
        <Stop city={fleetHomeName || 'Home Base'} isHome colors={colors} />

        <div style={{
          marginTop: '12px', padding: '8px 12px',
          background: colors.background.secondary,
          borderRadius: '8px', border: `1px solid ${colors.border.secondary}`,
          fontSize: '11px', color: colors.text.secondary,
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Clock size={11} color={colors.text.secondary} />
          Pick up return load by {fmtDateTime(returnPickupTime)}
        </div>
      </div>

      {/* String bar */}
      <div style={{ padding: '12px 16px' }}>
        <StringBar totalMiles={totalMiles} colors={colors} />
      </div>

      {/* Select plan */}
      <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${colors.border.secondary}`, paddingTop: '12px', marginTop: '4px' }}>
        {isSelected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: greenColor, fontSize: '13px', fontWeight: 600 }}>
            <CheckCircle size={15} color={greenColor} />
            This plan is active
          </div>
        ) : (
          <button
            onClick={() => onSelect(chain)}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px',
              background: saving ? '#e2e8f0' : colors.accent.primary,
              color: saving ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Select This Plan'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Active plan banner ───────────────────────────────────────────────────────

function ActivePlanBanner({ plan, colors, onMarkComplete, completing }) {
  const s = plan.chain_summary || {};
  const outbound = plan.outbound_load || {};
  const ret = plan.return_load || {};
  const routeLabel = outbound.pickup_city && ret.delivery_city
    ? `${outbound.pickup_city} → ${outbound.delivery_city} → ${ret.delivery_city}`
    : 'Work Week Plan In Progress';
  const greenColor = colors.accent.success || '#10b981';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${greenColor}18, ${greenColor}08)`,
      border: `1px solid ${greenColor}40`,
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: greenColor }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: greenColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active Plan
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary, marginBottom: '3px' }}>
          {routeLabel}
        </div>
        <div style={{ fontSize: '12px', color: colors.text.secondary }}>
          {s.totalRevenue != null && `${fmt$(s.totalRevenue)} · `}
          {s.totalMiles != null && `${fmtMiles(s.totalMiles)} · `}
          Home by {fmtDateTime(plan.week_deadline)}
        </div>
      </div>
      <button
        onClick={onMarkComplete}
        disabled={completing}
        style={{
          padding: '8px 14px', borderRadius: '8px',
          border: `1px solid ${greenColor}60`, background: colors.background.card,
          color: greenColor, fontSize: '13px', fontWeight: 600,
          cursor: completing ? 'not-allowed' : 'pointer', flexShrink: 0,
        }}
      >
        {completing ? 'Saving…' : 'Mark Complete'}
      </button>
    </div>
  );
}

// ─── Return-only card ─────────────────────────────────────────────────────────

function ReturnOnlyCard({ option, colors }) {
  const { load, pickupToDeliveryMiles, deliveryToHomeMiles, totalMiles, revenue, revenuePerMile } = option;
  const url = getLoadBoardUrl(load);
  const sourceLabel = getSourceLabel(load);

  return (
    <div style={{
      padding: '12px 14px', border: `1px solid ${colors.border.secondary}`,
      borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>
          {load.pickup_city}, {load.pickup_state} → {load.delivery_city}, {load.delivery_state}
        </div>
        <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: '2px' }}>
          {fmtMiles(pickupToDeliveryMiles)} loaded · {fmtMiles(deliveryToHomeMiles)} to home
          {sourceLabel && ` · ${sourceLabel}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.accent.success || '#10b981' }}>{fmt$(revenue)}</div>
          <div style={{ fontSize: '11px', color: colors.text.secondary }}>{revenuePerMile.toFixed(2)}/mi · {fmtMiles(totalMiles)} total</div>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', fontWeight: 600, color: colors.accent.primary, textDecoration: 'none', padding: '4px 10px', border: `1px solid ${colors.accent.primary}40`, borderRadius: '8px', background: `${colors.accent.primary}10` }}>
            View ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Setup form ───────────────────────────────────────────────────────────────

function SetupForm({ fleets, colors, onRun, loading, error }) {
  const defaultDeadline = getDefaultDeadline();
  const [selectedFleetId, setSelectedFleetId] = useState(fleets.length === 1 ? fleets[0].id : '');
  const [deadlineDate, setDeadlineDate] = useState(toDateInputValue(defaultDeadline));
  const [deadlineTime, setDeadlineTime] = useState(toTimeInputValue(defaultDeadline));

  const selectedFleet = fleets.find(f => f.id === selectedFleetId);
  const hasHome = selectedFleet?.home_lat && selectedFleet?.home_lng;
  const canRun = selectedFleetId && hasHome && deadlineDate && deadlineTime && !loading;

  const handleRun = () => {
    const [year, month, day] = deadlineDate.split('-').map(Number);
    const [hours, minutes] = deadlineTime.split(':').map(Number);
    onRun(selectedFleet, new Date(year, month - 1, day, hours, minutes, 0));
  };

  const inputStyle = {
    padding: '9px 12px', fontSize: '14px',
    border: `1px solid ${colors.border.secondary}`,
    borderRadius: '8px', background: colors.background.card,
    color: colors.text.primary,
  };

  return (
    <div style={{ background: colors.background.card, border: `1px solid ${colors.border.secondary}`, borderRadius: '12px', padding: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Fleet */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
            Fleet
          </label>
          <select
            value={selectedFleetId}
            onChange={e => setSelectedFleetId(e.target.value)}
            style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
          >
            {fleets.length !== 1 && <option value="">Select a fleet…</option>}
            {fleets.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {selectedFleet && !hasHome && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
              Home base not geocoded. Go to Fleets → Profile to set the home address.
            </div>
          )}
          {selectedFleet && hasHome && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: colors.text.secondary }}>
              Home: {selectedFleet.home_address}
            </div>
          )}
        </div>

        {/* Deadline */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
            Must be home by
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)} style={{ ...inputStyle, width: '120px' }} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', background: '#fef2f2', borderRadius: '8px', fontSize: '13px', color: '#ef4444' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            {error}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={!canRun}
          style={{
            width: '100%', padding: '11px',
            background: !canRun ? '#e2e8f0' : colors.accent.primary,
            color: !canRun ? '#94a3b8' : '#fff',
            border: 'none', borderRadius: '8px',
            fontSize: '14px', fontWeight: 600,
            cursor: !canRun ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          {loading ? (
            <>
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Finding optimal week…
            </>
          ) : (
            <>
              <Calendar size={15} />Run Week Plan
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                marginLeft: '6px', paddingLeft: '8px',
                borderLeft: '1px solid rgba(255,255,255,0.28)',
                fontSize: '11px', fontWeight: 700, opacity: 0.9, whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg, #fcd34d, #f59e0b)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'inline-block', flexShrink: 0 }} />
                5 credits
              </span>
            </>
          )}
        </button>
        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
          5 credits per run
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const WorkWeekPlanning = ({ onMenuNavigate }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { deductCredit } = useCredits();
  const [fleets, setFleets] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(true);
  const [activePlan, setActivePlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  const [planResult, setPlanResult] = useState(null);
  const [currentFleet, setCurrentFleet] = useState(null);
  const [fleetHomeName, setFleetHomeName] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [noCredits, setNoCredits] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [selectedChainIndex, setSelectedChainIndex] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      db.fleets.getAll(user.id).then(f => setFleets(f || [])).finally(() => setLoadingFleets(false)),
      db.workWeekPlans.getActive(user.id).then(p => setActivePlan(p)).finally(() => setLoadingPlan(false)),
    ]);
  }, [user]);

  const handleRun = async (fleet, deadline) => {
    setRunning(true);
    setError(null);
    setNoCredits(false);
    setPlanResult(null);
    setSelectedChainIndex(null);
    setCurrentFleet(fleet);

    try {
      const rawProfile = Array.isArray(fleet.fleet_profiles)
        ? fleet.fleet_profiles[0]
        : fleet.fleet_profiles;
      const fleetProfile = rawProfile
        ? { trailerType: rawProfile.trailer_type || rawProfile.trailerType, trailerLength: rawProfile.trailer_length || rawProfile.trailerLength, weightLimit: rawProfile.weight_limit || rawProfile.weightLimit }
        : {};

      const hasRateConfig = rawProfile && (rawProfile.revenue_split_carrier != null || rawProfile.mileage_rate != null);
      const rateConfig = hasRateConfig ? {
        revenueSplitCarrier: rawProfile.revenue_split_carrier || 20,
        mileageRate: rawProfile.mileage_rate ? parseFloat(rawProfile.mileage_rate) : 0,
        fuelMpg: rawProfile.fuel_mpg ? parseFloat(rawProfile.fuel_mpg) : 6,
        fuelPeg: rawProfile.fuel_peg ? parseFloat(rawProfile.fuel_peg) : 0,
        doePaddRate: rawProfile.doe_padd_rate ? parseFloat(rawProfile.doe_padd_rate) : 0,
      } : null;

      const { city: homeCity, state: homeState } = parseFleetHome(fleet);
      const fleetHome = { lat: fleet.home_lat, lng: fleet.home_lng, city: homeCity, state: homeState };
      setFleetHomeName(fleet.home_address || `${homeCity}, ${homeState}` || 'Home Base');

      const requestContext = {
        datumCity: homeCity, datumState: homeState, datumLat: fleet.home_lat, datumLng: fleet.home_lng,
        homeCity, homeState, homeLat: fleet.home_lat, homeLng: fleet.home_lng,
        equipmentType: fleetProfile.trailerType || 'Dry Van', pickupDate: '',
      };

      const [creditResult, loadsResult] = await Promise.all([
        deductCredit('Work week plan', 5).catch(err => ({ success: false, error: err.message })),
        getLoadsForMatching(user.id, fleet.id, requestContext),
      ]);

      if (!creditResult.success) {
        setNoCredits(true);
        return;
      }

      const { loads } = loadsResult;
      const result = await planWorkWeek({ fleetHome, fleetProfile, weekDeadline: deadline, loads, rateConfig });
      setPlanResult(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const handleSelectPlan = async (chain, index) => {
    if (!user || !currentFleet) return;
    setSavingPlanId(index);
    try {
      const saved = await db.workWeekPlans.save({
        userId: user.id,
        fleetId: currentFleet.id,
        weekDeadline: chain.arrivalHome?.toISOString() || new Date().toISOString(),
        outboundLoad: chain.outboundLoad,
        returnLoad: chain.returnLoad,
        chainSummary: {
          totalMiles: chain.totalMiles,
          totalRevenue: chain.totalRevenue,
          revenuePerTotalMile: chain.revenuePerTotalMile,
          departureTime: chain.departureTime,
          arrivalHome: chain.arrivalHome,
          returnPickupTime: chain.returnPickupTime,
          legs: chain.legs,
        },
      });
      setActivePlan(saved);
      setSelectedChainIndex(index);
    } catch (err) {
      setError('Failed to save plan: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleMarkComplete = async () => {
    if (!activePlan) return;
    setCompleting(true);
    try {
      await db.workWeekPlans.updateStatus(activePlan.id, 'completed');
      setActivePlan(null);
      setSelectedChainIndex(null);
    } catch (err) {
      setError('Failed to update plan: ' + (err.message || 'Unknown error'));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.card,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HamburgerMenu currentView="work-week-planning" onNavigate={onMenuNavigate} />
          <HaulMonitorLogo size={28} />
        </div>
        <AvatarMenu onNavigateToSettings={() => onMenuNavigate('settings')} />
      </div>

      {/* Content */}
      <div style={{ padding: '24px 16px', maxWidth: '680px', margin: '0 auto' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Calendar size={24} color={colors.accent.primary} />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: colors.text.primary, margin: 0 }}>
            Work Week Planning
          </h1>
        </div>
        <p style={{ fontSize: '14px', color: colors.text.secondary, marginBottom: '24px', marginTop: '4px' }}>
          Find the best return load first, then build your week forward from that anchor.
        </p>

        {/* Active plan banner */}
        {!loadingPlan && activePlan && (
          <ActivePlanBanner plan={activePlan} colors={colors} onMarkComplete={handleMarkComplete} completing={completing} />
        )}

        {/* Setup form */}
        {loadingFleets ? (
          <div style={{ color: colors.text.secondary, fontSize: '13px' }}>Loading fleets…</div>
        ) : fleets.length === 0 ? (
          <div style={{ background: colors.background.card, border: `1px solid ${colors.border.secondary}`, borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
            <p style={{ color: colors.text.secondary, fontSize: '13px' }}>
              No fleets found. Go to <strong>Fleets</strong> to add your first fleet.
            </p>
          </div>
        ) : (
          <SetupForm fleets={fleets} colors={colors} onRun={handleRun} loading={running} error={error} />
        )}

        {noCredits && (
          <div style={{ marginTop: '16px', padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '13px', color: '#991b1b' }}>
              <strong>Insufficient credits.</strong> Work Week Planning costs 5 credits per run. Purchase more to continue.
            </div>
            <button onClick={() => setNoCredits(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', padding: '2px' }}>✕</button>
          </div>
        )}

        {/* Results */}
        {planResult && (
          <div style={{ marginTop: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: colors.text.primary, margin: 0 }}>
                {planResult.chains.length > 0
                  ? `${planResult.chains.length} week plan${planResult.chains.length !== 1 ? 's' : ''} found`
                  : 'No complete plans found'}
              </h2>
              <span style={{ fontSize: '11px', color: colors.text.secondary }}>
                {planResult.meta.totalLoadsSearched.toLocaleString()} loads searched
              </span>
            </div>

            {planResult.chains.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {planResult.chains.map((chain, i) => (
                  <ChainCard
                    key={i}
                    chain={chain}
                    rank={i + 1}
                    fleetHomeName={fleetHomeName}
                    colors={colors}
                    onSelect={(c) => handleSelectPlan(c, i)}
                    isSelected={selectedChainIndex === i}
                    saving={savingPlanId === i}
                  />
                ))}
              </div>
            )}

            {planResult.chains.length === 0 && (
              <div style={{ background: colors.background.card, border: `1px solid ${colors.border.secondary}`, borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertCircle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary, marginBottom: '4px' }}>
                      No 2-load chains matched your deadline and mile budget
                    </div>
                    <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                      {planResult.meta.returnCandidatesFound === 0
                        ? 'No loads with deliveries near your home base were found. Try again later as new loads are posted.'
                        : planResult.meta.outboundCandidatesFound === 0
                        ? 'Found return loads but no outbound loads starting near home.'
                        : 'Return loads were found but no viable pairings fit the weekly mile budget and deadline.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {planResult.returnOnlyOptions.length > 0 && (
              <div style={{ marginTop: planResult.chains.length > 0 ? '28px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <TrendingUp size={14} color={colors.text.secondary} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary }}>
                    Best return loads (single leg)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {planResult.returnOnlyOptions.map((opt, i) => (
                    <ReturnOnlyCard key={i} option={opt} colors={colors} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
