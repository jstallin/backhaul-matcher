import { tokens } from '../../styles/tokens.v2';
import { Calendar } from '../../icons';

const t = tokens;

export function WorkWeekView() {
  return (
    <div style={{
      padding: '32px 24px',
      maxWidth: '720px',
      margin: '0 auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '8px',
      }}>
        <Calendar size={28} color={t.colors.accent.blue} />
        <h1 style={{
          fontSize: t.font.size['2xl'],
          fontWeight: t.font.weight.bold,
          color: t.colors.text.primary,
          margin: 0,
        }}>
          Work Week Planning
        </h1>
      </div>
      <p style={{
        fontSize: t.font.size.base,
        color: t.colors.text.secondary,
        marginBottom: '40px',
        marginTop: '4px',
      }}>
        Plan your optimal work week — find the best return load first, then build the week forward from that anchor.
      </p>

      <div style={{
        background: t.colors.page.cardBg,
        border: `1px solid ${t.colors.page.cardBorder}`,
        borderRadius: t.radius.xl,
        boxShadow: t.shadow.card,
        padding: '48px 32px',
        textAlign: 'center',
      }}>
        <Calendar size={48} color={t.colors.text.tertiary} style={{ marginBottom: '16px' }} />
        <h2 style={{
          fontSize: t.font.size.xl,
          fontWeight: t.font.weight.semibold,
          color: t.colors.text.primary,
          margin: '0 0 8px',
        }}>
          Coming Soon
        </h2>
        <p style={{
          fontSize: t.font.size.sm,
          color: t.colors.text.secondary,
          maxWidth: '360px',
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          Work Week Planning is in development. It will let you plan a full week of loads —
          working backwards from your return trip to maximize revenue per mile.
        </p>
      </div>
    </div>
  );
}
