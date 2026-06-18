// #163: Contact Broker dialog — Call / Text / Email for a load's broker. One shared
// component for v1 + v2 (palette-themed). Controlled via `open`/`onClose`. Reuses the same
// tel:/sms:/mailto: links the load cards use inline.
import { Phone, Mail, X } from '../icons';

export function ContactBrokerDialog({ open, onClose, phone, email, broker, palette }) {
  if (!open) return null;
  const p = { accent: '#2563eb', text: '#0f172a', textMuted: '#64748b', border: '#e2e8f0', cardBg: '#ffffff', ...palette };
  const hasNone = !phone && !email;
  const row = {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
    border: `1px solid ${p.border}`, borderRadius: '10px', textDecoration: 'none',
    color: p.text, fontSize: '14px', fontWeight: 600,
  };
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: p.cardBg, borderRadius: '14px', width: '100%', maxWidth: '380px', padding: '22px', border: `1px solid ${p.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: p.text }}>
            Contact Broker{broker ? ` — ${broker}` : ''}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted, padding: '4px' }}><X size={16} /></button>
        </div>

        {hasNone ? (
          <div style={{ color: p.textMuted, fontSize: '14px', padding: '8px 0' }}>
            No broker contact info available for this load.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {phone && <a href={`tel:${phone}`} style={row}><Phone size={16} color={p.accent} /> Call {phone}</a>}
            {phone && <a href={`sms:${phone}`} style={row}><Phone size={16} color={p.accent} /> Text {phone}</a>}
            {email && <a href={`mailto:${email}`} style={{ ...row, wordBreak: 'break-all' }}><Mail size={16} color={p.accent} /> {email}</a>}
          </div>
        )}
      </div>
    </div>
  );
}
