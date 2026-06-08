import { useState, useEffect, useMemo } from 'react';
import { Shield, BarChart2, FileText, DollarSign, TrendingUp } from '../icons';
import { useAuth } from '../contexts/AuthContext';
import { useMobile } from '../hooks/useMobile';
import { tokens } from '../styles/tokens.v2';

const t = tokens;

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div style={{
    background: t.colors.page.cardBg,
    border: `1px solid ${t.colors.page.cardBorder}`,
    borderRadius: t.radius.xl,
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    boxShadow: t.shadow.card,
  }}>
    <div style={{
      width: '44px', height: '44px', borderRadius: t.radius.lg,
      background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: '24px', fontWeight: t.font.weight.bold, color: t.colors.text.primary, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>{sub}</div>}
    </div>
  </div>
);

const SectionHeader = ({ title }) => (
  <div style={{
    fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.text.muted,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: '12px', marginTop: '32px',
  }}>
    {title}
  </div>
);

// minWidth makes wide tables horizontally swipeable on mobile instead of clipping columns (#115)
const Table = ({ headers, rows, minWidth }) => (
  <div style={{
    background: t.colors.page.cardBg,
    border: `1px solid ${t.colors.page.cardBorder}`,
    borderRadius: t.radius.xl, overflow: 'hidden',
    boxShadow: t.shadow.card,
  }}>
    <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.font.size.sm, ...(minWidth ? { minWidth } : {}) }}>
      <thead>
        <tr style={{ background: t.colors.accent.blueLight }}>
          {headers.map((h, i) => (
            <th key={i} style={{
              padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right',
              fontWeight: t.font.weight.bold, fontSize: t.font.size.xs, color: t.colors.text.muted,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: `1px solid ${t.colors.page.cardBorder}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ borderBottom: ri < rows.length - 1 ? `1px solid ${t.colors.page.cardBorder}` : 'none' }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{
                padding: '11px 16px', color: t.colors.text.primary,
                textAlign: ci === 0 ? 'left' : 'right',
              }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  </div>
);

function getBillingTier(billingStartDate) {
  if (!billingStartDate) return null;
  const start = new Date(billingStartDate);
  const now = new Date();
  const monthsElapsed =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth());
  if (monthsElapsed < 3) return { perLoad: 0.10, minimum: 0, tier: '1–3' };
  if (monthsElapsed < 6) return { perLoad: 0.10, minimum: 250, tier: '4–6' };
  return { perLoad: 0.10, minimum: 500, tier: '7+' };
}

// Default fixed monthly infra costs (USD) — editable in the admin dash, stored under
// admin_settings key `infra_costs`. PC*MILER/Trimble is variable and computed separately.
const DEFAULT_INFRA_COSTS = { github: 4, vercel: 20, supabase: 25, twilio: 0, resend: 0, address: 0, llc: 0, other: 0 };
const INFRA_LINE_ITEMS = [
  { key: 'github', label: 'GitHub Pro' }, // #124
  { key: 'vercel', label: 'Vercel Pro' },
  { key: 'supabase', label: 'Supabase Pro' },
  { key: 'twilio', label: 'Twilio (SMS)' },
  { key: 'resend', label: 'Resend (email)' },
  { key: 'address', label: 'Virtual Address' },
  { key: 'llc', label: 'LLC Renewal' },
  { key: 'other', label: 'Other' },
];

// Trailing-N calendar-month keys (['YYYY-MM', …]) ending with the current month, ascending.
function lastMonthKeys(n) {
  const now = new Date();
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// Trimble/PC*MILER cost for a given month, mirroring getBillingTier's per-load rate and
// tier minimums but evaluated as-of that month. Months before the billing start (or with no
// start set — i.e. pre-contract / trial key) cost $0.
function trimbleCostForMonth(billingStart, monthKey, billableCount) {
  if (!billingStart) return 0;
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(billingStart);
  const monthsElapsed = (y - start.getUTCFullYear()) * 12 + (m - 1 - start.getUTCMonth());
  if (monthsElapsed < 0) return 0; // before contract start
  const minimum = monthsElapsed < 3 ? 0 : monthsElapsed < 6 ? 250 : 500;
  return Math.max(billableCount * 0.10, minimum);
}

const fmtUSD = (n, dec = 0) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

// #131: projected revenue rate for the Org Activity credit-usage estimate. Pricing is
// tiered ($2.00 → $1.33 / credit by pack size); we anchor on the 10-pack starter rate
// and label it an estimate. Bump if pilot pricing changes.
const EST_CREDIT_PRICE = 2.00;
const fmtCredits = (n) => Number(n || 0).toLocaleString('en-US');

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const AdminDashboard = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { session } = useAuth();
  const isMobile = useMobile();

  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);               // #49/#50: all users incl. org-less
  const [activity, setActivity] = useState([]);         // #85: per-org activity & revenue rollups
  const [userActionPending, setUserActionPending] = useState(null);
  const [roleChanging, setRoleChanging] = useState(null);
  const [pilotToggling, setPilotToggling] = useState(null);
  const [pilotDates, setPilotDates] = useState({}); // { [orgId]: { start, end } }
  const [datesSaving, setDatesSaving] = useState(null);
  const [debugSettings, setDebugSettings] = useState({ dat_debug_email: false });
  const [debugSaving, setDebugSaving] = useState(false);
  const [trimbleLoads, setTrimbleLoads] = useState(null);
  const [trimbleBillingStart, setTrimbleBillingStart] = useState('');
  const [trimbleBillingStartInput, setTrimbleBillingStartInput] = useState('');
  const [trimbleBillingStartSaving, setTrimbleBillingStartSaving] = useState(false);

  // ── Net Revenue & Trend (P&L) ──
  const [pnlLoading, setPnlLoading] = useState(true);
  const [revenueMonths, setRevenueMonths] = useState(null);   // [{ month, netCents, grossCents, feeCents }]
  const [trimbleHistory, setTrimbleHistory] = useState({});   // { 'YYYY-MM': billableCount }
  const [infraCosts, setInfraCosts] = useState(DEFAULT_INFRA_COSTS);
  const [infraInput, setInfraInput] = useState(DEFAULT_INFRA_COSTS);
  const [infraSaving, setInfraSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchOrgs(), fetchUsers(), fetchActivity(), fetchDebugSettings(), fetchTrimbleActuals(), fetchTrimbleBillingStart()]).finally(() => setLoading(false));
    Promise.all([fetchRevenue(), fetchTrimbleHistory(), fetchInfraCosts()]).finally(() => setPnlLoading(false));
  }, []);

  const fetchOrgs = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/all', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setOrgs(data.orgs || []);
      const dates = {};
      for (const org of data.orgs || []) {
        dates[org.id] = { start: org.pilot_start_date || '', end: org.pilot_end_date || '' };
      }
      setPilotDates(dates);
    } catch {
      // Non-critical
    }
  };

  const fetchUsers = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/users', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      // Non-critical
    }
  };

  // #85: per-org/per-user activity & revenue rollups
  const fetchActivity = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/activity', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setActivity(data.orgs || []);
    } catch {
      // Non-critical
    }
  };

  // #49: ban / unban / delete a user.
  const handleUserAction = async (u, op) => {
    if (!session?.access_token) return;
    const verb = op === 'delete' ? 'delete' : op;
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${u.email}?${op === 'delete' ? ' This permanently removes the account.' : ''}`)) return;
    setUserActionPending(u.id);
    try {
      const res = await fetch('/api/orgs/user-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: u.id, op }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'Action failed'); return; }
      await fetchUsers();
    } catch (e) {
      alert('Action failed');
    } finally {
      setUserActionPending(null);
    }
  };

  const handleRoleChange = async (userId, orgId, newRole) => {
    if (!session?.access_token) return;
    setRoleChanging(userId);
    try {
      const res = await fetch('/api/orgs/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ user_id: userId, org_id: orgId, role: newRole })
      });
      if (res.ok) await fetchOrgs();
    } catch {
      // Non-critical
    } finally {
      setRoleChanging(null);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const handlePilotToggle = async (orgId, currentValue) => {
    if (!session?.access_token) return;
    const enabling = !currentValue;
    setPilotToggling(orgId);
    // Default start date to today when enabling
    if (enabling) {
      setPilotDates(prev => ({ ...prev, [orgId]: { start: prev[orgId]?.start || today, end: prev[orgId]?.end || '' } }));
    }
    try {
      const dates = pilotDates[orgId] || {};
      const res = await fetch('/api/orgs/pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          org_id: orgId,
          is_pilot: enabling,
          pilot_start_date: enabling ? (dates.start || today) : null,
          pilot_end_date:   enabling ? (dates.end   || null) : null,
        })
      });
      if (res.ok) await fetchOrgs();
    } catch {
      // Non-critical
    } finally {
      setPilotToggling(null);
    }
  };

  const handleSavePilotDates = async (orgId) => {
    if (!session?.access_token) return;
    setDatesSaving(orgId);
    const dates = pilotDates[orgId] || {};
    try {
      await fetch('/api/orgs/pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          org_id: orgId,
          is_pilot: true,
          pilot_start_date: dates.start || null,
          pilot_end_date:   dates.end   || null,
        })
      });
      await fetchOrgs();
    } catch {
      // Non-critical
    } finally {
      setDatesSaving(null);
    }
  };

  const fetchTrimbleActuals = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/trimble-actuals', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setTrimbleLoads(data);
    } catch {
      // Non-critical
    }
  };

  const fetchTrimbleBillingStart = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/admin-settings', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const setting = (data.settings || []).find(s => s.key === 'trimble_billing_start');
      const date = setting?.value?.date || '';
      setTrimbleBillingStart(date);
      setTrimbleBillingStartInput(date);
    } catch {
      // Non-critical
    }
  };

  const saveTrimbleBillingStart = async () => {
    if (!session?.access_token) return;
    setTrimbleBillingStartSaving(true);
    try {
      const res = await fetch('/api/orgs/admin-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ key: 'trimble_billing_start', value: { date: trimbleBillingStartInput } }),
      });
      if (res.ok) setTrimbleBillingStart(trimbleBillingStartInput);
    } catch {
      // Non-critical
    } finally {
      setTrimbleBillingStartSaving(false);
    }
  };

  // ── P&L data ──
  const fetchRevenue = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/stripe?action=revenue', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setRevenueMonths(data.months || []);
    } catch {
      // Non-critical
    }
  };

  // 6 monthly trimble-actuals queries → billable load count per month.
  const fetchTrimbleHistory = async () => {
    if (!session?.access_token) return;
    const keys = lastMonthKeys(6);
    try {
      const results = await Promise.all(keys.map(async (key) => {
        const res = await fetch(`/api/orgs/trimble-actuals?month=${key}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) return [key, 0];
        const data = await res.json();
        const count = data?.loads
          ? data.loads.filter(l => !l.excluded_from_billing).length
          : (data?.count ?? 0);
        return [key, count];
      }));
      setTrimbleHistory(Object.fromEntries(results));
    } catch {
      // Non-critical
    }
  };

  const fetchInfraCosts = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/admin-settings', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const setting = (data.settings || []).find(s => s.key === 'infra_costs');
      if (setting?.value) {
        const merged = { ...DEFAULT_INFRA_COSTS, ...setting.value };
        setInfraCosts(merged);
        setInfraInput(merged);
      }
    } catch {
      // Non-critical
    }
  };

  const saveInfraCosts = async () => {
    if (!session?.access_token) return;
    setInfraSaving(true);
    try {
      // Coerce inputs to numbers
      const clean = {};
      for (const { key } of INFRA_LINE_ITEMS) clean[key] = Number(infraInput[key]) || 0;
      const res = await fetch('/api/orgs/admin-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ key: 'infra_costs', value: clean }),
      });
      if (res.ok) { setInfraCosts(clean); setInfraInput(clean); }
    } catch {
      // Non-critical
    } finally {
      setInfraSaving(false);
    }
  };

  const fetchDebugSettings = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/orgs/admin-settings', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      (data.settings || []).forEach(s => { map[s.key] = s.value; });
      setDebugSettings({
        dat_debug_email: map.dat_debug_email?.enabled ?? false,
      });
    } catch {
      // Non-critical
    }
  };

  const toggleDebugSetting = async (key, currentValue) => {
    if (!session?.access_token) return;
    setDebugSaving(true);
    try {
      const res = await fetch('/api/orgs/admin-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ key, value: { enabled: !currentValue } })
      });
      if (res.ok) {
        setDebugSettings(prev => ({ ...prev, [key]: !currentValue }));
      }
    } catch {
      // Non-critical
    } finally {
      setDebugSaving(false);
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // #85: relative recency for the Org Activity panel — "just now", "3h ago", "12d ago".
  // Color-coding pairs with this: green <7d, amber 7–30d, red >30d / never.
  const fmtAgo = (iso) => {
    if (!iso) return 'never';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  const agoColor = (iso) => {
    if (!iso) return '#dc2626';
    const days = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (days < 7) return '#16a34a';
    if (days < 30) return '#d97706';
    return '#dc2626';
  };

  // Merge revenue (Stripe, net of fees) + variable Trimble cost + fixed infra into a
  // per-month P&L for the trailing 6 months.
  const pnl = useMemo(() => {
    const keys = lastMonthKeys(6);
    const revByMonth = {};
    (revenueMonths || []).forEach(m => { revByMonth[m.month] = (m.netCents || 0) / 100; });
    const fixedInfra = INFRA_LINE_ITEMS.reduce((sum, { key }) => sum + (Number(infraCosts[key]) || 0), 0);

    const months = keys.map(key => {
      const revenue = revByMonth[key] || 0;
      const trimble = trimbleCostForMonth(trimbleBillingStart, key, trimbleHistory[key] || 0);
      const cost = trimble + fixedInfra;
      return { month: key, revenue, trimble, infra: fixedInfra, cost, net: revenue - cost };
    });
    const current = months[months.length - 1] || { revenue: 0, trimble: 0, infra: fixedInfra, cost: fixedInfra, net: -fixedInfra };
    return { months, current, fixedInfra };
  }, [revenueMonths, trimbleHistory, infraCosts, trimbleBillingStart]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ color: t.colors.text.muted, fontFamily: t.font.family }}>Loading admin data...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', fontFamily: t.font.family, color: t.colors.text.primary }}>
        {/* Page title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={28} color={t.colors.accent.blue} />
            <div>
              <div style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.bold }}>Admin Dashboard</div>
              <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginTop: '2px' }}>
                System health &amp; data overview
              </div>
            </div>
          </div>
        </div>

        {/* ── NET REVENUE & TREND ── */}
        <SectionHeader title="Net Revenue & Trend" />
        {pnlLoading ? (
          <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm, marginBottom: '24px' }}>Loading financials…</div>
        ) : (() => {
          const max = Math.max(1, ...pnl.months.map(m => Math.max(m.revenue, m.cost)));
          const BAR_AREA = 150; // px
          const net = pnl.current.net;
          const infraDirty = INFRA_LINE_ITEMS.some(({ key }) => (Number(infraInput[key]) || 0) !== (Number(infraCosts[key]) || 0));
          return (
            <>
              {/* Current-month summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <StatCard label={`Revenue · ${monthLabel(pnl.current.month)}`} value={fmtUSD(pnl.current.revenue)} sub="net of Stripe fees" icon={DollarSign} color={t.colors.accent.green} />
                <StatCard label="Total Cost" value={fmtUSD(pnl.current.cost)} sub={`Trimble ${fmtUSD(pnl.current.trimble)} · Infra ${fmtUSD(pnl.current.infra)}`} icon={FileText} color={t.colors.accent.amber} />
                <StatCard label="Net" value={fmtUSD(net)} sub={net >= 0 ? 'profit' : 'loss'} icon={TrendingUp} color={net >= 0 ? t.colors.accent.green : t.colors.accent.red} />
              </div>

              {revenueMonths === null && (
                <div style={{ marginTop: '12px', fontSize: t.font.size.xs, color: t.colors.accent.amber }}>
                  Stripe revenue unavailable — showing $0 revenue. Check STRIPE_SECRET_KEY / admin access.
                </div>
              )}

              {/* 6-month trend */}
              <div style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, padding: '20px 24px', boxShadow: t.shadow.card, marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '18px' }}>
                  <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>Trailing 6 months</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: t.colors.accent.green }} /> Revenue</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: t.colors.accent.amber }} /> Cost</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: `${BAR_AREA}px` }}>
                  {pnl.months.map(m => (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                      <div style={{ fontSize: '11px', fontWeight: t.font.weight.bold, color: m.net >= 0 ? t.colors.accent.green : t.colors.accent.red, marginBottom: '4px' }}>{fmtUSD(m.net)}</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${BAR_AREA - 24}px` }}>
                        <div title={`Revenue ${fmtUSD(m.revenue)}`} style={{ width: '14px', height: `${Math.max(2, (m.revenue / max) * (BAR_AREA - 24))}px`, background: t.colors.accent.green, borderRadius: '3px 3px 0 0' }} />
                        <div title={`Cost ${fmtUSD(m.cost)}`} style={{ width: '14px', height: `${Math.max(2, (m.cost / max) * (BAR_AREA - 24))}px`, background: t.colors.accent.amber, borderRadius: '3px 3px 0 0' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  {pnl.months.map(m => (
                    <div key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: t.colors.text.muted }}>{monthLabel(m.month)}</div>
                  ))}
                </div>
              </div>

              {/* Breakdown table */}
              <div style={{ marginTop: '16px' }}>
                <Table
                  minWidth="480px"
                  headers={['Month', 'Revenue', 'Trimble', 'Infra', 'Net']}
                  rows={pnl.months.map(m => [
                    monthLabel(m.month),
                    fmtUSD(m.revenue),
                    fmtUSD(m.trimble),
                    fmtUSD(m.infra),
                    <span style={{ fontWeight: t.font.weight.bold, color: m.net >= 0 ? t.colors.accent.green : t.colors.accent.red }}>{fmtUSD(m.net)}</span>,
                  ])}
                />
              </div>

              {/* Editable fixed infra costs */}
              <div style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, padding: '18px 24px', boxShadow: t.shadow.card, marginTop: '16px' }}>
                <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '4px' }}>Fixed Monthly Infrastructure Costs</div>
                <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '16px' }}>
                  Applied to every month in the trend. PC*MILER / Trimble is variable and computed from actuals separately.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                  {INFRA_LINE_ITEMS.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={infraInput[key]}
                          onChange={e => setInfraInput(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: '80px', padding: '6px 10px', border: `1px solid ${t.colors.border.strong}`, borderRadius: t.radius.md, fontSize: t.font.size.sm, background: t.colors.page.bg, color: t.colors.text.primary }}
                        />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>Total / mo</label>
                    <div style={{ padding: '6px 10px', fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{fmtUSD(pnl.fixedInfra)}</div>
                  </div>
                  <button
                    onClick={saveInfraCosts}
                    disabled={infraSaving || !infraDirty}
                    style={{ padding: '7px 18px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.md, color: '#fff', fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, cursor: (infraSaving || !infraDirty) ? 'not-allowed' : 'pointer', opacity: (infraSaving || !infraDirty) ? 0.5 : 1 }}
                  >
                    {infraSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── ORGANIZATIONS ── */}
        {users.length > 0 && (
          <>
            <SectionHeader title={`Users (${users.length})`} />
            <div style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, overflow: 'hidden', boxShadow: t.shadow.card, marginBottom: '24px' }}>
              {users.map(u => {
                const Badge = ({ children, tone }) => (
                  <span style={{ fontSize: '10px', fontWeight: t.font.weight.bold, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 7px', borderRadius: t.radius.full,
                    color: tone === 'red' ? '#dc2626' : tone === 'amber' ? '#b45309' : tone === 'green' ? '#15803d' : t.colors.text.muted,
                    background: tone === 'red' ? '#fee2e2' : tone === 'amber' ? '#fef3c7' : tone === 'green' ? '#dcfce7' : t.colors.page.bg,
                    border: `1px solid ${tone === 'red' ? '#fecaca' : tone === 'amber' ? '#fcd34d' : tone === 'green' ? '#86efac' : t.colors.page.cardBorder}` }}>{children}</span>
                );
                const pending = userActionPending === u.id;
                const badges = (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {u.is_test_account && <Badge tone="green">E2E Test — do not delete</Badge>}
                    {u.banned && <Badge tone="red">Banned</Badge>}
                    {u.is_app_admin && <Badge>Admin</Badge>}
                    {u.org ? <Badge>{u.org}</Badge> : <Badge tone="amber">No org</Badge>}
                    {u.personal_domain && <Badge tone="amber">Personal email</Badge>}
                  </div>
                );
                const actions = !u.is_app_admin && !u.is_test_account && (
                  <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    {u.banned ? (
                      <button onClick={() => handleUserAction(u, 'unban')} disabled={pending} style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: t.radius.md, border: `1px solid ${t.colors.accent.green}`, background: 'transparent', color: t.colors.accent.green, cursor: pending ? 'not-allowed' : 'pointer' }}>Unban</button>
                    ) : (
                      <button onClick={() => handleUserAction(u, 'ban')} disabled={pending} style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: t.radius.md, border: `1px solid #fcd34d`, background: 'transparent', color: '#b45309', cursor: pending ? 'not-allowed' : 'pointer' }}>Ban</button>
                    )}
                    <button onClick={() => handleUserAction(u, 'delete')} disabled={pending} style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: t.radius.md, border: `1px solid #fecaca`, background: 'transparent', color: '#dc2626', cursor: pending ? 'not-allowed' : 'pointer' }}>Delete</button>
                  </div>
                );
                // Mobile: two predictable lines (name/email + signup date, then badges + actions)
                // instead of free-form flex wrap, which broke differently row to row (#115).
                if (isMobile) {
                  return (
                    <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px', borderBottom: `1px solid ${t.colors.page.cardBorder}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{u.full_name || '—'}</div>
                          <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, overflowWrap: 'anywhere' }}>{u.email}</div>
                        </div>
                        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, whiteSpace: 'nowrap' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        {badges}
                        {actions}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${t.colors.page.cardBorder}`, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>{u.full_name || '—'}</div>
                      <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>{u.email}</div>
                    </div>
                    {badges}
                    <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, width: '88px', textAlign: 'right' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </div>
                    {actions}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {orgs.length > 0 && (
          <>
            <SectionHeader title="Organizations" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {orgs.map(org => (
                <div key={org.id} style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, padding: '20px 24px', boxShadow: t.shadow.card }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: t.radius.lg, background: org.is_pilot ? t.colors.accent.blue : t.colors.accent.green, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: t.font.weight.black, fontSize: t.font.size.md, flexShrink: 0 }}>
                      {org.name?.charAt(0)?.toUpperCase() || 'O'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ fontSize: t.font.size.md, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{org.name}</div>
                        {org.is_pilot && (
                          <span style={{ padding: '2px 8px', background: t.colors.accent.blueLight, border: '1px solid #bfdbfe', borderRadius: t.radius.md, fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: t.colors.accent.blue, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Pilot
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>
                        {org.email_domain} · {org.members?.length || 0} member{org.members?.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => handlePilotToggle(org.id, org.is_pilot)}
                      disabled={pilotToggling === org.id}
                      style={{ padding: '5px 12px', background: org.is_pilot ? t.colors.accent.blue : 'transparent', border: `1px solid ${org.is_pilot ? t.colors.accent.blue : t.colors.border.strong}`, borderRadius: t.radius.md, color: org.is_pilot ? '#fff' : t.colors.text.secondary, fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, cursor: pilotToggling === org.id ? 'not-allowed' : 'pointer', opacity: pilotToggling === org.id ? 0.5 : 1, flexShrink: 0 }}
                    >
                      {pilotToggling === org.id ? '...' : org.is_pilot ? 'Remove Pilot' : 'Mark as Pilot'}
                    </button>
                  </div>
                  {org.is_pilot && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '12px 16px', background: t.colors.accent.blueLight, borderRadius: t.radius.lg, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.accent.blue, whiteSpace: 'nowrap' }}>Start</label>
                        <input
                          type="date"
                          min={today}
                          value={pilotDates[org.id]?.start || ''}
                          onChange={e => setPilotDates(prev => ({ ...prev, [org.id]: { ...prev[org.id], start: e.target.value } }))}
                          style={{ padding: '4px 8px', border: `1px solid #bfdbfe`, borderRadius: t.radius.md, fontSize: t.font.size.sm, background: '#fff', color: t.colors.text.primary }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.accent.blue, whiteSpace: 'nowrap' }}>End</label>
                        <input
                          type="date"
                          min={pilotDates[org.id]?.start || today}
                          value={pilotDates[org.id]?.end || ''}
                          onChange={e => setPilotDates(prev => ({ ...prev, [org.id]: { ...prev[org.id], end: e.target.value } }))}
                          style={{ padding: '4px 8px', border: '1px solid #bfdbfe', borderRadius: t.radius.md, fontSize: t.font.size.sm, background: '#fff', color: t.colors.text.primary }}
                        />
                      </div>
                      <button
                        onClick={() => handleSavePilotDates(org.id)}
                        disabled={datesSaving === org.id}
                        style={{ padding: '4px 12px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.md, color: '#fff', fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, cursor: datesSaving === org.id ? 'not-allowed' : 'pointer', opacity: datesSaving === org.id ? 0.5 : 1 }}
                      >
                        {datesSaving === org.id ? 'Saving…' : 'Save Dates'}
                      </button>
                    </div>
                  )}
                  {org.members?.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.font.size.sm, minWidth: '520px' }}>
                      <thead>
                        <tr>
                          {['Member', 'Email', 'Role', ''].map((h, i) => (
                            <th key={i} style={{ padding: '8px 12px', textAlign: i === 3 ? 'right' : 'left', fontWeight: t.font.weight.semibold, fontSize: t.font.size.xs, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${t.colors.page.cardBorder}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {org.members.map(member => (
                          <tr key={member.user_id}>
                            <td style={{ padding: '8px 12px', color: t.colors.text.primary }}>{member.full_name || '—'}</td>
                            <td style={{ padding: '8px 12px', color: t.colors.text.muted }}>{member.email || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ padding: '2px 8px', background: member.role === 'admin' ? t.colors.accent.blueLight : 'transparent', border: `1px solid ${member.role === 'admin' ? '#bfdbfe' : t.colors.border.default}`, borderRadius: t.radius.md, fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: member.role === 'admin' ? t.colors.accent.blue : t.colors.text.muted, textTransform: 'uppercase' }}>
                                {member.role}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleRoleChange(member.user_id, org.id, member.role === 'admin' ? 'member' : 'admin')}
                                disabled={roleChanging === member.user_id}
                                style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${t.colors.border.strong}`, borderRadius: t.radius.md, color: t.colors.text.secondary, fontSize: t.font.size.xs, cursor: roleChanging === member.user_id ? 'not-allowed' : 'pointer', opacity: roleChanging === member.user_id ? 0.5 : 1 }}
                              >
                                {roleChanging === member.user_id ? '...' : member.role === 'admin' ? 'Demote' : 'Make Admin'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── ORG ACTIVITY (#85) ── */}
        <SectionHeader title="Org Activity" />
        {activity.length === 0 ? (
          <div style={{ padding: '16px', background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, color: t.colors.text.muted, fontSize: t.font.size.sm }}>
            No org activity data yet.
          </div>
        ) : (
          activity.map((org) => (
            <div key={org.id} style={{ marginBottom: '20px' }}>
              {/* Org header + rollups */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{org.name}</span>
                {org.is_pilot && <span style={{ padding: '2px 8px', background: t.colors.accent.blueLight, color: t.colors.accent.blue, borderRadius: t.radius.md, fontSize: t.font.size.xs, fontWeight: t.font.weight.bold }}>PILOT</span>}
                <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                  {org.member_count} member{org.member_count !== 1 ? 's' : ''} · last login <span style={{ color: agoColor(org.rollup.last_sign_in_at), fontWeight: t.font.weight.semibold }}>{fmtAgo(org.rollup.last_sign_in_at)}</span>
                </span>
                <span style={{ marginLeft: 'auto', fontSize: t.font.size.xs, color: t.colors.text.secondary }}>
                  Hauled: <strong style={{ color: '#16a34a' }}>{fmtUSD(org.rollup.hauled_all)}</strong> all-time / <strong style={{ color: '#16a34a' }}>{fmtUSD(org.rollup.hauled_30d)}</strong> 30d
                  {org.rollup.declined_count > 0 && (
                    <> · Ops declined: <strong style={{ color: '#dc2626' }}>{fmtUSD(org.rollup.declined_gross_all)}</strong> all-time / <strong style={{ color: '#dc2626' }}>{fmtUSD(org.rollup.declined_gross_30d)}</strong> 30d</>
                  )}
                  {/* #131: billable credit spend → projected revenue (est. at the starter rate) */}
                  <> · Credits: <strong style={{ color: t.colors.accent.blue }}>{fmtCredits(org.rollup.credits_all)}</strong> all-time / <strong style={{ color: t.colors.accent.blue }}>{fmtCredits(org.rollup.credits_30d)}</strong> 30d · ≈ <strong style={{ color: t.colors.accent.blue }}>{fmtUSD(org.rollup.credits_all * EST_CREDIT_PRICE)}</strong> potential rev @ ${EST_CREDIT_PRICE.toFixed(2)}/cr</>
                </span>
              </div>
              {/* Per-user activity table */}
              <Table
                minWidth="980px"
                headers={['User', 'Last Login', 'Last Request', 'Last Updated', 'Last Search', 'Last Detail Open', 'Hauled (all / 30d)', 'Credits Used (all / 30d)', 'Est. Rev (all / 30d)']}
                rows={org.members.map((m) => [
                  <span key="u" title={m.email}>{m.full_name || m.email}{m.role === 'admin' ? ' ★' : ''}</span>,
                  <span key="l" style={{ color: agoColor(m.last_sign_in_at), fontWeight: t.font.weight.semibold }}>{fmtAgo(m.last_sign_in_at)}</span>,
                  <span key="c" style={{ color: agoColor(m.last_request_created) }}>{fmtAgo(m.last_request_created)}</span>,
                  <span key="up" style={{ color: agoColor(m.last_request_updated) }}>{fmtAgo(m.last_request_updated)}</span>,
                  <span key="s" style={{ color: agoColor(m.last_search_run) }}>{fmtAgo(m.last_search_run)}</span>,
                  <span key="d" style={{ color: agoColor(m.last_detail_open) }}>{fmtAgo(m.last_detail_open)}</span>,
                  <span key="r">{fmtUSD(m.hauled_all)} / {fmtUSD(m.hauled_30d)}{m.completed_count > 0 ? ` (${m.completed_count})` : ''}</span>,
                  // #131: credits spent (count of billable actions in title) + projected revenue
                  <span key="cr" title={`${m.credit_actions_all || 0} billable actions all-time / ${m.credit_actions_30d || 0} in 30d`}>{fmtCredits(m.credits_all)} / {fmtCredits(m.credits_30d)}</span>,
                  <span key="er" style={{ color: t.colors.accent.blue, fontWeight: t.font.weight.semibold }}>{fmtUSD((m.credits_all || 0) * EST_CREDIT_PRICE)} / {fmtUSD((m.credits_30d || 0) * EST_CREDIT_PRICE)}</span>,
                ])}
              />
            </div>
          ))
        )}

        {/* ── TRIMBLE ACTUALS ── */}
        <SectionHeader title="Trimble Actuals — This Month" />
        {(() => {
          const tier = getBillingTier(trimbleBillingStart);
          const count = trimbleLoads?.loads ? trimbleLoads.loads.filter(l => !l.excluded_from_billing).length : (trimbleLoads?.count ?? 0);
          const rawCost = count * 0.10;
          const minCost = tier ? Math.max(rawCost, tier.minimum) : rawCost;
          const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <StatCard label="Hauled Loads" value={count} sub={currentMonth} icon={FileText} color={t.colors.accent.blue} />
                <StatCard
                  label="Estimated Cost"
                  value={`$${minCost.toFixed(2)}`}
                  sub={tier ? `Tier ${tier.tier} · $0.10/load${tier.minimum > 0 ? ` · $${tier.minimum} min` : ''}` : 'Set billing start date below'}
                  icon={BarChart2}
                  color={t.colors.accent.green}
                />
              </div>

              {/* Load table */}
              <div style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, overflow: 'hidden', boxShadow: t.shadow.card, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.font.size.sm, minWidth: '780px' }}>
                  <thead>
                    <tr style={{ background: t.colors.accent.blueLight }}>
                      {['Date / Time (CT)', 'Fleet', 'Request', 'Empty', 'Load ID', 'Source', 'Revenue', 'Exclude'].map((h, i) => (
                        <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: t.font.weight.bold, fontSize: t.font.size.xs, color: t.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${t.colors.page.cardBorder}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trimbleLoads?.loads?.length > 0 ? trimbleLoads.loads.map((load, i) => {
                      const excluded = load.excluded_from_billing;
                      const rowStyle = { borderBottom: i < trimbleLoads.loads.length - 1 ? `1px solid ${t.colors.page.cardBorder}` : 'none', opacity: excluded ? 0.45 : 1, background: excluded ? '#fafafa' : 'transparent' };
                      const cellStyle = { padding: '11px 16px', color: t.colors.text.primary, textDecoration: excluded ? 'line-through' : 'none' };
                      return (
                        <tr key={load.id || i} style={rowStyle}>
                          <td style={{ ...cellStyle, whiteSpace: 'nowrap', color: t.colors.text.muted }}>
                            {load.completed_at ? new Date(load.completed_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                          </td>
                          <td style={{ ...cellStyle, color: t.colors.text.secondary }}>{load.fleet_name || '—'}</td>
                          <td style={{ ...cellStyle, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={load.request_name}>{load.request_name || '—'}</td>
                          <td style={{ ...cellStyle, color: t.colors.text.secondary }}>{load.datum_point || '—'}</td>
                          <td style={{ ...cellStyle, fontFamily: t.font.mono, fontSize: t.font.size.xs }}>{load.load_id || '—'}</td>
                          <td style={{ ...cellStyle, textTransform: 'capitalize', color: t.colors.text.muted }}>{load.source || '—'}</td>
                          <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                            {load.revenue_amount != null ? `$${Number(load.revenue_amount).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '11px 16px' }}>
                            <button
                              onClick={async () => {
                                const next = !excluded;
                                await fetch('/api/orgs/trimble-actuals', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                                  body: JSON.stringify({ id: load.id, excluded_from_billing: next, type: load.type }),
                                });
                                // For WWP rows, flip both outbound and return together (same plan)
                                const planId = load.type === 'wwp' ? load.id.replace(/_outbound$|_return$/, '') : null;
                                setTrimbleLoads(prev => ({
                                  ...prev,
                                  loads: prev.loads.map(l => {
                                    if (planId && l.type === 'wwp' && l.id.startsWith(planId)) return { ...l, excluded_from_billing: next };
                                    if (!planId && l.id === load.id) return { ...l, excluded_from_billing: next };
                                    return l;
                                  }),
                                }));
                              }}
                              style={{ padding: '3px 10px', background: excluded ? t.colors.accent.blueLight : '#fee2e2', border: `1px solid ${excluded ? t.colors.accent.blue : '#fca5a5'}`, borderRadius: t.radius.md, color: excluded ? t.colors.accent.blue : '#dc2626', fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {excluded ? 'Restore' : 'Exclude'}
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={8} style={{ padding: '24px 16px', textAlign: 'center', color: t.colors.text.muted, fontSize: t.font.size.sm }}>
                          No hauled loads recorded this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Billing start date config */}
              <div style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, padding: '18px 24px', boxShadow: t.shadow.card, display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>Trimble Billing Start Date</div>
                  <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginTop: '3px' }}>
                    Month 1 of the Trimble agreement. Used to calculate the correct billing tier.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="date"
                    value={trimbleBillingStartInput}
                    onChange={e => setTrimbleBillingStartInput(e.target.value)}
                    style={{ padding: '6px 10px', border: `1px solid ${t.colors.border.strong}`, borderRadius: t.radius.md, fontSize: t.font.size.sm, background: t.colors.page.bg, color: t.colors.text.primary }}
                  />
                  <button
                    onClick={saveTrimbleBillingStart}
                    disabled={trimbleBillingStartSaving || trimbleBillingStartInput === trimbleBillingStart}
                    style={{ padding: '6px 16px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.md, color: '#fff', fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, cursor: (trimbleBillingStartSaving || trimbleBillingStartInput === trimbleBillingStart) ? 'not-allowed' : 'pointer', opacity: (trimbleBillingStartSaving || trimbleBillingStartInput === trimbleBillingStart) ? 0.5 : 1 }}
                  >
                    {trimbleBillingStartSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── DEBUG SETTINGS ── */}
        {/* DAT API debug toggle commented out — DAT integration is not on the table right now.
            Uncomment (and the fetchDebugSettings/toggleDebugSetting helpers remain in place)
            if/when we revisit DAT. */}
        {/*
        <SectionHeader title="Debug Settings" />
        <div style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, overflow: 'hidden', boxShadow: t.shadow.card }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', gap: '24px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>DAT API Debug Email</div>
              <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginTop: '3px' }}>
                When on, every DAT API call sends a full trace to{' '}
                <span style={{ fontFamily: t.font.mono, color: t.colors.text.primary }}>jason@haulmonitor.cloud</span>.
                Turn off once the integration is stable.
              </div>
            </div>
            <button
              onClick={() => toggleDebugSetting('dat_debug_email', debugSettings.dat_debug_email)}
              disabled={debugSaving}
              style={{
                position: 'relative', width: '48px', height: '26px',
                borderRadius: t.radius.full, border: 'none',
                background: debugSettings.dat_debug_email ? t.colors.accent.green : t.colors.border.strong,
                cursor: debugSaving ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s', flexShrink: 0,
                opacity: debugSaving ? 0.6 : 1,
              }}
              aria-label={debugSettings.dat_debug_email ? 'Disable DAT debug email' : 'Enable DAT debug email'}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: debugSettings.dat_debug_email ? '25px' : '3px',
                width: '20px', height: '20px',
                borderRadius: t.radius.full, background: '#fff',
                transition: 'left 0.2s', boxShadow: t.shadow.sm,
              }} />
            </button>
            <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: debugSettings.dat_debug_email ? t.colors.accent.green : t.colors.text.muted, minWidth: '24px', textAlign: 'right' }}>
              {debugSettings.dat_debug_email ? 'ON' : 'OFF'}
            </div>
          </div>
        </div>
        */}

    </div>
  );
};
