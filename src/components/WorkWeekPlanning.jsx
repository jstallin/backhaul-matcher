import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { HaulMonitorLogo } from './HaulMonitorLogo';
import { Calendar } from '../icons';
import { useTheme } from '../contexts/ThemeContext';

export const WorkWeekPlanning = ({ onMenuNavigate }) => {
  const { colors } = useTheme();

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.card,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HamburgerMenu currentView="work-week-planning" onNavigate={onMenuNavigate} />
          <HaulMonitorLogo size={28} />
        </div>
        <AvatarMenu onNavigateToSettings={() => onMenuNavigate('settings')} />
      </div>

      {/* Content */}
      <div style={{
        padding: '32px 16px',
        maxWidth: '640px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '8px',
        }}>
          <Calendar size={24} color={colors.accent.primary} />
          <h1 style={{
            fontSize: '22px',
            fontWeight: 700,
            color: colors.text.primary,
            margin: 0,
          }}>
            Work Week Planning
          </h1>
        </div>
        <p style={{
          fontSize: '14px',
          color: colors.text.secondary,
          marginBottom: '32px',
          marginTop: '4px',
        }}>
          Plan your optimal work week — find the best return load first, then build the week forward from that anchor.
        </p>

        <div style={{
          background: colors.background.card,
          border: `1px solid ${colors.border.secondary}`,
          borderRadius: '12px',
          padding: '40px 24px',
          textAlign: 'center',
        }}>
          <Calendar size={44} color={colors.text.tertiary} style={{ marginBottom: '14px' }} />
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: colors.text.primary,
            margin: '0 0 8px',
          }}>
            Coming Soon
          </h2>
          <p style={{
            fontSize: '13px',
            color: colors.text.secondary,
            maxWidth: '320px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            Work Week Planning is in development. It will let you plan a full week of loads —
            working backwards from your return trip to maximize revenue per mile.
          </p>
        </div>
      </div>
    </div>
  );
};
