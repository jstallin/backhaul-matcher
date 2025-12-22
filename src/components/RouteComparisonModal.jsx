import { X } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { RouteMap } from './RouteMap';
import { RouteStats } from './RouteStats';

export const RouteComparisonModal = ({ route, backhaul, onClose, onAssign }) => {
  const { colors } = useTheme();

  if (!route) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: colors.background.overlay,
        borderRadius: '16px',
        maxWidth: '1400px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        border: `1px solid ${colors.border.accent}`,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        animation: 'slideUp 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: `1px solid ${colors.border.secondary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: colors.background.overlay,
          zIndex: 1
        }}>
          <div>
            <h2 style={{
              margin: '0 0 4px 0',
              fontSize: '24px',
              fontWeight: 900,
              color: colors.text.primary
            }}>
              Route Comparison
            </h2>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: colors.text.secondary
            }}>
              {route.truck_number} · {route.origin_city} → {route.dest_city}
              {backhaul && ` → ${backhaul.delivery_city}`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: colors.background.tertiary,
              border: `1px solid ${colors.border.accent}`,
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.background.hover;
              e.currentTarget.style.borderColor = colors.accent.red;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.background.tertiary;
              e.currentTarget.style.borderColor = colors.border.accent;
            }}
          >
            <X size={20} color={colors.text.primary} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 400px',
            gap: '24px',
            marginBottom: '24px'
          }}>
            {/* Map */}
            <div>
              <RouteMap route={route} backhaul={backhaul} showComparison={true} />
              
              {/* Legend */}
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: colors.background.secondary,
                borderRadius: '8px',
                display: 'flex',
                gap: '24px',
                justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px',
                    height: '3px',
                    background: colors.accent.orange,
                    borderRadius: '2px'
                  }} />
                  <span style={{ fontSize: '12px', color: colors.text.secondary }}>
                    Primary Route
                  </span>
                </div>
                {backhaul && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '24px',
                      height: '3px',
                      background: colors.accent.green,
                      borderRadius: '2px',
                      backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, ' + colors.background.secondary + ' 4px, ' + colors.background.secondary + ' 8px)'
                    }} />
                    <span style={{ fontSize: '12px', color: colors.text.secondary }}>
                      Backhaul Route
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div>
              <RouteStats route={route} backhaul={backhaul} />
            </div>
          </div>

          {/* Actions */}
          {backhaul && onAssign && (
            <div style={{
              borderTop: `1px solid ${colors.border.secondary}`,
              paddingTop: '24px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  background: colors.background.secondary,
                  border: `1px solid ${colors.border.accent}`,
                  borderRadius: '8px',
                  color: colors.text.primary,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.background.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.background.secondary;
                }}
              >
                Close
              </button>
              <button
                onClick={() => onAssign(backhaul)}
                style={{
                  padding: '12px 24px',
                  background: `linear-gradient(135deg, ${colors.accent.green} 0%, #059669 100%)`,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                }}
              >
                Assign Route to Driver
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
