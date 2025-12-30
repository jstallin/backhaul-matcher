import { Plus } from '../icons';
import { useTheme } from '../contexts/ThemeContext';

export const StartRequest = () => {
  const { colors } = useTheme();

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.background.primary,
      color: colors.text.primary
    }}>
      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: '32px',
            fontWeight: 900,
            background: `linear-gradient(135deg, ${colors.accent.orange} 0%, ${colors.accent.cyan} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Start Request
          </h1>
          <p style={{
            margin: 0,
            color: colors.text.secondary,
            fontSize: '15px'
          }}>
            Create a new backhaul request
          </p>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: colors.background.card,
          borderRadius: '16px',
          border: `1px solid ${colors.border.primary}`
        }}>
          <Plus size={64} color={colors.text.tertiary} style={{ marginBottom: '24px' }} />
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '24px',
            fontWeight: 800,
            color: colors.text.primary
          }}>
            Start Request Page
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
