import { useState, useEffect, useRef } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../hooks/useCredits';

const t = tokens;

// ─── Avatar menu (top-right of content area) ─────────────────────────────────

function AvatarMenu({ onNavigate }) {
  const { user, isAdmin, signOut } = useAuth();
  const { balance, openCheckout } = useCredits();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const emailInitial = user?.email ? user.email[0].toUpperCase() : '?';
  const displayEmail = user?.email ?? '—';
  const role = isAdmin ? 'Admin' : 'Member';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 200 }}>
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
            zIndex: 300,
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
                onClick={() => { setOpen(false); openCheckout('standard'); }}
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

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell({ currentView, onNavigate, creditBalance, children }) {
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
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        creditBalance={creditBalance}
      />

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
        <AvatarMenu onNavigate={onNavigate} />

        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 32px 40px',
            background: t.colors.page.bg,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
