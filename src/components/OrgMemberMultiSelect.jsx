import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * #129: search-as-you-type multi-select of org members, for granting a fleet
 * view-only access. Modeled on CityStateInput (typeahead + keyboard nav) and the
 * fleet "modes" chip pattern (selected members render as removable chips). Members
 * are passed in (already fetched from /api/orgs/members), so filtering is local.
 *
 * Props:
 *   value       - array of selected user_ids
 *   members     - [{ user_id, email, full_name }] candidates (caller excludes self)
 *   onChange    - (nextUserIds[]) => void
 *   disabled, inputStyle, accentColor, placeholder
 */
export function OrgMemberMultiSelect({
  value = [],
  members = [],
  onChange,
  disabled = false,
  inputStyle = {},
  accentColor = '#2563eb',
  placeholder = 'Search org members by name or email…',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef(null);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const byId = useMemo(() => {
    const m = {};
    for (const u of members) m[u.user_id] = u;
    return m;
  }, [members]);

  const label = (u) => u?.full_name || u?.email || 'Unknown member';

  // Candidates = not already selected, matching the query (name or email).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selected = new Set(value);
    return members
      .filter(u => !selected.has(u.user_id))
      .filter(u => !q || label(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, value, query]);

  const add = (uid) => {
    if (!value.includes(uid)) onChange([...value, uid]);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  };
  const remove = (uid) => onChange(value.filter(id => id !== uid));

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && !query && value.length) { remove(value[value.length - 1]); return; }
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); add(matches[highlight].user_id); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* selected chips */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {value.map(uid => (
            <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '999px', fontSize: '13px', background: `${accentColor}14`, border: `1px solid ${accentColor}55`, color: '#1e293b' }}>
              {label(byId[uid]) }
              {!disabled && (
                <button type="button" onClick={() => remove(uid)} aria-label={`Remove ${label(byId[uid])}`}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          style={inputStyle}
        />
      )}

      {open && !disabled && matches.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 5000, overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
          {matches.map((u, i) => (
            <div
              key={u.user_id}
              onMouseDown={(e) => { e.preventDefault(); add(u.user_id); }}
              onMouseEnter={() => setHighlight(i)}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '14px', color: '#1e293b', background: i === highlight ? `${accentColor}14` : 'transparent', borderLeft: i === highlight ? `3px solid ${accentColor}` : '3px solid transparent' }}
            >
              <div style={{ fontWeight: 600 }}>{u.full_name || u.email}</div>
              {u.full_name && <div style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
