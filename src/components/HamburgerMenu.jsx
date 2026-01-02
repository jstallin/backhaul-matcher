import { useState, useRef, useEffect } from 'react';
import { Menu, X, Truck, Plus, FileText, TrendingUp } from '../icons';
import { useTheme } from '../contexts/ThemeContext';

export const HamburgerMenu = ({ currentView, onNavigate }) => {
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

  const handleMenuClick = (view) => {
    onNavigate(view);
    setIsOpen(false);
  };

  const menuItems = [
    { 
      id: 'fleets', 
      label: 'Fleets', 
      icon: Truck,
      description: 'View and manage all fleets'
    },
    { 
      id: 'start-request', 
      label: 'Start Request', 
      icon: Plus,
      description: 'Create new backhaul request'
    },
    { 
      id: 'open-requests', 
      label: 'Open Requests', 
      icon: FileText,
      description: 'View active backhaul requests'
    },
    { 
      id: 'fleet-reports', 
      label: 'Fleet Reports', 
      icon: TrendingUp,
      description: 'Analytics and performance reports'
    }
  ];

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '10px 16px',
          background: isOpen 
            ? `linear-gradient(135deg, ${colors.accent.primary}20 0%, ${colors.accent.primary}10 100%)`
            : colors.background.secondary,
          border: `2px solid ${isOpen ? colors.accent.primary : colors.border.accent}`,
          borderRadius: '8px',
          color: colors.text.primary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: 700,
          transition: 'all 0.2s',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.background = colors.background.hover;
            e.currentTarget.style.borderColor = colors.accent.primary;
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.background = colors.background.secondary;
            e.currentTarget.style.borderColor = colors.border.accent;
          }
        }}
      >
        {isOpen ? <X size={20} color={colors.accent.primary} /> : <Menu size={20} />}
        Menu
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: '280px',
          background: colors.background.overlay,
          border: `1px solid ${colors.border.accent}`,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = 
              (item.id === 'routes' && currentView === 'search') ||
              (item.id === 'truck-search' && currentView === 'truck-search') ||
              (item.id === 'fleet-management' && currentView === 'fleet-management');

            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: isActive ? `${colors.accent.primary}20` : 'transparent',
                  border: 'none',
                  borderBottom: index < menuItems.length - 1 ? `1px solid ${colors.border.secondary}` : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = colors.background.tertiary;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon 
                  size={20} 
                  color={isActive ? colors.accent.primary : colors.text.secondary} 
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: isActive ? colors.accent.primary : colors.text.primary,
                    marginBottom: '4px'
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: colors.text.secondary,
                    lineHeight: '1.4'
                  }}>
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
