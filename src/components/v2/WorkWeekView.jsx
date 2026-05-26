import { useState, useEffect } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getLoadsForMatching } from '../../utils/getLoadsForMatching';
import { planWorkWeek, PLAN_DEFAULTS } from '../../utils/weeklyPlanningAlgorithm';
import { Calendar, TrendingUp, AlertCircle, Clock, ChevronRight } from '../../icons';

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

// Parse city and state from home_address ("City, ST" or "Street, City, ST")
const parseHomeAddress = (fleet) => {
  const parts = (fleet.home_address || '').split(',').map(s => s.trim()).filter(Boolean);
  const state = parts.length >= 1 ? parts[parts.length - 1].slice(0, 2).toUpperCase() : '';
  const city  = parts.length >= 2 ? parts[parts.length - 2] : '';
  return { city, state };
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
        {/* Optimal zone shading */}
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

// ─── Leg row ─────────────────────────────────────────────────────────────────

function LegRow({ label, from, to, miles, revenue, type }) {
  const isDeadhead = type === 'deadhead';
  const isHome = type === 'home';
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%', marginTop: '3px',
          background: isHome ? t.colors.accent.blue : isDeadhead ? '#cbd5e0' : t.colors.accent.green,
          border: `2px solid ${isHome ? t.colors.accent.blue : isDeadhead ? '#94a3b8' : t.colors.accent.green}`,
        }} />
        {!isHome && <div style={{ width: '2px', flex: 1, minHeight: '20px', background: '#e2e8f0', margin: '3px 0' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isHome ? 0 : '10px' }}>
        <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.medium, color: t.colors.text.primary }}>
          {from}
        </div>
        {!isHome && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '2px', alignItems: 'center' }}>
            <span style={{
              fontSize: t.font.size.xs,
              color: isDeadhead ? t.colors.text.muted : t.colors.text.secondary,
              fontStyle: isDeadhead ? 'italic' : 'normal',
            }}>
              {isDeadhead ? `${fmtMiles(miles)} deadhead` : `${fmtMiles(miles)} loaded`}
            </span>
            {revenue != null && !isDeadhead && (
              <span style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.accent.green }}>
                {fmt$(revenue)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chain card ───────────────────────────────────────────────────────────────

function ChainCard({ chain, rank, fleetHomeName }) {
  const { outboundLoad, returnLoad, legs, totalMiles, totalRevenue, revenuePerTotalMile,
          departureTime, returnPickupTime, arrivalHome, withinOptimalBand } = chain;

  const rpmColor = revenuePerTotalMile >= 3 ? t.colors.accent.green
    : revenuePerTotalMile >= 2 ? t.colors.accent.amber
    : t.colors.accent.red;

  return (
    <Card style={{ overflow: 'hidden' }}>
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

      {/* Legs */}
      <div style={{ padding: '16px 18px' }}>
        <LegRow
          type="home"
          from={fleetHomeName || 'Home Base'}
        />
        {legs.homeToPickup > 0 && (
          <LegRow
            type="deadhead"
            from={`${outboundLoad.pickup_city}, ${outboundLoad.pickup_state}`}
            miles={legs.homeToPickup}
          />
        )}
        <LegRow
          type="loaded"
          from={`${outboundLoad.pickup_city}, ${outboundLoad.pickup_state}`}
          to={`${outboundLoad.delivery_city}, ${outboundLoad.delivery_state}`}
          miles={legs.outboundLoaded}
          revenue={Number(outboundLoad.total_revenue)}
        />
        {legs.deadhead > 0 && (
          <LegRow
            type="deadhead"
            from={`${returnLoad.pickup_city}, ${returnLoad.pickup_state}`}
            miles={legs.deadhead}
          />
        )}
        <LegRow
          type="loaded"
          from={`${returnLoad.pickup_city}, ${returnLoad.pickup_state}`}
          to={`${returnLoad.delivery_city}, ${returnLoad.delivery_state}`}
          miles={legs.returnLoaded}
          revenue={Number(returnLoad.total_revenue)}
        />
        {legs.returnToHome > 0 && (
          <LegRow
            type="deadhead"
            from={fleetHomeName || 'Home Base'}
            miles={legs.returnToHome}
          />
        )}
        <LegRow
          type="home"
          from={fleetHomeName || 'Home Base'}
        />

        {/* Return pickup time callout */}
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
      <div style={{ padding: '0 18px 16px' }}>
        <StringBar totalMiles={totalMiles} />
      </div>
    </Card>
  );
}

// ─── Return-only card ─────────────────────────────────────────────────────────

function ReturnOnlyCard({ option }) {
  const { load, pickupToDeliveryMiles, deliveryToHomeMiles, totalMiles, revenue, revenuePerMile } = option;
  return (
    <div style={{
      padding: '12px 16px',
      border: `1px solid ${t.colors.page.cardBorder}`,
      borderRadius: t.radius.xl,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
          {load.pickup_city}, {load.pickup_state} → {load.delivery_city}, {load.delivery_state}
        </div>
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>
          {fmtMiles(pickupToDeliveryMiles)} loaded · {fmtMiles(deliveryToHomeMiles)} to home
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.accent.green }}>
          {fmt$(revenue)}
        </div>
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
          {revenuePerMile.toFixed(2)}/mi · {fmtMiles(totalMiles)} total
        </div>
      </div>
    </div>
  );
}

// ─── Setup form ───────────────────────────────────────────────────────────────

function SetupForm({ fleets, onRun, loading, error }) {
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
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {selectedFleet && !hasHome && (
            <div style={{ marginTop: '6px', fontSize: t.font.size.xs, color: t.colors.accent.red }}>
              Home base not geocoded. Go to Fleets → Profile to set the home address.
            </div>
          )}
          {selectedFleet && hasHome && (
            <div style={{ marginTop: '4px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
              Home: {selectedFleet.home_address}
            </div>
          )}
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
              </>
            )}
          </PrimaryBtn>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Card>
  );
}

// ─── Main WorkWeekView ────────────────────────────────────────────────────────

export function WorkWeekView() {
  const { user } = useAuth();
  const [fleets, setFleets] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(true);

  const [planResult, setPlanResult] = useState(null);
  const [fleetHomeName, setFleetHomeName] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    db.fleets.getAll(user.id)
      .then(f => setFleets(f || []))
      .finally(() => setLoadingFleets(false));
  }, [user]);

  const handleRun = async (fleet, deadline) => {
    setRunning(true);
    setError(null);
    setPlanResult(null);

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

      const { city: homeCity, state: homeState } = parseHomeAddress(fleet);

      const fleetHome = {
        lat: fleet.home_lat,
        lng: fleet.home_lng,
        city: homeCity,
        state: homeState,
      };
      setFleetHomeName(fleet.home_address || `${homeCity}, ${homeState}` || 'Home Base');

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
        pickupDate: '',
      };

      const { loads } = await getLoadsForMatching(user.id, fleet.id, requestContext);
      const result = await planWorkWeek({ fleetHome, fleetProfile, weekDeadline: deadline, loads, rateConfig });
      setPlanResult(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setRunning(false);
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
        <SetupForm fleets={fleets} onRun={handleRun} loading={running} error={error} />
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
                <ChainCard key={i} chain={chain} rank={i + 1} fleetHomeName={fleetHomeName} />
              ))}
            </div>
          )}

          {/* No full chains — explain why and show return-only */}
          {planResult.chains.length === 0 && (
            <Card style={{ padding: '24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertCircle size={20} color={t.colors.accent.amber} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '4px' }}>
                    No 2-load chains matched your deadline and mile budget
                  </div>
                  <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>
                    {planResult.meta.returnCandidatesFound === 0
                      ? 'No loads with deliveries near your home base were found. Try again later as new loads are posted.'
                      : planResult.meta.outboundCandidatesFound === 0
                      ? 'Found return loads but no outbound loads starting near home. Consider running again or checking back when outbound options are available.'
                      : 'Return loads were found but no viable outbound + return pairings fit within the weekly mile budget and deadline.'}
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
    </div>
  );
}
