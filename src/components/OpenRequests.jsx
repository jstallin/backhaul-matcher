import { FileText, Truck } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';

export const OpenRequests = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.background.primary,
      color: colors.text.primary
    }}>
      {/* Main Header with Navigation */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color={colors.accent.orange} strokeWidth={2.5} />
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: '28px', 
                fontWeight: 900,
                letterSpacing: '-0.02em',
                background: `linear-gradient(135deg, ${colors.accent.orange} 0%, ${colors.accent.cyan} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                BACKHAUL
              </h1>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary, fontWeight: 500, letterSpacing: '0.05em' }}>
                SMART RETURN ROUTE OPTIMIZATION
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu 
              currentView="open-requests"
              onNavigate={onMenuNavigate}
            />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      {/* Page Header */}
      <div style={{
        padding: '24px 32px',
        background: colors.background.secondary,
        borderBottom: `1px solid ${colors.border.secondary}`
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{
            margin: '0 0 8px 0',
            fontSize: '32px',
            fontWeight: 900,
            color: colors.text.primary
          }}>
            Open Requests
          </h2>
          <p style={{
            margin: 0,
            color: colors.text.secondary,
            fontSize: '15px'
          }}>
            View and manage active backhaul requests
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: colors.background.card,
          borderRadius: '16px',
          border: `1px solid ${colors.border.primary}`
        }}>
          <FileText size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '24px',
            fontWeight: 800,
            color: colors.text.primary
          }}>
            Open Requests Page
          </h2>
          <p style={{
            margin: 0,
            color: colors.text.secondary,
            fontSize: '15px',
            maxWidth: '500px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            Functionality coming soon...
          </p>
        </div>
      </div>
    </div>
  );
};
