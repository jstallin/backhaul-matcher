import { useState, useRef, useEffect } from 'react';
import { Menu, X, Truck, Search, Calendar } from '../icons';

export const HamburgerMenu = ({ currentView, onNavigate }) => {
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
      id: 'routes', 
      label: 'Active Route Planning', 
      icon: Calendar,
      description: 'View and plan backhauls for active routes'
    },
    { 
      id: 'truck-search', 
      label: 'Truck Search', 
      icon: Search,
      description: 'Search backhaul for specific truck'
    },
    { 
      id: 'fleet-management', 
      label: 'Manage Fleet', 
      icon: Truck,
      description: 'Manage trucks, drivers, and fleet profile'
    }
  ];

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '10px',
          background: isOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          color: '#e8eaed',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: 600,
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.background = 'transparent';
        }}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
        Menu
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: '280px',
          background: 'rgba(26, 31, 58, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
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
                  background: isActive ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                  border: 'none',
                  borderBottom: index < menuItems.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon 
                  size={20} 
                  color={isActive ? '#00d4ff' : '#8b92a7'} 
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: isActive ? '#00d4ff' : '#e8eaed',
                    marginBottom: '4px'
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#8b92a7',
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
