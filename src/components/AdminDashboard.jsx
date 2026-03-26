import { useState, useEffect } from 'react';
import { Shield, Package, TrendingUp, RefreshCw, AlertCircle, Calendar, DollarSign, BarChart2, FileText, Download } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { HaulMonitorLogo } from './HaulMonitorLogo';
import { db } from '../lib/supabase';

const StatCard = ({ label, value, sub, icon: Icon, color, colors }) => (
  <div style={{
    background: colors.background.secondary,
    border: `1px solid ${colors.border.secondary}`,
    borderRadius: '12px',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
  }}>
    <div style={{
      width: '44px', height: '44px', borderRadius: '10px',
      background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text.primary, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary, marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: '12px', color: colors.text.muted || colors.text.secondary, marginTop: '2px', opacity: 0.7 }}>{sub}</div>}
    </div>
  </div>
);

const SectionHeader = ({ title, colors }) => (
  <div style={{
    fontSize: '13px', fontWeight: 700, color: colors.text.secondary,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: '12px', marginTop: '32px',
  }}>
    {title}
  </div>
);

const Table = ({ headers, rows, colors }) => (
  <div style={{
    background: colors.background.secondary,
    border: `1px solid ${colors.border.secondary}`,
    borderRadius: '12px', overflow: 'hidden',
  }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
      <thead>
        <tr style={{ background: `${colors.accent.primary}10` }}>
          {headers.map((h, i) => (
            <th key={i} style={{
              padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right',
              fontWeight: 700, fontSize: '12px', color: colors.text.secondary,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: `1px solid ${colors.border.secondary}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ borderBottom: ri < rows.length - 1 ? `1px solid ${colors.border.secondary}` : 'none' }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{
                padding: '11px 16px', color: colors.text.primary,
                textAlign: ci === 0 ? 'left' : 'right',
              }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AdminDashboard = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [dfMeta, setDfMeta] = useState(null);
  const [tpMeta, setTpMeta] = useState(null);
  const [metaError, setMetaError] = useState(false);
  const [requestStats, setRequestStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchMetas(), fetchRequestStats()]).finally(() => setLoading(false));
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
    if (!n) return colors.text.secondary;
    return n > 0 ? '#22c55e' : n < -100 ? '#ef4444' : '#f59e0b';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: colors.text.secondary }}>Loading admin data...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <HaulMonitorLogo size="medium" />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="admin-dashboard" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px' }}>
        {/* Page title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={28} color={colors.accent.primary} />
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>Admin Dashboard</div>
              <div style={{ fontSize: '13px', color: colors.text.secondary, marginTop: '2px' }}>
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
                background: colors.background.secondary,
                border: `1px solid ${colors.border.secondary}`,
                borderRadius: '8px',
                color: colors.text.primary,
                fontSize: '13px', fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Download size={15} color={colors.text.secondary} />
              DF Diff Report
            </a>
          )}
        </div>

        {/* ── DATA HEALTH ── */}
        <SectionHeader title="Load Data Health" colors={colors} />

        {metaError ? (
          <div style={{
            background: colors.background.secondary, border: `1px solid ${colors.border.secondary}`,
            borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'center', gap: '12px',
            color: colors.text.secondary,
          }}>
            <AlertCircle size={20} color="#f59e0b" />
            No load metadata found. Run the data fetch workflows to generate it.
          </div>
        ) : (dfMeta || tpMeta) ? (
          <>
            {/* Per-source panels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
              {[
                { meta: dfMeta, label: 'DirectFreight', abbr: 'DF', color: colors.accent.primary },
                { meta: tpMeta, label: 'TruckerPath',   abbr: 'TP', color: '#8b5cf6' },
              ].map(({ meta, label, abbr, color }) => meta ? (
                <div key={abbr} style={{ background: colors.background.secondary, border: `1px solid ${colors.border.secondary}`, borderRadius: '12px', padding: '20px 24px' }}>
                  {/* Source header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ padding: '4px 10px', background: `${color}20`, border: `1px solid ${color}40`, borderRadius: '6px', fontSize: '12px', fontWeight: 700, color }}>
                      {abbr}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>{label}</div>
                    <div style={{ marginLeft: 'auto', fontSize: '12px', color: colors.text.tertiary }}>
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
                        { label: 'Added', value: `+${meta.added?.toLocaleString() ?? 0}`, valueColor: '#22c55e' },
                        { label: 'Removed', value: `-${meta.removed?.toLocaleString() ?? 0}`, valueColor: meta.removed > 0 ? '#f59e0b' : colors.text.secondary },
                      ] : []),
                    ].map(({ label, value, valueColor }) => (
                      <div key={label} style={{ background: colors.background.primary, borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '11px', color: colors.text.tertiary, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: valueColor || colors.text.primary }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Equipment & States side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text.secondary, marginBottom: '8px' }}>Equipment Types</div>
                      <Table
                        headers={['Type', 'Count', '%']}
                        rows={(meta.equipmentTypes || []).map(([type, count]) => [
                          type, count.toLocaleString(),
                          `${Math.round((count / meta.totalLoads) * 100)}%`,
                        ])}
                        colors={colors}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text.secondary, marginBottom: '8px' }}>Top Pickup States</div>
                      <Table
                        headers={['State', 'Count', '%']}
                        rows={(meta.topPickupStates || []).slice(0, 10).map(([state, count]) => [
                          state, count.toLocaleString(),
                          `${Math.round((count / meta.totalLoads) * 100)}%`,
                        ])}
                        colors={colors}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div key={abbr} style={{ background: colors.background.secondary, border: `1px solid ${colors.border.secondary}`, borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ padding: '4px 10px', background: `${color}10`, border: `1px solid ${color}30`, borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: `${color}80` }}>{abbr}</div>
                  <div style={{ fontSize: '14px', color: colors.text.tertiary }}>{label} — no data yet. Trigger the fetch workflow to populate.</div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* ── REQUEST ACTIVITY ── */}
        <SectionHeader title="Your Request Activity" colors={colors} />

        {requestStats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <StatCard
                label="Open Requests"
                value={requestStats.open}
                icon={FileText}
                color={colors.accent.primary}
                colors={colors}
              />
              <StatCard
                label="This Month"
                value={requestStats.thisMonth}
                icon={Calendar}
                color="#f59e0b"
                colors={colors}
              />
              <StatCard
                label="All Time"
                value={requestStats.total}
                icon={BarChart2}
                color={colors.accent.cyan || '#06b6d4'}
                colors={colors}
              />
            </div>

            {requestStats.recent?.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary, marginBottom: '10px' }}>Recent Requests</div>
                <Table
                  headers={['Request Name', 'Datum Point', 'Fleet', 'Created']}
                  rows={requestStats.recent.map(r => [
                    r.request_name || '—',
                    r.datum_point || '—',
                    r.fleets?.name || '—',
                    fmtDate(r.created_at),
                  ])}
                  colors={colors}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ color: colors.text.secondary, fontSize: '14px' }}>No request data available.</div>
        )}
      </div>
    </div>
  );
};
