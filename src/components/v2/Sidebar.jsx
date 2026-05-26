import { tokens } from '../../styles/tokens.v2';
import { Search, Truck, Package, BarChart2, FileText, Settings, HelpCircle, LogOut, Calendar } from '../../icons';
import { useAuth } from '../../contexts/AuthContext';

const t = tokens;

const LayoutGrid = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { id: 'search',    label: 'Backhaul Requests', Icon: Search },
  { id: 'loads',     label: 'Loads',     Icon: Package },
  { id: 'fleets',     label: 'Fleets',             Icon: Truck },
  { id: 'work-week', label: 'Work Week Planning', Icon: Calendar },
  { id: 'reports',   label: 'Reports',            Icon: BarChart2 },
  { id: 'estimates', label: 'Estimates', Icon: FileText },
];

function NavItem({ id, label, Icon, active, onClick }) {
  const activeStyle = {
    background: t.colors.sidebar.activeBg,
    color: t.colors.sidebar.textActive,
    fontWeight: t.font.weight.semibold,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  };
  const idleStyle = {
    background: 'transparent',
    color: t.colors.sidebar.text,
    fontWeight: t.font.weight.medium,
    boxShadow: 'none',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: t.radius.lg,
        cursor: 'pointer',
        fontSize: t.font.size.base,
        letterSpacing: '0.01em',
        marginBottom: '2px',
        userSelect: 'none',
        transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
        ...(active ? activeStyle : idleStyle),
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = t.colors.sidebar.hoverBg;
          e.currentTarget.style.color = t.colors.sidebar.textHover;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = t.colors.sidebar.text;
        }
      }}
    >
      <Icon
        size={18}
        color={active ? t.colors.sidebar.textActive : t.colors.sidebar.text}
      />
      {label}
    </div>
  );
}

export function Sidebar({ currentView, onNavigate, creditBalance = null }) {
  const { user, signOut, isAdmin } = useAuth();
  const emailInitial = user?.email ? user.email[0].toUpperCase() : '?';
  const navItems = NAV_ITEMS.filter(({ id }) => id !== 'work-week' || isAdmin);

  return (
    <aside
      style={{
        width: t.layout.sidebarWidth,
        minWidth: t.layout.sidebarWidth,
        height: '100vh',
        background: t.colors.sidebar.bg,
        borderRight: `1px solid ${t.colors.sidebar.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Logo: icon chip + wordmark */}
      <div style={{ padding: '18px 16px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: t.radius.lg,
          backdropFilter: 'blur(4px)',
          flexShrink: 0,
        }}>
          <img
            src="/haul-monitor-cropped.png"
            alt="Haul Monitor"
            style={{ height: '32px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </div>
        <div style={{
          fontSize: '18px',
          fontWeight: 800,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          fontFamily: t.font.family,
        }}>
          <span style={{ color: '#4ade80' }}>Haul</span>
          <span style={{ color: '#ffffff' }}> Monitor</span>
        </div>
      </div>

      {/* Primary nav */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {navItems.map(({ id, label, Icon }) => (
          <NavItem
            key={id}
            id={id}
            label={label}
            Icon={Icon}
            active={currentView === id}
            onClick={() => onNavigate(id)}
          />
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ padding: '8px 8px 0' }}>
        <div style={{ margin: '0 4px 8px', borderTop: `1px solid ${t.colors.sidebar.divider}` }} />

        <NavItem
          id="help"
          label="Help & Support"
          Icon={HelpCircle}
          active={currentView === 'help'}
          onClick={() => onNavigate('help')}
        />
        <NavItem
          id="settings"
          label="Settings"
          Icon={Settings}
          active={currentView === 'settings'}
          onClick={() => onNavigate('settings')}
        />

        {creditBalance !== null && (
          <div
            style={{
              margin: '8px 4px',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: t.radius.lg,
              border: `1px solid ${t.colors.sidebar.divider}`,
              cursor: 'pointer',
            }}
            onClick={() => onNavigate('buy-credits')}
          >
            <div style={{ fontSize: t.font.size.xs, color: t.colors.sidebar.text, fontWeight: t.font.weight.medium, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>
              Credits
            </div>
            <div style={{ fontSize: t.font.size.lg, color: '#f8fafc', fontWeight: t.font.weight.bold }}>
              {creditBalance.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* User area */}
      <div
        style={{
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderTop: `1px solid ${t.colors.sidebar.border}`,
          marginTop: '4px',
        }}
      >
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: t.radius.full,
            background: 'rgba(37,99,235,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: t.font.size.sm,
            fontWeight: t.font.weight.bold,
            color: '#93c5fd',
            flexShrink: 0,
          }}
        >
          {emailInitial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: t.font.size.sm, color: t.colors.sidebar.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email ?? '…'}
          </div>
        </div>
        <button
          title="Sign out"
          onClick={signOut}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: t.colors.sidebar.text, borderRadius: t.radius.md, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f8fafc'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = t.colors.sidebar.text; }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
