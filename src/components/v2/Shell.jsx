import { useState, useEffect, useRef } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../hooks/useCredits';
import { useMobile } from '../../hooks/useMobile';
import { Search, Truck, Package, BarChart2, FileText, Settings } from '../../icons';

const t = tokens;

const LayoutGrid = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Home',      Icon: LayoutGrid },
  { id: 'search',    label: 'Requests',  Icon: Search },
  { id: 'loads',     label: 'Loads',     Icon: Package },
  { id: 'fleets',    label: 'Fleets',    Icon: Truck },
  { id: 'reports',   label: 'Reports',   Icon: BarChart2 },
  { id: 'estimates', label: 'Estimates', Icon: FileText },
  { id: 'settings',  label: 'Settings',  Icon: Settings },
];

// ─── Avatar menu (top-right of content area) ─────────────────────────────────

function AvatarMenu({ onNavigate, inline = false }) {
  const { user, isAdmin, signOut } = useAuth();
  const { balance } = useCredits();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const emailInitial = user?.email ? user.email[0].toUpperCase() : '?';
  const displayEmail = user?.email ?? '—';
  const role = isAdmin ? 'Admin' : 'Member';

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} style={inline ? { position: 'relative', zIndex: 1100 } : { position: 'absolute', top: '16px', right: '20px', zIndex: 1100 }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={displayEmail}
        style={{
          width: '34px',
          height: '34px',
          borderRadius: t.radius.full,
          background: open ? '#2563eb' : '#eff6ff',
          border: `1.5px solid ${open ? '#2563eb' : '#bfdbfe'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: t.font.size.sm,
          fontWeight: t.font.weight.bold,
          color: open ? '#fff' : '#2563eb',
          cursor: 'pointer',
          boxShadow: t.shadow.sm,
          transition: 'background 0.12s, color 0.12s, border-color 0.12s',
          flexShrink: 0,
        }}
      >
        {emailInitial}
      </button>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '260px',
            background: '#fff',
            border: `1px solid ${t.colors.border.default}`,
            borderRadius: t.radius['2xl'],
            boxShadow: t.shadow.lg,
            zIndex: 1200,
            overflow: 'hidden',
          }}
        >
          {/* Identity row */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${t.colors.border.default}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '38px', height: '38px',
                borderRadius: t.radius.full,
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: t.font.size.base,
                fontWeight: t.font.weight.bold,
                color: '#2563eb',
                flexShrink: 0,
              }}>
                {emailInitial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: t.font.size.sm,
                  fontWeight: t.font.weight.semibold,
                  color: t.colors.text.primary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {displayEmail}
                </div>
                <div style={{
                  fontSize: t.font.size.xs,
                  color: isAdmin ? t.colors.accent.blue : t.colors.text.muted,
                  fontWeight: isAdmin ? t.font.weight.semibold : t.font.weight.normal,
                  marginTop: '1px',
                }}>
                  {role}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => { setOpen(false); onNavigate('admin-dashboard'); }}
                    style={{
                      marginTop: '6px',
                      padding: '2px 8px',
                      background: t.colors.accent.blueLight,
                      border: `1px solid #bfdbfe`,
                      borderRadius: t.radius.md,
                      fontSize: t.font.size.xs,
                      fontWeight: t.font.weight.semibold,
                      color: t.colors.accent.blue,
                      cursor: 'pointer',
                      display: 'inline-block',
                    }}
                  >
                    Admin Dashboard →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Credits row */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.colors.border.default}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: t.font.weight.semibold }}>
                  Credits
                </div>
                <div style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.colors.text.primary, lineHeight: 1 }}>
                  {balance != null ? balance.toLocaleString() : '—'}
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); onNavigate('buy-credits'); }}
                style={{
                  padding: '6px 12px',
                  background: t.colors.accent.blue,
                  border: 'none',
                  borderRadius: t.radius.lg,
                  color: '#fff',
                  fontSize: t.font.size.xs,
                  fontWeight: t.font.weight.bold,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Buy Credits
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: '6px' }}>
            <button
              onClick={() => { setOpen(false); onNavigate('settings'); }}
              style={{
                width: '100%', textAlign: 'left',
                padding: '9px 12px',
                background: 'none', border: 'none',
                borderRadius: t.radius.lg,
                fontSize: t.font.size.sm,
                color: t.colors.text.secondary,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              ⚙️ Settings
            </button>
            <button
              onClick={signOut}
              style={{
                width: '100%', textAlign: 'left',
                padding: '9px 12px',
                background: 'none', border: 'none',
                borderRadius: t.radius.lg,
                fontSize: t.font.size.sm,
                color: '#dc2626',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              → Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BottomNav (mobile only) ──────────────────────────────────────────────────

function BottomNav({ currentView, onNavigate }) {
  return (
    <>
      <style>{`
        .bnav-item { -webkit-tap-highlight-color: transparent; }
        .bnav-item:active { opacity: 0.7; }
      `}</style>
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: t.colors.sidebar.bg,
          borderTop: `1px solid ${t.colors.sidebar.border}`,
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 900,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {MOBILE_NAV.map(({ id, label, Icon }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              className="bnav-item"
              onClick={() => onNavigate(id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 2px',
                color: active ? '#4ade80' : t.colors.sidebar.text,
                transition: 'color 0.12s',
              }}
            >
              <Icon size={20} color={active ? '#4ade80' : t.colors.sidebar.text} />
              <span style={{
                fontSize: '9px',
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.01em',
                lineHeight: 1,
                fontFamily: t.font.family,
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ─── MobileHeader ─────────────────────────────────────────────────────────────

function MobileHeader({ onNavigate }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: '56px',
      flexShrink: 0,
      background: '#ffffff',
      borderBottom: `1px solid ${t.colors.border.default}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px',
          background: 'rgba(0,139,0,0.08)',
          borderRadius: t.radius.lg,
          flexShrink: 0,
        }}>
          <img
            src="/haul-monitor-cropped.png"
            alt="Haul Monitor"
            style={{ height: '36px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </div>
        <div style={{
          fontSize: '18px',
          fontWeight: 800,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          fontFamily: t.font.family,
        }}>
          <span style={{ color: '#008b00' }}>Haul</span>
          <span style={{ color: '#0f172a' }}> Monitor</span>
        </div>
      </div>
      <AvatarMenu onNavigate={onNavigate} inline />
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell({ currentView, onNavigate, creditBalance, children }) {
  const isMobile = useMobile();

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: t.colors.page.bg,
        fontFamily: t.font.family,
      }}
    >
      {!isMobile && (
        <Sidebar
          currentView={currentView}
          onNavigate={onNavigate}
          creditBalance={creditBalance}
        />
      )}

      {/* Content area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {isMobile ? (
          <MobileHeader onNavigate={onNavigate} />
        ) : (
          <AvatarMenu onNavigate={onNavigate} />
        )}

        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isMobile ? '16px 16px 76px' : '28px 32px 40px',
            background: t.colors.page.bg,
          }}
        >
          {children}
        </main>

        {isMobile && (
          <BottomNav currentView={currentView} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}
