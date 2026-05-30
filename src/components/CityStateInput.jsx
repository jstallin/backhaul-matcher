import { useState, useRef, useEffect, useCallback } from 'react';
import { searchCityState, geocodeAddress } from '../utils/pcMilerClient';

/**
 * Permissive city/state typeahead (item 002 — typo prevention).
 *
 * Suggests valid "City, ST" matches as the user types, but still accepts free
 * text. On blur, if the user didn't pick a suggestion, the value is geocoded to
 * validate it — onResolve fires with coords on success or null on failure, so the
 * parent can gate saving and surface a typo warning.
 *
 * Props:
 *   value        - controlled string ("City, ST")
 *   onChange     - (string) => void, fired on every keystroke
 *   onResolve    - ({ city, state, lat, lng, label } | null) => void
 *   onResolvingChange - (bool) => void, optional; true while blur-geocoding
 *   placeholder, disabled, inputStyle, accentColor
 */
export function CityStateInput({
  value,
  onChange,
  onResolve,
  onResolvingChange,
  placeholder = 'City, ST',
  disabled = false,
  inputStyle = {},
  accentColor = '#2563eb',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef(null);
  const pickedRef = useRef(false); // suppress blur-geocode when a suggestion was clicked
  const reqIdRef = useRef(0);
  const blurTimer = useRef(null);

  useEffect(() => () => { clearTimeout(debounceRef.current); clearTimeout(blurTimer.current); }, []);

  const setResolvingState = useCallback((v) => {
    setResolving(v);
    onResolvingChange?.(v);
  }, [onResolvingChange]);

  const runSearch = (q) => {
    clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    const reqId = ++reqIdRef.current;
    debounceRef.current = setTimeout(async () => {
      const results = await searchCityState(q);
      if (reqId !== reqIdRef.current) return; // a newer keystroke superseded this
      setSuggestions(results);
      setOpen(results.length > 0);
      setHighlight(-1);
    }, 250);
  };

  const handleChange = (e) => {
    pickedRef.current = false;
    onChange(e.target.value);
    runSearch(e.target.value);
  };

  const pickSuggestion = (s) => {
    pickedRef.current = true;
    clearTimeout(blurTimer.current);
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
    setHighlight(-1);
    onResolve?.({ city: s.city, state: s.state, lat: s.lat ?? null, lng: s.lng ?? null, label: s.label });
  };

  // On blur, validate free-typed text via geocode (unless a suggestion was picked).
  const handleBlur = () => {
    blurTimer.current = setTimeout(async () => {
      setOpen(false);
      if (pickedRef.current) return;
      const q = (value || '').trim();
      if (!q) { onResolve?.(null); return; }
      setResolvingState(true);
      const geo = await geocodeAddress(q);
      setResolvingState(false);
      if (geo?.lat != null && geo?.lng != null) {
        const [city = '', state = ''] = (geo.label || q).split(',').map(s => s.trim());
        onResolve?.({ city, state, lat: geo.lat, lng: geo.lng, label: geo.label || q });
      } else {
        onResolve?.(null);
      }
    }, 150);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); pickSuggestion(suggestions[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        style={inputStyle}
      />
      {resolving && (
        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#64748b' }}>
          checking…
        </span>
      )}
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 5000, overflow: 'hidden', maxHeight: '240px', overflowY: 'auto' }}>
          {suggestions.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
              onMouseEnter={() => setHighlight(i)}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '14px', color: '#1e293b', background: i === highlight ? `${accentColor}14` : 'transparent', borderLeft: i === highlight ? `3px solid ${accentColor}` : '3px solid transparent' }}
            >
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
