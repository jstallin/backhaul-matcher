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
    completed: { color: t.colors.accent.green,   bg: t.colors.accent.greenLight,  label: 'Completed' },
    active:    { color: t.colors.accent.blue,     bg: t.colors.accent.blueLight,   label: 'Active' },
    paused:    { color: t.colors.accent.amber,    bg: t.colors.accent.amberLight,  label: 'Paused' },
    cancelled: { color: t.colors.accent.red,      bg: t.colors.accent.redLight,    label: 'Cancelled' },
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

function StatCard({ label, value }) {
  return (
    <Card style={{ padding: '20px 24px', flex: 1, minWidth: 0 }}>
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
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FILTER_TABS = ['All', 'Completed', 'Active', 'Cancelled'];

function filterRequests(requests, tab) {
  if (tab === 'All') return requests;
  return requests.filter((r) => r.status === tab.toLowerCase());
}

// ─── Shimmer Loading State ────────────────────────────────────────────────────

function LoadingShimmer({ isMobile }) {
  return (
    <div>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} style={{ flex: 1, padding: '20px 24px' }}>
            <ShimmerBlock height="12px" width="60%" />
            <ShimmerBlock height="32px" width="50%" style={{ marginTop: '10px' }} />
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {[80, 100, 70, 90].map((w, i) => (
          <ShimmerBlock key={i} width={`${w}px`} height="32px" radius={t.radius.full} />
        ))}
      </div>

      {/* Table */}
      <Card>
        <div style={{ padding: '0 20px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px 0', borderBottom: i < 5 ? `1px solid ${t.colors.page.cardBorder}` : 'none' }}>
              <ShimmerBlock width="80px" height="14px" />
              <ShimmerBlock width="160px" height="14px" />
              <ShimmerBlock width="100px" height="14px" />
              <ShimmerBlock width="120px" height="14px" />
              <ShimmerBlock width="72px" height="20px" radius={t.radius.full} />
              <ShimmerBlock width="70px" height="14px" />
              <ShimmerBlock width="70px" height="14px" />
              <ShimmerBlock width="60px" height="14px" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── LoadsView ────────────────────────────────────────────────────────────────

export function LoadsView() {
  const { user } = useAuth();
  const isMobile = useMobile();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('All');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await db.requests.getAll(user.id);
        setRequests(data || []);
      } catch (err) {
        console.error('LoadsView fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div style={{ fontFamily: t.font.family }}>
        {/* Page header */}
        <div style={{ marginBottom: '28px' }}>
          <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
          <ShimmerBlock width="100px" height="28px" radius={t.radius.lg} />
          <ShimmerBlock width="220px" height="14px" radius={t.radius.md} style={{ marginTop: '6px' }} />
        </div>
        <LoadingShimmer isMobile={isMobile} />
      </div>
    );
  }

  const completed = requests.filter((r) => r.status === 'completed');
  const totalRevenue    = completed.reduce((sum, r) => sum + (Number(r.revenue_amount) || 0), 0);
  const totalNetRevenue = completed.reduce((sum, r) => sum + (Number(r.net_revenue) || 0), 0);
  const totalOorMiles   = completed.reduce((sum, r) => sum + (Number(r.out_of_route_miles) || 0), 0);

  const filtered = filterRequests(requests, activeTab);

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
          Loads
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: t.font.size.sm, color: t.colors.text.muted }}>
          Your backhaul load history
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        <StatCard label="Total Completed" value={completed.length.toLocaleString()} />
        <StatCard label="Total Revenue"   value={formatCurrency(totalRevenue)} />
        <StatCard label="Net Revenue"     value={formatCurrency(totalNetRevenue)} />
        <StatCard label="OOR Miles Saved" value={formatMiles(totalOorMiles)} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {FILTER_TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 16px',
                borderRadius: t.radius.full,
                border: 'none',
                background: active ? t.colors.accent.blue : 'transparent',
                color: active ? '#fff' : t.colors.text.muted,
                fontSize: t.font.size.sm,
                fontWeight: active ? t.font.weight.semibold : t.font.weight.medium,
                cursor: 'pointer',
                fontFamily: t.font.family,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = t.colors.text.primary; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = t.colors.text.muted; }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: t.colors.text.muted }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', opacity: 0.4 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="9" x2="9" y2="21" />
            </svg>
            <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.medium }}>No loads yet</div>
            <div style={{ fontSize: t.font.size.sm, marginTop: '4px', opacity: 0.7 }}>
              {activeTab === 'All' ? 'Your hauled loads will appear here.' : `No ${activeTab.toLowerCase()} loads found.`}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${t.colors.page.cardBorder}` }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Request</th>
                  <th style={thStyle}>Fleet</th>
                  <th style={thStyle}>Pick-up Location</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Net Revenue</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>OOR Miles</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req, idx) => {
                  const displayDate = req.completed_at ?? req.created_at;
                  const isLast = idx === filtered.length - 1;
                  return (
                    <tr
                      key={req.id}
                      style={{ borderBottom: isLast ? 'none' : `1px solid ${t.colors.page.cardBorder}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: t.colors.text.muted }}>
                        {formatDate(displayDate)}
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
                      <td style={{ ...tdStyle, maxWidth: '160px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.datum_point || '—'}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={req.status} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: t.font.weight.medium }}>
                        {formatCurrency(req.revenue_amount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: t.font.weight.medium, color: t.colors.accent.green }}>
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
      </Card>
    </div>
  );
}
