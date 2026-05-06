import { tokens } from '../../styles/tokens.v2';
import { useAuth } from '../../contexts/AuthContext';

const t = tokens;

const PAGE_LABELS = {
  dashboard: 'Dashboard',
  search: 'Search',
  loads: 'Loads',
  fleets: 'Fleets',
  reports: 'Reports',
  estimates: 'Estimates',
  settings: 'Settings',
  admin: 'Admin',
};

export function TopBar({ currentView, actions = null }) {
  const { user } = useAuth();
  const emailInitial = user?.email ? user.email[0].toUpperCase() : '?';
  const pageLabel = PAGE_LABELS[currentView] ?? currentView;

  return (
    <header
      style={{
        height: t.layout.topbarHeight,
        minHeight: t.layout.topbarHeight,
        background: t.colors.topbar.bg,
        borderBottom: `1px solid ${t.colors.topbar.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        gap: '16px',
        flexShrink: 0,
      }}
    >
      {/* Page title */}
      <h1
        style={{
          margin: 0,
          fontSize: t.font.size.xl,
          fontWeight: t.font.weight.bold,
          color: t.colors.text.primary,
          letterSpacing: '-0.01em',
          flex: 1,
        }}
      >
        {pageLabel}
      </h1>

      {/* Contextual actions slot */}
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}

      {/* Avatar */}
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: t.radius.full,
          background: '#eff6ff',
          border: `1px solid #bfdbfe`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: t.font.size.sm,
          fontWeight: t.font.weight.bold,
          color: '#2563eb',
          cursor: 'default',
          userSelect: 'none',
          flexShrink: 0,
        }}
        title={user?.email}
      >
        {emailInitial}
      </div>
    </header>
  );
}
