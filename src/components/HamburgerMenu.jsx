import { useState, useRef, useEffect } from 'react';
import { Menu, X, Truck, Plus, FileText, TrendingUp, DollarSign, Package, Shield, HelpCircle } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export const HamburgerMenu = ({ currentView, onNavigate }) => {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
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
      id: 'dashboard',
      label: 'Dashboard',
      icon: TrendingUp,
      description: 'At-a-glance fleet overview'
    },
    {
      id: 'fleets',
      label: 'Fleets',
      icon: Truck,
      description: 'View and manage all fleets'
    },
    { 
      id: 'start-request', 
      label: 'Start Backhaul Request',
      icon: Plus,
      description: 'Create new backhaul request'
    },
    {
      id: 'open-requests',
      label: 'Open Backhaul Requests',
      icon: FileText,
      description: 'View active backhaul requests'
    },
    {
      id: 'start-estimate-request',
      label: 'Create Estimate Request',
      icon: DollarSign,
      description: 'Create a new estimate request'
    },
    {
      id: 'open-estimate-requests',
      label: 'Open Estimate Requests',
      icon: FileText,
      description: 'View active estimate requests'
    },
    {
      id: 'fleet-reports',
      label: 'Fleet Reports',
      icon: TrendingUp,
      description: 'Analytics and performance reports'
    },
    // {
    //   id: 'imported-loads',
    //   label: 'Imported Loads',
    //   icon: Package,
    //   description: 'Loads from DAT and other load boards'
    // }
  ];

  const adminItems = isAdmin ? [
    {
      id: 'admin-dashboard',
      label: 'Admin Dashboard',
      icon: Shield,
      description: 'System health & data overview',
      isAdmin: true,
    }
  ] : [];

  const supportItem = {
    id: 'support',
    label: 'Help & Support',
    icon: HelpCircle,
    description: 'Get answers or contact support',
    isSupport: true,
  };

  const allItems = [...menuItems, ...adminItems, supportItem];

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
          left: '0',
          right: '0',
          minWidth: '280px',
          maxWidth: '320px',
          background: colors.background.overlay,
          border: `1px solid ${colors.border.accent}`,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {allItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.id === currentView;
            const itemColor = item.isAdmin ? '#a855f7' : item.isSupport ? '#3b82f6' : colors.accent.primary;

            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: isActive ? `${itemColor}20` : item.isAdmin ? `#a855f710` : item.isSupport ? `#3b82f610` : 'transparent',
                  border: 'none',
                  borderTop: (item.isAdmin || item.isSupport) ? `1px solid ${colors.border.secondary}` : 'none',
                  borderBottom: index < allItems.length - 1 && !allItems[index + 1]?.isAdmin && !allItems[index + 1]?.isSupport ? `1px solid ${colors.border.secondary}` : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  minHeight: '56px'
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
                  color={isActive ? itemColor : item.isAdmin ? '#a855f7' : item.isSupport ? '#3b82f6' : colors.text.secondary}
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: isActive ? itemColor : item.isAdmin ? '#a855f7' : item.isSupport ? '#3b82f6' : colors.text.primary,
                    marginBottom: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: colors.text.secondary,
                    lineHeight: '1.4',
                    whiteSpace: 'normal'
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
