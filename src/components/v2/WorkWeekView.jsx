import { useState, useEffect } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../hooks/useCredits';
import { getLoadsForMatching } from '../../utils/getLoadsForMatching';
import { planWorkWeek, PLAN_DEFAULTS } from '../../utils/weeklyPlanningAlgorithm';
import { Calendar, TrendingUp, AlertCircle, Clock, ChevronRight, CheckCircle } from '../../icons';
import { parseFleetHome } from '../../utils/parseFleetHome';
import { ChainRouteMap } from './ChainRouteMap';
import { PlanDetailModal } from './PlanDetailModal';

const t = tokens;

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

// ─── Deadline helpers ─────────────────────────────────────────────────────────

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

function PrimaryBtn({ children, onClick, disabled, loading, style = {} }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: (disabled || loading) ? '#e2e8f0' : hovered ? t.colors.accent.blueHover : t.colors.accent.blue,
        color: (disabled || loading) ? '#94a3b8' : '#fff',
        border: 'none',
        borderRadius: t.radius.lg,
        padding: '10px 20px',
        fontSize: t.font.size.sm,
        fontWeight: t.font.weight.semibold,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
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

// ─── Credit UI primitives ─────────────────────────────────────────────────────

const WWP_CREDIT_COST = 5;

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
      {WWP_CREDIT_COST} credits
    </span>
  );
}

function NoCreditsBanner({ onDismiss }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: t.radius.xl,
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: t.font.size.sm, color: '#991b1b' }}>
        <strong>Insufficient credits.</strong> Work Week Planning costs {WWP_CREDIT_COST} credits per run. Purchase more to continue.
      </div>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', padding: '2px', display: 'flex', alignItems: 'center' }}>
        ✕
      </button>
    </div>
  );
}

// ─── String bar ───────────────────────────────────────────────────────────────

function StringBar({ totalMiles }) {
  const maxMiles = PLAN_DEFAULTS.maxStringMiles; // 3000
  const pct = Math.min(100, (totalMiles / maxMiles) * 100);

  const color = totalMiles > maxMiles
    ? t.colors.accent.red
    : totalMiles >= PLAN_DEFAULTS.minStringMiles
    ? t.colors.accent.green
    : t.colors.accent.amber;

  const label = totalMiles > maxMiles ? 'Over budget'
    : totalMiles >= PLAN_DEFAULTS.minStringMiles && totalMiles <= PLAN_DEFAULTS.stringMiles ? 'Optimal'
    : totalMiles > PLAN_DEFAULTS.stringMiles ? 'Acceptable'
    : 'Under optimal';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>Weekly miles</span>
        <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color }}>
          {fmtMiles(totalMiles)} / {fmtMiles(maxMiles)} — {label}
        </span>
      </div>
      <div style={{ position: 'relative', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'visible' }}>
        <div style={{
          position: 'absolute',
          left: `${(PLAN_DEFAULTS.minStringMiles / maxMiles) * 100}%`,
          width: `${((PLAN_DEFAULTS.stringMiles - PLAN_DEFAULTS.minStringMiles) / maxMiles) * 100}%`,
          height: '100%',
          background: 'rgba(22,163,74,0.12)',
          borderRadius: '2px',
        }} />
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ position: 'relative', height: '14px', marginTop: '3px' }}>
        <span style={{ position: 'absolute', left: `${(PLAN_DEFAULTS.minStringMiles / maxMiles) * 100}%`, fontSize: '10px', color: t.colors.text.muted, transform: 'translateX(-50%)' }}>2k</span>
        <span style={{ position: 'absolute', left: `${(PLAN_DEFAULTS.stringMiles / maxMiles) * 100}%`, fontSize: '10px', color: t.colors.text.muted, transform: 'translateX(-50%)' }}>2.5k</span>
        <span style={{ position: 'absolute', right: 0, fontSize: '10px', color: t.colors.text.muted }}>3k</span>
      </div>
    </div>
  );
}

// ─── Radius bar ───────────────────────────────────────────────────────────────

function RadiusBar({ maxRadiusFromHome }) {
  const maxMiles = PLAN_DEFAULTS.maxRadiusFromHomeMiles; // 1000
  const pct = Math.min(100, (maxRadiusFromHome / maxMiles) * 100);

  const color = maxRadiusFromHome > maxMiles
    ? t.colors.accent.red
    : maxRadiusFromHome >= 700
    ? t.colors.accent.amber
    : t.colors.accent.green;

  const label = maxRadiusFromHome > maxMiles ? 'Over limit'
    : maxRadiusFromHome >= 700 ? 'Far reach'
    : 'Within range';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>Max radius from home</span>
        <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color }}>
          {fmtMiles(maxRadiusFromHome)} / {fmtMiles(maxMiles)} — {label}
        </span>
      </div>
      <div style={{ position: 'relative', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ position: 'relative', height: '14px', marginTop: '3px' }}>
        <span style={{ position: 'absolute', left: '70%', fontSize: '10px', color: t.colors.text.muted, transform: 'translateX(-50%)' }}>700</span>
        <span style={{ position: 'absolute', right: 0, fontSize: '10px', color: t.colors.text.muted }}>1k mi</span>
      </div>
    </div>
  );
}

// ─── Timeline primitives ─────────────────────────────────────────────────────

function Stop({ city, isHome }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: isHome ? '12px' : '10px',
        height: isHome ? '12px' : '10px',
        borderRadius: '50%', flexShrink: 0,
        background: isHome ? t.colors.accent.blue : '#fff',
        border: `2px solid ${isHome ? t.colors.accent.blue : t.colors.border.strong}`,
      }} />
      <span style={{
        fontSize: t.font.size.sm,
        fontWeight: isHome ? t.font.weight.semibold : t.font.weight.medium,
        color: t.colors.text.primary,
      }}>
        {city}
      </span>
    </div>
  );
}

function Connector({ miles, type, revenue }) {
  const isDeadhead = type === 'deadhead';
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
      <div style={{
        width: '2px', minHeight: '22px', margin: '2px 5px',
        background: isDeadhead ? '#cbd5e0' : t.colors.accent.green,
        flexShrink: 0,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
        <span style={{
          fontSize: t.font.size.xs,
          color: isDeadhead ? t.colors.text.muted : t.colors.text.secondary,
          fontStyle: isDeadhead ? 'italic' : 'normal',
        }}>
          {fmtMiles(miles)} {isDeadhead ? 'deadhead' : 'loaded'}
        </span>
        {revenue != null && !isDeadhead && (
          <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.accent.green }}>
            {fmt$(revenue)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Load mini card ───────────────────────────────────────────────────────────

function LoadMiniCard({ load, stepNumber, stepLabel, accentColor }) {
  const sourceLabel = getSourceLabel(load);
  const loadRef = load.df_load_number || load.source_load_id || load.load_id;

  return (
    <div style={{
      border: `1px solid ${accentColor}30`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: t.radius.lg,
      padding: '12px 14px',
      background: accentColor + '06',
    }}>
      {/* Step label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
        <span style={{
          fontSize: t.font.size.xs,
          fontWeight: t.font.weight.bold,
          color: accentColor,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          Step {stepNumber} — {stepLabel}
        </span>
        {load.source === 'truckstop' ? (
          <img src="/Waypoint%20Default.png" alt="Truckstop load" title="Truckstop load" style={{ height: '18px', display: 'block', opacity: 0.9 }} />
        ) : sourceLabel ? (
          <span style={{
            fontSize: '10px',
            fontWeight: t.font.weight.semibold,
            color: t.colors.text.muted,
            background: '#f1f5f9',
            borderRadius: t.radius.full,
            padding: '2px 8px',
          }}>
            {sourceLabel}
          </span>
        ) : null}
      </div>

      {/* Route */}
      <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '6px' }}>
        {load.pickup_city}, {load.pickup_state} → {load.delivery_city}, {load.delivery_state}
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
        {load.equipment_type && (
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
            {load.equipment_type}
          </span>
        )}
        {load.weight_lbs && (
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
            {Number(load.weight_lbs).toLocaleString()} lbs
          </span>
        )}
        {load.distance_miles && (
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
            {Math.round(load.distance_miles)} mi
          </span>
        )}
        {load.company_name && (
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
            {load.company_name}
          </span>
        )}
      </div>

      {/* Revenue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: t.colors.accent.green }}>
          {fmt$(Number(load.total_revenue))}
        </span>
        {loadRef && (
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>#{loadRef}</span>
        )}
      </div>

      {/* Broker / contact */}
      {(load.broker || load.company_name || load.shipper) && (
        <div style={{ marginTop: '8px', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
          <strong style={{ color: t.colors.text.primary }}>Broker:</strong>{' '}
          {load.broker || load.company_name || load.shipper || '—'}
          {load.shipper && load.broker && load.shipper !== load.broker && (
            <span style={{ marginLeft: '8px' }}>
              <strong style={{ color: t.colors.text.primary }}>Shipper:</strong> {load.shipper}
            </span>
          )}
        </div>
      )}
      {(load.contactPhone || load.contact_phone) && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, fontWeight: t.font.weight.semibold }}>Contact:</span>
          <a href={`tel:${load.contactPhone || load.contact_phone}`} style={{ fontSize: t.font.size.xs, color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 8px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md }}>Call</a>
          <a href={`sms:${load.contactPhone || load.contact_phone}`} style={{ fontSize: t.font.size.xs, color: t.colors.accent.blue, fontWeight: t.font.weight.bold, textDecoration: 'none', padding: '2px 8px', border: `1px solid ${t.colors.accent.blue}`, borderRadius: t.radius.md }}>Text</a>
          <span style={{ fontSize: t.font.size.xs, color: t.colors.text.secondary }}>{load.contactPhone || load.contact_phone}</span>
        </div>
      )}
    </div>
  );
}

// ─── Chain card ───────────────────────────────────────────────────────────────

function ChainCard({ chain, rank, fleetHome, fleetHomeName, onSelect, onViewDetails, isSelected, saving }) {
  const { outboundLoad, connectorLoad, returnLoad, legs, totalMiles, totalRevenue, revenuePerTotalMile,
          departureTime, returnPickupTime, arrivalHome, maxRadiusFromHome, is3Load } = chain;

  const rpmColor = revenuePerTotalMile >= 3 ? t.colors.accent.green
    : revenuePerTotalMile >= 2 ? t.colors.accent.amber
    : t.colors.accent.red;

  return (
    <Card style={{ overflow: 'hidden' }}>
      {/* Route map */}
      {fleetHome && (
        <ChainRouteMap
          chain={chain}
          fleetHome={fleetHome}
          height={rank === 1 ? 200 : 150}
          eager={rank === 1}
        />
      )}

      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${t.colors.page.cardBorder}`,
        background: rank === 1 ? t.colors.accent.blueLight : undefined,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {rank === 1 && (
            <span style={{
              fontSize: t.font.size.xs, fontWeight: t.font.weight.bold,
              color: t.colors.accent.blue,
              background: '#dbeafe', borderRadius: t.radius.full,
              padding: '2px 8px',
            }}>
              Best Match
            </span>
          )}
          <span style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>
            Departs {fmtDateTime(departureTime)}
          </span>
          <ChevronRight size={14} color={t.colors.text.muted} />
          <span style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>
            Home by {fmtDateTime(arrivalHome)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.bold, color: rpmColor }}>
            {revenuePerTotalMile.toFixed(2)}/mi
          </span>
          <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
            {fmt$(totalRevenue)}
          </span>
        </div>
      </div>

      {/* Load cards — booking order: return first (anchor), connector, outbound */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <LoadMiniCard
          load={returnLoad}
          stepNumber={1}
          stepLabel="Book this first (anchor load)"
          accentColor={t.colors.accent.blue}
        />
        {is3Load && connectorLoad && (
          <LoadMiniCard
            load={connectorLoad}
            stepNumber={2}
            stepLabel="Then book this connector"
            accentColor="#f59e0b"
          />
        )}
        <LoadMiniCard
          load={outboundLoad}
          stepNumber={is3Load ? 3 : 2}
          stepLabel={is3Load ? "Book this outbound last" : "Then book this outbound"}
          accentColor={t.colors.accent.green}
        />
      </div>

      {/* Timeline */}
      <div style={{ padding: '0 18px 4px' }}>
        <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
          Route
        </div>
        <Stop city={fleetHomeName || 'Home Base'} isHome />
        {legs.homeToPickup > 0 && <>
          <Connector miles={legs.homeToPickup} type="deadhead" />
          <Stop city={`${outboundLoad.pickup_city}, ${outboundLoad.pickup_state}`} />
        </>}
        <Connector miles={legs.outboundLoaded} type="loaded" revenue={Number(outboundLoad.total_revenue)} />
        <Stop city={`${outboundLoad.delivery_city}, ${outboundLoad.delivery_state}`} />
        {is3Load && connectorLoad ? <>
          {legs.deadhead1 > 0 && <Connector miles={legs.deadhead1} type="deadhead" />}
          <Stop city={`${connectorLoad.pickup_city}, ${connectorLoad.pickup_state}`} />
          <Connector miles={legs.connectorLoaded} type="loaded" revenue={Number(connectorLoad.total_revenue)} />
          <Stop city={`${connectorLoad.delivery_city}, ${connectorLoad.delivery_state}`} />
          {legs.deadhead2 > 0 && <Connector miles={legs.deadhead2} type="deadhead" />}
          <Stop city={`${returnLoad.pickup_city}, ${returnLoad.pickup_state}`} />
        </> : <>
          {legs.deadhead > 0 && <>
            <Connector miles={legs.deadhead} type="deadhead" />
            <Stop city={`${returnLoad.pickup_city}, ${returnLoad.pickup_state}`} />
          </>}
        </>}
        <Connector miles={legs.returnLoaded} type="loaded" revenue={Number(returnLoad.total_revenue)} />
        <Stop city={`${returnLoad.delivery_city}, ${returnLoad.delivery_state}`} />
        {legs.returnToHome > 0 && <Connector miles={legs.returnToHome} type="deadhead" />}
        <Stop city={fleetHomeName || 'Home Base'} isHome />

        <div style={{
          marginTop: '14px',
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: t.radius.lg,
          border: `1px solid ${t.colors.page.cardBorder}`,
          fontSize: t.font.size.xs,
          color: t.colors.text.muted,
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Clock size={12} color={t.colors.text.muted} />
          Pick up return load by {fmtDateTime(returnPickupTime)}
        </div>
      </div>

      {/* String bar */}
      <div style={{ padding: '14px 18px' }}>
        <StringBar totalMiles={totalMiles} />
        <div style={{ marginTop: '12px' }}>
          <RadiusBar maxRadiusFromHome={maxRadiusFromHome || 0} />
        </div>
      </div>

      {/* Select plan button */}
      <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${t.colors.page.cardBorder}`, paddingTop: '14px', marginTop: '4px' }}>
        {isSelected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: t.colors.accent.green, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold }}>
              <CheckCircle size={16} color={t.colors.accent.green} />
              This plan is active
            </div>
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                style={{ padding: '6px 14px', background: 'none', border: `1px solid ${t.colors.accent.green}60`, borderRadius: t.radius.md, color: t.colors.accent.green, fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, cursor: 'pointer' }}
              >
                View Details →
              </button>
            )}
          </div>
        ) : (
          <PrimaryBtn onClick={() => onSelect(chain)} loading={saving} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            {saving ? 'Saving…' : 'Select This Plan'}
          </PrimaryBtn>
        )}
      </div>
    </Card>
  );
}

// ─── Active plan banner ───────────────────────────────────────────────────────

function ActivePlanBanner({ plan, onViewDetails }) {
  const s = plan.chain_summary || {};
  const outbound = plan.outbound_load || {};
  const ret = plan.return_load || {};

  return (
    <div style={{
      background: `linear-gradient(135deg, ${t.colors.accent.green}18, ${t.colors.accent.green}08)`,
      border: `1px solid ${t.colors.accent.green}40`,
      borderRadius: t.radius['2xl'],
      padding: '18px 22px',
      marginBottom: '28px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.colors.accent.green, animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.accent.green, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active Plan
          </span>
        </div>
        <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '4px' }}>
          {(() => {
            const conn = s.connectorLoad;
            if (outbound.pickup_city && ret.delivery_city) {
              return conn?.delivery_city
                ? `${outbound.pickup_city} → ${outbound.delivery_city} → ${conn.delivery_city} → ${ret.delivery_city}`
                : `${outbound.pickup_city} → ${outbound.delivery_city} → ${ret.delivery_city}`;
            }
            return 'Work Week Plan In Progress';
          })()}
        </div>
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
          {s.totalRevenue != null && `${fmt$(s.totalRevenue)} · `}
          {s.totalMiles != null && `${fmtMiles(s.totalMiles)} · `}
          Home by {fmtDateTime(plan.week_deadline)}
        </div>
      </div>
      <button
        onClick={onViewDetails}
        style={{
          padding: '8px 16px',
          borderRadius: t.radius.lg,
          border: `1px solid ${t.colors.accent.green}60`,
          background: '#fff',
          color: t.colors.accent.green,
          fontSize: t.font.size.sm,
          fontWeight: t.font.weight.semibold,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        View Plan →
      </button>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ─── Return-only card ─────────────────────────────────────────────────────────

function ReturnOnlyCard({ option }) {
  const { load, pickupToDeliveryMiles, deliveryToHomeMiles, totalMiles, revenue, revenuePerMile } = option;
  const url = getLoadBoardUrl(load);
  const sourceLabel = getSourceLabel(load);

  return (
    <div style={{
      padding: '12px 16px',
      border: `1px solid ${t.colors.page.cardBorder}`,
      borderRadius: t.radius.xl,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
          {load.pickup_city}, {load.pickup_state} → {load.delivery_city}, {load.delivery_state}
        </div>
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>
          {fmtMiles(pickupToDeliveryMiles)} loaded · {fmtMiles(deliveryToHomeMiles)} to home
          {sourceLabel && ` · ${sourceLabel}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.accent.green }}>
            {fmt$(revenue)}
          </div>
          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
            {revenuePerMile.toFixed(2)}/mi · {fmtMiles(totalMiles)} total
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold,
              color: t.colors.accent.blue,
              textDecoration: 'none',
              padding: '4px 10px',
              border: `1px solid ${t.colors.accent.blue}40`,
              borderRadius: t.radius.lg,
              background: t.colors.accent.blueLight,
            }}
          >
            View ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Setup form ───────────────────────────────────────────────────────────────

function SetupForm({ fleets, onRun, loading, error, currentUserId }) {
  const defaultDeadline = getDefaultDeadline();
  const [selectedFleetId, setSelectedFleetId] = useState(fleets.length === 1 ? fleets[0].id : '');
  const [deadlineDate, setDeadlineDate] = useState(toDateInputValue(defaultDeadline));
  const [deadlineTime, setDeadlineTime] = useState(toTimeInputValue(defaultDeadline));

  const selectedFleet = fleets.find(f => f.id === selectedFleetId);
  const hasHome = selectedFleet?.home_lat && selectedFleet?.home_lng;

  const handleRun = () => {
    const [year, month, day] = deadlineDate.split('-').map(Number);
    const [hours, minutes] = deadlineTime.split(':').map(Number);
    const deadline = new Date(year, month - 1, day, hours, minutes, 0);
    onRun(selectedFleet, deadline);
  };

  const canRun = selectedFleetId && hasHome && deadlineDate && deadlineTime && !loading;

  return (
    <Card style={{ padding: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Fleet selector */}
        <div>
          <label style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
            Fleet
          </label>
          <select
            value={selectedFleetId}
            onChange={e => setSelectedFleetId(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              fontSize: t.font.size.base,
              border: `1px solid ${t.colors.border.default}`,
              borderRadius: t.radius.lg,
              background: '#fff',
              color: t.colors.text.primary,
              cursor: 'pointer',
            }}
          >
            {fleets.length !== 1 && <option value="">Select a fleet…</option>}
            {fleets.map(f => (
              <option key={f.id} value={f.id}>{f.name}{f.user_id !== currentUserId ? ' · shared' : ''}</option>
            ))}
          </select>
          {selectedFleet && !hasHome && (
            <div style={{ marginTop: '6px', fontSize: t.font.size.xs, color: t.colors.accent.red }}>
              Home base not geocoded. Go to Fleets → Profile to set the home address.
            </div>
          )}
          {selectedFleet && hasHome && (() => {
            const { city, state } = parseFleetHome(selectedFleet);
            return (
              <div style={{ marginTop: '4px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                Home: {city && state ? `${city}, ${state}` : selectedFleet.home_address}
              </div>
            );
          })()}
        </div>

        {/* Deadline */}
        <div>
          <label style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
            Must be home by
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="date"
              value={deadlineDate}
              onChange={e => setDeadlineDate(e.target.value)}
              style={{
                flex: 1,
                padding: '9px 12px',
                fontSize: t.font.size.base,
                border: `1px solid ${t.colors.border.default}`,
                borderRadius: t.radius.lg,
                color: t.colors.text.primary,
              }}
            />
            <input
              type="time"
              value={deadlineTime}
              onChange={e => setDeadlineTime(e.target.value)}
              style={{
                width: '120px',
                padding: '9px 12px',
                fontSize: t.font.size.base,
                border: `1px solid ${t.colors.border.default}`,
                borderRadius: t.radius.lg,
                color: t.colors.text.primary,
              }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', background: t.colors.accent.redLight, borderRadius: t.radius.lg, fontSize: t.font.size.sm, color: t.colors.accent.red }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            {error}
          </div>
        )}

        {/* Run button */}
        <div>
          <PrimaryBtn onClick={handleRun} disabled={!canRun} loading={loading} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            {loading ? (
              <>
                <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Finding optimal week…
              </>
            ) : (
              <>
                <Calendar size={15} />
                Run Week Plan
                <CreditBadge />
              </>
            )}
          </PrimaryBtn>
          <div style={{ textAlign: 'center', marginTop: '8px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
            {WWP_CREDIT_COST} credits per run
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Card>
  );
}

// ─── Main WorkWeekView ────────────────────────────────────────────────────────

export function WorkWeekView() {
  const { user } = useAuth();
  const { deductCredit } = useCredits();
  const [fleets, setFleets] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(true);
  const [activePlan, setActivePlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  const [planResult, setPlanResult] = useState(null);
  const [currentFleet, setCurrentFleet] = useState(null);
  const [currentFleetHome, setCurrentFleetHome] = useState(null);
  const [fleetHomeName, setFleetHomeName] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [noCredits, setNoCredits] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState(null); // chain index being saved
  const [completing, setCompleting] = useState(false);
  const [selectedChainIndex, setSelectedChainIndex] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

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

      const fleetHome = {
        lat: fleet.home_lat,
        lng: fleet.home_lng,
        city: homeCity,
        state: homeState,
      };
      setFleetHomeName((homeCity && homeState) ? `${homeCity}, ${homeState}` : fleet.home_address || 'Home Base');
      setCurrentFleetHome(fleetHome);

      const requestContext = {
        datumCity: homeCity,
        datumState: homeState,
        datumLat: fleet.home_lat,
        datumLng: fleet.home_lng,
        homeCity,
        homeState,
        homeLat: fleet.home_lat,
        homeLng: fleet.home_lng,
        equipmentType: fleetProfile.trailerType || 'Dry Van',
        modes: Array.isArray(rawProfile?.modes) ? rawProfile.modes : [],
        pickupDate: '',
      };

      const [creditResult, loadsResult] = await Promise.all([
        deductCredit('Work week plan', WWP_CREDIT_COST).catch(err => ({ success: false, error: err.message })),
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
    if (!user || !currentFleet || !planResult) return;
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
    <div style={{ padding: '32px 24px', maxWidth: '720px', margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Calendar size={28} color={t.colors.accent.blue} />
        <h1 style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.bold, color: t.colors.text.primary, margin: 0 }}>
          Work Week Planning
        </h1>
      </div>
      <p style={{ fontSize: t.font.size.base, color: t.colors.text.muted, marginBottom: '28px', marginTop: '4px' }}>
        Find the best return load first, then build your week forward from that anchor.
      </p>

      {/* Active plan banner */}
      {!loadingPlan && activePlan && (
        <ActivePlanBanner plan={activePlan} onViewDetails={() => setShowPlanModal(true)} />
      )}

      {/* Setup form */}
      {loadingFleets ? (
        <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>Loading fleets…</div>
      ) : fleets.length === 0 ? (
        <Card style={{ padding: '32px', textAlign: 'center' }}>
          <p style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>
            No fleets found. Go to <strong>Fleets</strong> to add your first fleet.
          </p>
        </Card>
      ) : (
        <SetupForm fleets={fleets} onRun={handleRun} loading={running} error={error} currentUserId={user?.id} />
      )}

      {noCredits && (
        <div style={{ marginTop: '16px' }}>
          <NoCreditsBanner onDismiss={() => setNoCredits(false)} />
        </div>
      )}

      {/* Results */}
      {planResult && (
        <div style={{ marginTop: '32px' }}>
          {/* Meta summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, margin: 0 }}>
              {planResult.chains.length > 0
                ? `${planResult.chains.length} week plan${planResult.chains.length !== 1 ? 's' : ''} found`
                : 'No complete plans found'}
            </h2>
            <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
              {planResult.meta.totalLoadsSearched.toLocaleString()} loads searched
            </span>
          </div>

          {/* Chain cards */}
          {planResult.chains.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {planResult.chains.map((chain, i) => (
                <ChainCard
                  key={i}
                  chain={chain}
                  rank={i + 1}
                  fleetHome={currentFleetHome}
                  fleetHomeName={fleetHomeName}
                  onSelect={(c) => handleSelectPlan(c, i)}
                  onViewDetails={selectedChainIndex === i ? () => setShowPlanModal(true) : undefined}
                  isSelected={selectedChainIndex === i}
                  saving={savingPlanId === i}
                />
              ))}
            </div>
          )}

          {/* No full chains — explain and show return-only */}
          {planResult.chains.length === 0 && (
            <Card style={{ padding: '24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertCircle size={20} color={t.colors.accent.amber} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '4px' }}>
                    No plans found for this deadline and mile budget
                  </div>
                  <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>
                    {planResult.meta.returnCandidatesFound === 0
                      ? 'No loads with deliveries near your home base were found. Try again later as new loads are posted.'
                      : planResult.meta.outboundCandidatesFound === 0
                      ? 'Found return loads but no outbound loads starting near home. Try again later or extend your deadline.'
                      : `Found ${planResult.meta.returnCandidatesFound} return and ${planResult.meta.outboundCandidatesFound} outbound candidates but no 2- or 3-load combinations fit the budget. Try extending your deadline or check back as new loads are posted.`}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Return-only options */}
          {planResult.returnOnlyOptions.length > 0 && (
            <div style={{ marginTop: planResult.chains.length > 0 ? '32px' : '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <TrendingUp size={16} color={t.colors.text.muted} />
                <span style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.secondary }}>
                  Best return loads (single leg)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {planResult.returnOnlyOptions.map((opt, i) => (
                  <ReturnOnlyCard key={i} option={opt} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showPlanModal && activePlan && (
        <PlanDetailModal
          plan={activePlan}
          onClose={() => setShowPlanModal(false)}
          onPlanUpdated={(updated) => {
            setActivePlan(updated.status === 'completed' ? null : updated);
            if (updated.status === 'completed') setShowPlanModal(false);
          }}
        />
      )}
    </div>
  );
}
