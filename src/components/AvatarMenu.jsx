import { useState, useRef, useEffect } from 'react';
import { User, Settings, LogOut } from '../icons';
import { useAuth } from '../contexts/AuthContext';

export const AvatarMenu = () => {
  const { user, signOut } = useAuth();
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
    // TODO: Navigate to settings page when implemented
    alert('Settings feature coming soon!');
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
            ? 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)'
            : 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
          border: isOpen ? '2px solid #00d4ff' : '2px solid transparent',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 700,
          transition: 'all 0.2s',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
          }
        }}
      >
        {getInitials()}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: '240px',
          background: 'rgba(26, 31, 58, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {/* User Info Section */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#e8eaed',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {userName}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#8b92a7'
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
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Settings size={18} color="#8b92a7" />
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#e8eaed'
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
              gap: '12px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LogOut size={18} color="#ef4444" />
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#ef4444'
            }}>
              Sign Out
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
