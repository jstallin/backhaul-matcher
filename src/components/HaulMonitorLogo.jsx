export const HaulMonitorLogo = ({ size = 'medium', showText = true, variant = 'horizontal' }) => {
  const sizes = {
    small: { img: 40, haul: 20, monitor: 20 },
    medium: { img: 60, haul: 32, monitor: 32 },
    large: { img: 80, haul: 48, monitor: 48 },
    xlarge: { img: 100, haul: 64, monitor: 64 }
  };

  const currentSize = sizes[size] || sizes.medium;

  // Brand colors matching the logo
  const colors = {
    haul: '#D89F38',      // Golden amber from monitor scales
    monitor: '#2C3744'    // Charcoal from lizard body
  };

  // If variant is 'full', use the full logo PNG with text
  if (variant === 'full') {
    return (
      <img 
        src="/haul-monitor-full.png" 
        alt="Haul Monitor"
        style={{
          height: `${currentSize.img * 1.2}px`,
          width: 'auto',
          objectFit: 'contain'
        }}
      />
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: size === 'small' ? '8px' : '12px'
    }}>
      {/* Monitor Lizard Icon Only */}
      <img 
        src="/haul-monitor-icon.png" 
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
          alignItems: 'baseline',
          gap: '4px'
        }}>
          <span style={{
            fontSize: `${currentSize.haul}px`,
            fontWeight: 900,
            color: colors.haul,
            letterSpacing: '-0.5px',
            fontFamily: 'Arial, sans-serif'
          }}>
            HAUL
          </span>
          <span style={{
            fontSize: `${currentSize.monitor}px`,
            fontWeight: 900,
            color: colors.monitor,
            letterSpacing: '-0.5px',
            fontFamily: 'Arial, sans-serif'
          }}>
            MONITOR
          </span>
        </div>
      )}
    </div>
  );
};

export const HaulMonitorBrand = ({ tagline = true, size = 'medium', variant = 'horizontal' }) => {
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
      <HaulMonitorLogo size={size} variant={variant} />
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
