// #30: tells the user, at the top of the results, that the search was scoped to
// their selected transport modes (fleet modes unioned with the request's). Renders
// nothing when no modes are selected — an empty selection means "no preference",
// so the search isn't mode-restricted and there's nothing to disclose.
//
// Palette-driven so it matches either theme (v1 colors / v2 tokens). One shared
// component keeps the copy identical across both UX versions.
import { AlertCircle } from '../icons';

export function SearchModesNotice({ modes, palette = {}, style = {} }) {
  const list = Array.isArray(modes) ? modes.filter(Boolean) : [];
  if (list.length === 0) return null;

  const p = {
    accent: '#2563eb',
    text: '#0f172a',
    bg: '#eff6ff',
    border: '#bfdbfe',
    ...palette,
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '10px 14px', marginBottom: '16px',
        background: p.bg, border: `1px solid ${p.border}`, borderRadius: '10px',
        fontSize: '13px', color: p.text, lineHeight: 1.5,
        ...style,
      }}
    >
      <AlertCircle size={15} color={p.accent} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>
        Search limited to your selected mode{list.length !== 1 ? 's' : ''}:{' '}
        <strong>{list.join(', ')}</strong>. Adjust modes on the fleet profile or the request form.
      </span>
    </div>
  );
}
