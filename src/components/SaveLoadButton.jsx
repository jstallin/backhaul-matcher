// #163: Save/bookmark toggle for a load. One shared component for v1 + v2; the host passes
// a palette to match the theme and owns persistence (onToggle). Presentational only.
import { Bookmark } from '../icons';

export function SaveLoadButton({ saved, onToggle, palette, label = true, size = 15, busy = false, style = {} }) {
  const p = { accent: '#2563eb', border: '#e2e8f0', textMuted: '#64748b', ...palette };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!busy && onToggle) onToggle(); }}
      title={saved ? 'Saved — click to remove' : 'Save this load'}
      aria-label={saved ? 'Remove saved load' : 'Save this load'}
      disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: label ? '6px 10px' : '6px',
        background: saved ? `${p.accent}14` : 'none', border: `1px solid ${saved ? p.accent : p.border}`,
        borderRadius: '8px', cursor: busy ? 'wait' : 'pointer', color: saved ? p.accent : p.textMuted,
        fontSize: '13px', fontWeight: 700, opacity: busy ? 0.6 : 1, ...style,
      }}
    >
      <Bookmark size={size} color={saved ? p.accent : 'currentColor'} fill={saved ? p.accent : 'none'} />
      {label && (saved ? 'Saved' : 'Save')}
    </button>
  );
}
