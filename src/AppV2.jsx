import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthWrapper } from './components/AuthWrapper';
import { ResetPassword } from './components/ResetPassword';
import { AcceptInvite } from './components/AcceptInvite';
import { Shell } from './components/v2/Shell';
import { FleetsView } from './components/v2/FleetsView';
import { SearchView } from './components/v2/SearchView';
import { LoadsView } from './components/v2/LoadsView';
import { ReportsView } from './components/v2/ReportsView';
import { EstimatesView } from './components/v2/EstimatesView';
import { SettingsView } from './components/v2/SettingsView';
import { AdminDashboard } from './components/AdminDashboard';
import { ImportedLoads } from './components/ImportedLoads';
import { CoDriverV2 } from './components/v2/CoDriverV2';
import { BuyCreditsModal } from './components/BuyCreditsModal';
import { tokens } from './styles/tokens.v2';
import { useAuth } from './contexts/AuthContext';
import { useCredits } from './hooks/useCredits';
import { useMobile } from './hooks/useMobile';
import { db } from './lib/supabase';
import {
  Search, Truck, Package, BarChart2, FileText,
  TrendingUp, DollarSign, Navigation, Plus, CheckCircle, MapPin,
} from './icons';

const t = tokens;

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

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: t.font.size.xs,
      fontWeight: t.font.weight.semibold,
      color: t.colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: '16px',
    }}>
      {children}
    </div>
  );
}

function StatusDot({ status }) {
  const color = {
    active: t.colors.status.active,
    open: t.colors.status.active,
    pending: t.colors.status.transit,
    completed: t.colors.text.muted,
    cancelled: t.colors.text.placeholder,
    expired: t.colors.text.placeholder,
  }[status] ?? t.colors.text.muted;

  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: t.font.size.sm, fontWeight: t.font.weight.medium, color }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

function SkeletonBox({ w = '100%', h = '20px', radius = t.radius.md }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  );
}

// ─── Revenue helpers ──────────────────────────────────────────────────────────

function getRevenueByMonth(completedRequests, numMonths) {
  const now = new Date();
  const months = Array.from({ length: numMonths }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1);
    return { label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), revenue: 0 };
  });

  completedRequests.forEach((r) => {
    if (!r.completed_at && !r.created_at) return;
    const d = new Date(r.completed_at || r.created_at);
    const entry = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
    if (entry) entry.revenue += parseFloat(r.net_revenue) || 0;
  });

  return months;
}

// ─── Revenue trend SVG chart ──────────────────────────────────────────────────

function RevenueTrendChart({ data }) {
  const hasData = data.some((d) => d.revenue > 0);
  const maxVal = Math.max(...data.map((d) => d.revenue), 1);
  const chartH = 110;
  const barW = 32;
  const gap = 10;
  const totalW = data.length * (barW + gap) - gap;
  const pad = { top: 24, bottom: 32, left: 8, right: 8 };
  const svgW = totalW + pad.left + pad.right;
  const svgH = chartH + pad.top + pad.bottom;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minWidth: '260px' }}>
        {data.map((d, i) => {
          const barH = hasData ? Math.max((d.revenue / maxVal) * chartH, d.revenue > 0 ? 4 : 0) : 0;
          const x = pad.left + i * (barW + gap);
          const y = pad.top + chartH - barH;
          const isEmpty = d.revenue === 0;
          return (
            <g key={i}>
              {/* Empty bar track */}
              <rect
                x={x} y={pad.top} width={barW} height={chartH}
                fill={t.colors.page.bg} rx={4}
              />
              {/* Value bar */}
              {!isEmpty && (
                <rect
                  x={x} y={y} width={barW} height={barH}
                  fill={t.colors.accent.blue} rx={4} opacity={0.85}
                />
              )}
              {isEmpty && (
                <rect
                  x={x} y={pad.top} width={barW} height={chartH}
                  fill={t.colors.border.default} rx={4} opacity={0.5}
                />
              )}
              {/* Value label */}
              {!isEmpty && (
                <text
                  x={x + barW / 2} y={y - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily={t.font.family}
                  fontWeight="600"
                  fill={t.colors.text.secondary}
                >
                  ${d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : Math.round(d.revenue)}
                </text>
              )}
              {/* Month label */}
              <text
                x={x + barW / 2} y={pad.top + chartH + 18}
                textAnchor="middle"
                fontSize="11"
                fontFamily={t.font.family}
                fill={t.colors.text.muted}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Dashboard stat card ──────────────────────────────────────────────────────

function StatCard({ label, value, sub, Icon, accentColor, loading, onClick }) {
  return (
    <Card
      style={{
        padding: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={onClick ? (e) => {
        e.currentTarget.style.boxShadow = t.shadow.md;
        e.currentTarget.style.transform = 'translateY(-1px)';
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        e.currentTarget.style.boxShadow = t.shadow.card;
        e.currentTarget.style.transform = 'translateY(0)';
      } : undefined}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: t.radius.lg,
        background: accentColor + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={accentColor} />
      </div>
      <div>
        {loading ? (
          <>
            <SkeletonBox w="60%" h="28px" radius={t.radius.md} />
            <div style={{ marginTop: '6px' }}><SkeletonBox w="80%" h="14px" /></div>
          </>
        ) : (
          <>
            <div style={{ fontSize: t.font.size['4xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary, lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary, marginTop: '4px', fontWeight: t.font.weight.medium }}>
              {label}
            </div>
            {sub && (
              <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>
                {sub}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Dashboard view ───────────────────────────────────────────────────────────

function DashboardView({ onNavigate }) {
  const { user } = useAuth();
  const isMobile = useMobile();
  const [loading, setLoading] = useState(true);
  const [fleets, setFleets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [estimateRequests, setEstimateRequests] = useState([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [f, r, e] = await Promise.all([
          db.fleets.getAll(user.id),
          db.requests.getAll(user.id),
          db.estimateRequests.getAll(user.id),
        ]);
        setFleets(f || []);
        setRequests(r || []);
        setEstimateRequests(e || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Derived metrics
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeRequests = requests.filter((r) => ['active', 'open', 'pending'].includes(r.status));
  const completedRequests = requests.filter((r) => r.status === 'completed');
  const netRevenueThisMonth = completedRequests
    .filter((r) => r.completed_at && new Date(r.completed_at) >= thisMonthStart)
    .reduce((sum, r) => sum + (parseFloat(r.net_revenue) || 0), 0);
  const totalGallonsSaved = completedRequests.reduce((sum, r) => {
    const miles = parseFloat(r.out_of_route_miles) || 0;
    const mpg = parseFloat(r.fleets?.fuel_mpg) || 6;
    return sum + (miles > 0 ? miles / mpg : 0);
  }, 0);

  const recentActivity = [...requests, ...estimateRequests]
    .filter((r) => r.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  const revenueByMonth = getRevenueByMonth(completedRequests, 6);

  // Display name from email
  const rawName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]?.replace(/[._]/g, ' ')
    || 'there';
  const displayName = rawName.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const formatDate = (str) => {
    if (!str) return '';
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isEmpty = !loading && fleets.length === 0 && requests.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Greeting */}
      <div style={{ paddingTop: '4px', paddingRight: '60px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: t.font.size['4xl'], fontWeight: t.font.weight.black, color: t.colors.text.primary, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          Welcome back, {displayName}!
        </h1>
        <p style={{ margin: 0, fontSize: t.font.size.md, color: t.colors.text.muted }}>
          Here's what's happening with your hauls today.
        </p>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <Card style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: t.colors.accent.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Truck size={26} color={t.colors.accent.blue} />
          </div>
          <div style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '8px' }}>
            Welcome to Haul Monitor
          </div>
          <p style={{ margin: '0 0 24px', color: t.colors.text.secondary, fontSize: t.font.size.md, maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
            Get started by creating your first fleet profile.
          </p>
          <button
            onClick={() => onNavigate('fleets')}
            style={{ padding: '10px 24px', background: t.colors.accent.blue, border: 'none', borderRadius: t.radius.lg, color: '#fff', fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, cursor: 'pointer' }}
          >
            Create Your First Fleet
          </button>
        </Card>
      )}

      {!isEmpty && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <StatCard label="Active Requests" value={loading ? null : activeRequests.length} sub="Currently open" Icon={Search} accentColor={t.colors.accent.blue} loading={loading} onClick={() => onNavigate('search')} />
            <StatCard label="Net Revenue" value={loading ? null : `$${netRevenueThisMonth.toLocaleString()}`} sub="This month" Icon={DollarSign} accentColor={t.colors.accent.green} loading={loading} />
            <StatCard label="Completed Hauls" value={loading ? null : completedRequests.length} sub="All time" Icon={CheckCircle} accentColor={t.colors.accent.purple} loading={loading} onClick={() => onNavigate('loads')} />
            <StatCard label="Gallons Conserved" value={loading ? null : Math.round(totalGallonsSaved).toLocaleString()} sub="All time" Icon={TrendingUp} accentColor={t.colors.accent.amber} loading={loading} />
          </div>

          {/* Quick actions */}
          <Card style={{ padding: '20px 24px' }}>
            <SectionLabel>Quick Actions</SectionLabel>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { label: 'New Search Request', view: 'search',    color: t.colors.accent.blue },
                { label: 'New Estimate',        view: 'estimates', color: t.colors.accent.purple },
                { label: 'Manage Fleets',       view: 'fleets',   color: t.colors.accent.green },
                { label: 'View Reports',        view: 'reports',  color: t.colors.accent.amber },
              ].map(({ label, view, color }) => (
                <button
                  key={view}
                  onClick={() => onNavigate(view)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: t.radius.lg,
                    border: `1px solid ${t.colors.border.default}`,
                    background: t.colors.page.cardBg,
                    color,
                    fontSize: t.font.size.base,
                    fontWeight: t.font.weight.semibold,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = color + '0d'; e.currentTarget.style.borderColor = color + '60'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = t.colors.page.cardBg; e.currentTarget.style.borderColor = t.colors.border.default; }}
                >
                  <Plus size={14} color={color} />
                  {label}
                </button>
              ))}
            </div>
          </Card>

          {/* Bottom two-column */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', alignItems: 'start' }}>

            {/* Recent Activity */}
            <Card style={{ padding: '20px 24px' }}>
              <SectionLabel>Recent Activity</SectionLabel>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[1,2,3,4].map((i) => <SkeletonBox key={i} h="40px" radius={t.radius.lg} />)}
                </div>
              ) : recentActivity.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: t.colors.text.muted, fontSize: t.font.size.base }}>
                  No activity yet
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {recentActivity.map((r, idx) => (
                      <div
                        key={r.id || idx}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '11px 0',
                          borderBottom: idx < recentActivity.length - 1 ? `1px solid ${t.colors.border.default}` : 'none',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: t.colors.accent.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <MapPin size={13} color={t.colors.accent.blue} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.request_name || r.datum_point || 'Request'}
                            </div>
                            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>
                              {formatDate(r.created_at)}
                            </div>
                          </div>
                        </div>
                        <StatusDot status={r.status} />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => onNavigate('search')}
                    style={{ marginTop: '14px', background: 'none', border: 'none', color: t.colors.accent.blue, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, cursor: 'pointer', padding: 0 }}
                  >
                    View all requests →
                  </button>
                </>
              )}
            </Card>

            {/* Revenue Trend */}
            <Card style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <SectionLabel>Revenue Trend</SectionLabel>
                <span style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '-2px' }}>Last 6 months</span>
              </div>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '140px', padding: '0 8px' }}>
                  {[60, 80, 40, 90, 55, 75].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h}%`, background: t.colors.border.default, borderRadius: t.radius.md, animation: 'shimmer 1.4s infinite', backgroundSize: '200% 100%' }} />
                  ))}
                </div>
              ) : (
                <RevenueTrendChart data={revenueByMonth} />
              )}
            </Card>
          </div>
        </>
      )}

      <CoDriverV2
        context="dashboard"
        contextData={{
          fleets,
          activeRequests: activeRequests.length,
          completedRequests: completedRequests.length,
          openEstimates: estimateRequests.filter(e => ['active', 'open'].includes(e.status)).length,
          recentActivity,
        }}
      />
    </div>
  );
}

// ─── Placeholder for views not yet built ─────────────────────────────────────

function PlaceholderView({ icon: Icon, title, description, phase, accentColor = t.colors.accent.blue }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '420px', textAlign: 'center', gap: '16px' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: t.radius.xl, background: accentColor + '14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={28} color={accentColor} />
      </div>
      <div>
        <div style={{ fontSize: t.font.size['2xl'], fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '6px' }}>{title}</div>
        <div style={{ fontSize: t.font.size.md, color: t.colors.text.secondary, maxWidth: '400px', lineHeight: t.font.lineHeight.relaxed }}>{description}</div>
      </div>
      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: t.radius.full, background: t.colors.accent.blueLight, color: t.colors.accent.blue, fontSize: t.font.size.xs, fontWeight: t.font.weight.semibold, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Phase {phase}
      </span>
    </div>
  );
}

// ─── View router ──────────────────────────────────────────────────────────────

function renderView(currentView, onNavigate) {
  switch (currentView) {
    case 'dashboard': return <DashboardView onNavigate={onNavigate} />;
    case 'search':    return <SearchView />;
    case 'loads':     return <LoadsView />;
    case 'fleets':    return <FleetsView />;
    case 'reports':   return <ReportsView />;
    case 'estimates': return <EstimatesView />;
    case 'settings':        return <SettingsView />;
    case 'admin-dashboard':  return <AdminDashboard onMenuNavigate={onNavigate} onNavigateToSettings={() => onNavigate('settings')} />;
    case 'imported-loads':   return <ImportedLoads onMenuNavigate={onNavigate} />;
    default:                 return <PlaceholderView icon={Search} title="Coming Soon" description="This section is being built." phase="?" />;
  }
}

// ─── App root ─────────────────────────────────────────────────────────────────

function AppV2Inner() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [supportOpen, setSupportOpen] = useState(false);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const { balance, openCheckout } = useCredits();

  // Deep-link from extension: ?view=imported-loads
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view) setCurrentView(view);
  }, []);

  const handleNavigate = (view) => {
    if (view === 'support') {
      setSupportOpen(true);
      return;
    }
    if (view === 'buy-credits') {
      setBuyCreditsOpen(true);
      return;
    }
    setCurrentView(view);
  };

  return (
    <Shell currentView={currentView} onNavigate={handleNavigate} creditBalance={balance}>
      {renderView(currentView, handleNavigate)}
      {supportOpen && (
        <CoDriverV2
          context="support"
          initialOpen={true}
          onClose={() => setSupportOpen(false)}
        />
      )}
      {buyCreditsOpen && (
        <BuyCreditsModal
          onClose={() => setBuyCreditsOpen(false)}
          onPurchase={async (pkgId) => { await openCheckout(pkgId); setBuyCreditsOpen(false); }}
        />
      )}
    </Shell>
  );
}

export default function AppV2() {
  if (window.location.pathname === '/reset-password') return <ResetPassword />;
  if (window.location.pathname === '/accept-invite') return <AcceptInvite />;

  return (
    <AuthWrapper>
      <AppV2Inner />
      <Analytics />
      <SpeedInsights />
    </AuthWrapper>
  );
}
