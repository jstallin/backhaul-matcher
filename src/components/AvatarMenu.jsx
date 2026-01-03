import { useState, useRef, useEffect } from 'react';
import { User, Settings, LogOut } from '../icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export const AvatarMenu = ({ onNavigateToSettings }) => {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
  };

  const handleSettings = () => {
    setIsOpen(false);
    if (onNavigateToSettings) {
      onNavigateToSettings();
    }
  };

  // Get user initials or first letter of email
  const getInitials = () => {
    const name = user?.user_metadata?.full_name;
    if (name) {
      const parts = name.split(' ');
      return parts.length > 1 
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : name.substring(0, 2).toUpperCase();
    }
    return user?.email ? user.email[0].toUpperCase() : 'U';
  };

  const userName = user?.user_metadata?.full_name || user?.email || 'User';
  const userRole = user?.user_metadata?.role === 'driver' ? 'Driver' : 'Fleet Manager';

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: isOpen 
            ? colors.accent.secondary
            : colors.accent.primary,
          border: `2px solid ${isOpen ? colors.accent.tertiary : colors.accent.primary}`,
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 700,
          transition: 'all 0.2s',
          boxShadow: isOpen ? '0 6px 16px rgba(94, 160, 219, 0.3)' : '0 2px 8px rgba(94, 160, 219, 0.2)'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.background = colors.accent.secondary;
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(94, 160, 219, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = colors.accent.primary;
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(94, 160, 219, 0.2)';
          }
        }}
      >
        {getInitials()}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <style>{`
            .avatar-menu-dropdown {
              position: absolute;
              top: calc(100% + 8px);
              right: 0;
              min-width: 220px;
              max-width: 280px;
            }
            @media (max-width: 640px) {
              .avatar-menu-dropdown {
                right: auto;
                left: 50%;
                transform: translateX(-50%);
                max-width: calc(100vw - 32px);
              }
            }
          `}</style>
          <div 
            className="avatar-menu-dropdown"
            style={{
              background: colors.background.overlay,
              border: `1px solid ${colors.border.accent}`,
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(10px)',
              zIndex: 1000,
              overflow: 'hidden'
            }}>
            {/* User Info Section */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${colors.border.secondary}`
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: colors.text.primary,
                marginBottom: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {userName}
              </div>
              <div style={{
                fontSize: '12px',
                color: colors.text.secondary
              }}>
                {userRole}
              </div>
            </div>

            {/* Menu Items */}
            <button
              onClick={handleSettings}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${colors.border.secondary}`,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minHeight: '48px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.background.tertiary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Settings size={18} color={colors.text.secondary} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: colors.text.primary,
                whiteSpace: 'nowrap'
              }}>
                Settings
              </span>
            </button>

            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minHeight: '48px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <LogOut size={18} color={colors.accent.danger} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: colors.accent.danger,
                whiteSpace: 'nowrap'
              }}>
                Sign Out
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
