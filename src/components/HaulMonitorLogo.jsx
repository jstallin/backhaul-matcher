export const HaulMonitorLogo = ({ size = 'medium', showText = true, variant = 'horizontal' }) => {
  const sizes = {
    small: { img: 40 },
    medium: { img: 60 },
    large: { img: 80 },
    xlarge: { img: 100 }
  };

  const currentSize = sizes[size] || sizes.medium;

  // New logo already includes "HAULMONITOR" text, so all variants use the same image
  return (
    <img
      src="/haul-monitor-full.png"
      alt="Haul Monitor"
      style={{
        height: `${currentSize.img}px`,
        width: 'auto',
        objectFit: 'contain'
      }}
    />
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
