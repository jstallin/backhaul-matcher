import { useState, useEffect } from 'react';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../styles/tokens.v2';
import { useMobile } from '../../hooks/useMobile';

const t = tokens;

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: t.colors.page.cardBg,
      border: `1px solid ${t.colors.page.cardBorder}`,
      borderRadius: t.radius.xl,
      boxShadow: t.shadow.card,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }) {
  return (
    <div style={{ padding: '20px 24px 0' }}>
      <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: t.font.size.xs,
      fontWeight: t.font.weight.semibold,
      color: t.colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
    }}>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    completed: { color: t.colors.accent.green,  bg: t.colors.accent.greenLight,  label: 'Completed' },
    active:    { color: t.colors.accent.blue,    bg: t.colors.accent.blueLight,   label: 'Active' },
    paused:    { color: t.colors.accent.amber,   bg: t.colors.accent.amberLight,  label: 'Paused' },
    cancelled: { color: t.colors.accent.red,     bg: t.colors.accent.redLight,    label: 'Cancelled' },
  };
  const s = map[status] ?? { color: t.colors.text.muted, bg: t.colors.page.bg, label: status ?? '—' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: t.radius.full,
      background: s.bg, color: s.color,
      fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold,
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <Card style={{ flex: 1, minWidth: 0, padding: '20px 24px' }}>
      <SectionLabel>{label}</SectionLabel>
      <div style={{
        marginTop: '10px',
        fontSize: t.font.size['3xl'],
        fontWeight: t.font.weight.black,
        color: t.colors.text.primary,
        letterSpacing: '-0.02em',
        lineHeight: t.font.lineHeight.tight,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: '4px', fontSize: t.font.size.xs, color: t.colors.text.muted }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

function ShimmerBlock({ width = '100%', height = '20px', radius = t.radius.md, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      ...style,
    }} />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val) {
  if (val == null || val === '') return '—';
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatMiles(val) {
  if (val == null || val === '') return '—';
  return Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mi';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getRevenueByMonth(completed, monthCount = 6) {
  const now = new Date();
  const months = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      revenue: 0,
    });
  }

  for (const req of completed) {
    const date = req.completed_at ? new Date(req.completed_at) : null;
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const slot = months.find((m) => m.key === key);
    if (slot) slot.revenue += Number(req.revenue_amount) || 0;
  }

  return months;
}

function getRequestsByStatus(requests) {
  const counts = { active: 0, paused: 0, completed: 0, cancelled: 0 };
  for (const r of requests) {
    if (r.status in counts) counts[r.status]++;
  }
  return counts;
}

// ─── CSS Bar Chart ────────────────────────────────────────────────────────────

function RevenueBarChart({ data }) {
  const chartH = 150;
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);

  return (
    <div style={{ width: '100%', padding: '0 4px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: `${chartH}px` }}>
        {data.map(d => {
          const barH = Math.max((d.revenue / maxRevenue) * (chartH - 24), d.revenue > 0 ? 4 : 2);
          const isEmpty = d.revenue === 0;
          return (
            <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{
                fontSize: '11px', fontWeight: 600,
                color: t.colors.text.muted,
                marginBottom: '5px',
                opacity: isEmpty ? 0 : 1,
                whiteSpace: 'nowrap',
              }}>
                {d.revenue >= 1000 ? `$${(d.revenue / 1000).toFixed(1)}k` : `$${Math.round(d.revenue)}`}
              </div>
              <div style={{
                width: '100%',
                maxWidth: '48px',
                height: `${barH}px`,
                background: isEmpty ? t.colors.page.cardBorder : t.colors.accent.blue,
                borderRadius: '4px 4px 0 0',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', padding: '0' }}>
        {data.map(d => (
          <div key={d.key} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: t.colors.text.muted }}>
            {d.month}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shimmer Loading State ────────────────────────────────────────────────────

function LoadingShimmer({ isMobile }) {
  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} style={{ flex: 1, padding: '20px 24px' }}>
            <ShimmerBlock height="12px" width="60%" />
            <ShimmerBlock height="32px" width="50%" style={{ marginTop: '10px' }} />
          </Card>
        ))}
      </div>

      {/* Two-col grid */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '20px', marginBottom: '24px' }}>
        <Card style={{ flex: 1.5, padding: '20px 24px' }}>
          <ShimmerBlock height="14px" width="120px" />
          <ShimmerBlock height="160px" style={{ marginTop: '20px' }} radius={t.radius.lg} />
        </Card>
        <Card style={{ flex: 1, padding: '20px 24px' }}>
          <ShimmerBlock height="14px" width="100px" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
              <ShimmerBlock width="10px" height="10px" radius="50%" />
              <ShimmerBlock height="12px" width="80px" />
              <ShimmerBlock height="12px" width="30px" style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div style={{ padding: '0 20px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px 0', borderBottom: i < 5 ? `1px solid ${t.colors.page.cardBorder}` : 'none' }}>
              <ShimmerBlock width="80px"  height="13px" />
              <ShimmerBlock width="160px" height="13px" />
              <ShimmerBlock width="100px" height="13px" />
              <ShimmerBlock width="72px"  height="20px" radius={t.radius.full} />
              <ShimmerBlock width="70px"  height="13px" />
              <ShimmerBlock width="70px"  height="13px" />
              <ShimmerBlock width="60px"  height="13px" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── ReportsView ──────────────────────────────────────────────────────────────

const STATUS_ROWS = [
  { key: 'active',    label: 'Active',    color: t.colors.accent.blue },
  { key: 'paused',    label: 'Paused',    color: t.colors.accent.amber },
  { key: 'completed', label: 'Completed', color: t.colors.accent.green },
  { key: 'cancelled', label: 'Cancelled', color: t.colors.accent.red },
];

export function ReportsView() {
  const { user } = useAuth();
  const isMobile = useMobile();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [reqs] = await Promise.all([
          db.requests.getAll(user.id),
          db.fleets.getAll(user.id),
        ]);
        setRequests(reqs || []);
      } catch (err) {
        console.error('ReportsView fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div style={{ fontFamily: t.font.family }}>
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        <div style={{ marginBottom: '28px' }}>
          <ShimmerBlock width="110px" height="28px" radius={t.radius.lg} />
          <ShimmerBlock width="250px" height="14px" radius={t.radius.md} style={{ marginTop: '6px' }} />
        </div>
        <LoadingShimmer isMobile={isMobile} />
      </div>
    );
  }

  const completed        = requests.filter((r) => r.status === 'completed');
  const totalRevenue     = completed.reduce((s, r) => s + (Number(r.revenue_amount) || 0), 0);
  const totalNetRevenue  = completed.reduce((s, r) => s + (Number(r.net_revenue) || 0), 0);
  const totalOorMiles    = completed.reduce((s, r) => s + (Number(r.out_of_route_miles) || 0), 0);
  const totalGallonsSaved = totalOorMiles / 6;

  const monthlyRevenue  = getRevenueByMonth(completed, 6);
  const statusCounts    = getRequestsByStatus(requests);

  const sorted = [...requests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);

  const thStyle = {
    padding: '10px 16px',
    fontSize: t.font.size.xs,
    fontWeight: t.font.weight.semibold,
    color: t.colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '14px 16px',
    fontSize: t.font.size.sm,
    color: t.colors.text.secondary,
    verticalAlign: 'middle',
  };

  return (
    <div style={{ fontFamily: t.font.family }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Page header */}
      <div style={{ marginBottom: '28px', paddingRight: isMobile ? '54px' : 0 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? t.font.size.xl : t.font.size['3xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary, letterSpacing: '-0.02em' }}>
          Reports
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: t.font.size.sm, color: t.colors.text.muted }}>
          Fleet performance &amp; analytics
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        <StatCard label="Completed Loads"  value={completed.length.toLocaleString()} />
        <StatCard label="Total Revenue"    value={formatCurrency(totalRevenue)} />
        <StatCard label="Net Revenue"      value={formatCurrency(totalNetRevenue)} />
        <StatCard
          label="Gallons Saved"
          value={totalGallonsSaved > 0 ? Math.round(totalGallonsSaved).toLocaleString() + ' gal' : '—'}
          sub={totalOorMiles > 0 ? `${formatMiles(totalOorMiles)} OOR avoided` : undefined}
        />
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '20px', marginBottom: '24px', alignItems: 'flex-start' }}>

        {/* Revenue Trend card */}
        <Card style={{ flex: 1.5, minWidth: 0 }}>
          <CardHeader title="Revenue Trend" subtitle="Last 6 months — completed loads" />
          <div style={{ padding: '20px 24px 24px' }}>
            {completed.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', color: t.colors.text.muted }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px', opacity: 0.35 }}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <div style={{ fontSize: t.font.size.sm }}>No completed loads yet</div>
              </div>
            ) : (
              <RevenueBarChart data={monthlyRevenue} />
            )}
          </div>
        </Card>

        {/* Request Status card */}
        <Card style={{ flex: 1, minWidth: 0 }}>
          <CardHeader title="Request Status" subtitle="All-time counts by status" />
          <div style={{ padding: '16px 24px 24px' }}>
            {requests.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: t.colors.text.muted, fontSize: t.font.size.sm }}>
                No requests yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {STATUS_ROWS.map((row, idx) => (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 0',
                      borderBottom: idx < STATUS_ROWS.length - 1 ? `1px solid ${t.colors.page.cardBorder}` : 'none',
                    }}
                  >
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: t.font.size.sm, color: t.colors.text.secondary, fontWeight: t.font.weight.medium }}>
                      {row.label}
                    </span>
                    <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>
                      {statusCounts[row.key] ?? 0}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${t.colors.page.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, fontWeight: t.font.weight.semibold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
                  <span style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.bold, color: t.colors.text.primary }}>{requests.length}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* All Requests table */}
      <Card>
        <CardHeader title="All Requests" subtitle={sorted.length < requests.length ? `Showing most recent ${sorted.length} of ${requests.length}` : `${requests.length} total`} />
        <div style={{ marginTop: '16px' }}>
          {sorted.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: t.colors.text.muted }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '10px', opacity: 0.35 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="9" x2="9" y2="21" />
              </svg>
              <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.medium }}>No requests yet</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${t.colors.page.cardBorder}` }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Request Name</th>
                    <th style={thStyle}>Fleet</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Net Revenue</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>OOR Miles</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((req, idx) => {
                    const isLast = idx === sorted.length - 1;
                    return (
                      <tr
                        key={req.id}
                        style={{ borderBottom: isLast ? 'none' : `1px solid ${t.colors.page.cardBorder}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: t.colors.text.muted }}>
                          {formatDate(req.created_at)}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: t.font.weight.medium, color: t.colors.text.primary, maxWidth: '200px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.request_name || '—'}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: '140px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.fleets?.name || '—'}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge status={req.status} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: t.font.weight.medium }}>
                          {formatCurrency(req.revenue_amount)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: t.font.weight.medium, color: req.net_revenue ? t.colors.accent.green : t.colors.text.muted }}>
                          {formatCurrency(req.net_revenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {formatMiles(req.out_of_route_miles)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
