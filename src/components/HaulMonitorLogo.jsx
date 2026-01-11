export const HaulMonitorLogo = ({ size = 'medium', showText = true, textColor = 'auto' }) => {
  const sizes = {
    small: { img: 40, haul: 20, monitor: 20 },
    medium: { img: 60, haul: 32, monitor: 32 },
    large: { img: 80, haul: 48, monitor: 48 },
    xlarge: { img: 100, haul: 64, monitor: 64 }
  };

  const currentSize = sizes[size] || sizes.medium;

  // Color scheme
  const colors = {
    haul: '#F0A030',      // Golden/amber from the logo
    monitor: '#2C3E50'    // Dark charcoal from the logo
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: size === 'small' ? '8px' : '12px'
    }}>
      {/* Monitor Lizard Logo */}
      <img 
        src="/haul-monitor-logo.png" 
        alt="Haul Monitor"
        style={{
          height: `${currentSize.img}px`,
          width: 'auto',
          objectFit: 'contain'
        }}
      />
      
      {/* Brand Text */}
      {showText && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          lineHeight: 1
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '4px'
          }}>
            <span style={{
              fontSize: `${currentSize.haul}px`,
              fontWeight: 900,
              color: textColor === 'auto' ? colors.haul : textColor,
              letterSpacing: '-0.5px'
            }}>
              HAUL
            </span>
            <span style={{
              fontSize: `${currentSize.monitor}px`,
              fontWeight: 900,
              color: textColor === 'auto' ? colors.monitor : textColor,
              letterSpacing: '-0.5px'
            }}>
              MONITOR
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export const HaulMonitorBrand = ({ tagline = true, size = 'medium' }) => {
  const sizes = {
    small: { tagline: 10 },
    medium: { tagline: 13 },
    large: { tagline: 16 }
  };

  const currentSize = sizes[size] || sizes.medium;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      <HaulMonitorLogo size={size} />
      {tagline && (
        <div style={{
          fontSize: `${currentSize.tagline}px`,
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontWeight: 600
        }}>
          Smart Return Route Optimization
        </div>
      )}
    </div>
  );
};
