import { useState, useEffect } from 'react';
import { Shield, AlertCircle, Calendar, BarChart2, FileText, Download } from '../icons';
import { useAuth } from '../contexts/AuthContext';
import { tokens } from '../styles/tokens.v2';
import { db } from '../lib/supabase';

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

const Table = ({ headers, rows }) => (
  <div style={{
    background: t.colors.page.cardBg,
    border: `1px solid ${t.colors.page.cardBorder}`,
    borderRadius: t.radius.xl, overflow: 'hidden',
    boxShadow: t.shadow.card,
  }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.font.size.sm }}>
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

export const AdminDashboard = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { user, session } = useAuth();

  const [dfMeta, setDfMeta] = useState(null);
  const [tpMeta, setTpMeta] = useState(null);
  const [metaError, setMetaError] = useState(false);
  const [requestStats, setRequestStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
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

  useEffect(() => {
    Promise.all([fetchMetas(), fetchRequestStats(), fetchOrgs(), fetchDebugSettings(), fetchTrimbleActuals(), fetchTrimbleBillingStart()]).finally(() => setLoading(false));
  }, []);

  const fetchMetas = async () => {
    const bust = '?_=' + Date.now();
    const [dfRes, tpRes] = await Promise.allSettled([
      fetch('/df-loads-meta.json' + bust),
      fetch('/tp-loads-meta.json' + bust),
    ]);

    let gotAny = false;
    if (dfRes.status === 'fulfilled' && dfRes.value.ok) {
      const data = await dfRes.value.json().catch(() => null);
      if (data && Object.keys(data).length > 0) { setDfMeta(data); gotAny = true; }
    }
    if (tpRes.status === 'fulfilled' && tpRes.value.ok) {
      const data = await tpRes.value.json().catch(() => null);
      if (data && Object.keys(data).length > 0) { setTpMeta(data); gotAny = true; }
    }
    if (!gotAny) setMetaError(true);
  };

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

  const fetchRequestStats = async () => {
    if (!user) return;
    try {
      const requests = await db.requests.getAll(user.id);
      const open = requests.filter(r => r.status === 'open' || r.status === 'active' || !r.status).length;
      const thisMonth = requests.filter(r => {
        const d = new Date(r.created_at);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
      setRequestStats({ total: requests.length, open, thisMonth, recent: requests.slice(0, 5) });
    } catch {
      // Non-critical
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

  const fmtChange = (n) => {
    if (n === undefined || n === null) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toLocaleString()}`;
  };

  const changeColor = (n) => {
    if (!n) return t.colors.text.muted;
    return n > 0 ? t.colors.accent.green : n < -100 ? t.colors.accent.red : t.colors.accent.amber;
  };

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
          {dfMeta && (
            <a
              href="/df-loads-diff-latest.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px',
                background: t.colors.page.cardBg,
                border: `1px solid ${t.colors.page.cardBorder}`,
                borderRadius: t.radius.lg,
                color: t.colors.text.secondary,
                fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold,
                textDecoration: 'none',
                cursor: 'pointer',
                boxShadow: t.shadow.sm,
              }}
            >
              <Download size={15} color={t.colors.text.muted} />
              DF Diff Report
            </a>
          )}
        </div>

        {/* ── DATA HEALTH ── */}
        <SectionHeader title="Load Data Health" />

        {metaError ? (
          <div style={{
            background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`,
            borderRadius: t.radius.xl, padding: '24px', display: 'flex', alignItems: 'center', gap: '12px',
            color: t.colors.text.muted, boxShadow: t.shadow.card,
          }}>
            <AlertCircle size={20} color={t.colors.accent.amber} />
            No load metadata found. Run the data fetch workflows to generate it.
          </div>
        ) : (dfMeta || tpMeta) ? (
          <>
            {/* Per-source panels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
              {[
                { meta: dfMeta, label: 'DirectFreight', abbr: 'DF', color: t.colors.accent.blue },
                { meta: tpMeta, label: 'TruckerPath',   abbr: 'TP', color: t.colors.accent.purple },
              ].map(({ meta, label, abbr, color }) => meta ? (
                <div key={abbr} style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, padding: '20px 24px', boxShadow: t.shadow.card }}>
                  {/* Source header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ padding: '4px 10px', background: `${color}18`, border: `1px solid ${color}40`, borderRadius: t.radius.md, fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color }}>
                      {abbr}
                    </div>
                    <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{label}</div>
                    <div style={{ marginLeft: 'auto', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
                      Last run: {fmtDate(meta.runDate)}
                      {meta.runAt && ` · ${new Date(meta.runAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    {[
                      { label: 'Total Loads', value: meta.totalLoads?.toLocaleString() ?? '—' },
                      { label: 'With Pay Data', value: meta.loadsWithPay?.toLocaleString() ?? '—' },
                      { label: 'Avg Pay', value: meta.avgPay ? `$${meta.avgPay.toLocaleString()}` : '—' },
                      ...(meta.netChange !== undefined ? [
                        { label: 'vs Prev Run', value: fmtChange(meta.netChange), valueColor: changeColor(meta.netChange) },
                        { label: 'Added', value: `+${meta.added?.toLocaleString() ?? 0}`, valueColor: t.colors.accent.green },
                        { label: 'Removed', value: `-${meta.removed?.toLocaleString() ?? 0}`, valueColor: meta.removed > 0 ? t.colors.accent.amber : t.colors.text.muted },
                      ] : []),
                    ].map(({ label, value, valueColor }) => (
                      <div key={label} style={{ background: t.colors.page.bg, borderRadius: t.radius.lg, padding: '10px 12px' }}>
                        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: t.font.size.md, fontWeight: t.font.weight.bold, color: valueColor || t.colors.text.primary }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Equipment & States side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, marginBottom: '8px' }}>Equipment Types</div>
                      <Table
                        headers={['Type', 'Count', '%']}
                        rows={(meta.equipmentTypes || []).map(([type, count]) => [
                          type, count.toLocaleString(),
                          `${Math.round((count / meta.totalLoads) * 100)}%`,
                        ])}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, marginBottom: '8px' }}>Top Pickup States</div>
                      <Table
                        headers={['State', 'Count', '%']}
                        rows={(meta.topPickupStates || []).slice(0, 10).map(([state, count]) => [
                          state, count.toLocaleString(),
                          `${Math.round((count / meta.totalLoads) * 100)}%`,
                        ])}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div key={abbr} style={{ background: t.colors.page.cardBg, border: `1px solid ${t.colors.page.cardBorder}`, borderRadius: t.radius.xl, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: t.shadow.card }}>
                  <div style={{ padding: '4px 10px', background: `${color}10`, border: `1px solid ${color}30`, borderRadius: t.radius.md, fontSize: t.font.size.xs, fontWeight: t.font.weight.bold, color: `${color}80` }}>{abbr}</div>
                  <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted }}>{label} — no data yet. Trigger the fetch workflow to populate.</div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* ── REQUEST ACTIVITY ── */}
        <SectionHeader title="Your Request Activity" />

        {requestStats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <StatCard label="Open Requests" value={requestStats.open} icon={FileText} color={t.colors.accent.blue} />
              <StatCard label="This Month" value={requestStats.thisMonth} icon={Calendar} color={t.colors.accent.amber} />
              <StatCard label="All Time" value={requestStats.total} icon={BarChart2} color={t.colors.accent.purple} />
            </div>

            {requestStats.recent?.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, color: t.colors.text.muted, marginBottom: '10px' }}>Recent Requests</div>
                <Table
                  headers={['Request Name', 'Datum Point', 'Fleet', 'Created']}
                  rows={requestStats.recent.map(r => [
                    r.request_name || '—',
                    r.datum_point || '—',
                    r.fleets?.name || '—',
                    fmtDate(r.created_at),
                  ])}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>No request data available.</div>
        )}

        {/* ── ORGANIZATIONS ── */}
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
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.font.size.sm }}>
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
                  )}
                </div>
              ))}
            </div>
          </>
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
                      {['Date / Time (CT)', 'Fleet', 'Request', 'Datum Point', 'Load ID', 'Source', 'Revenue', 'Exclude'].map((h, i) => (
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
                                  headers: { 'Content-Type': 'application/json' },
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

    </div>
  );
};
