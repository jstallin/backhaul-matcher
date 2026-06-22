// Generic share UI (#175): the Email / Text / Copy chooser + dialogs, extracted
// from LoadShareMenu (#82) so loads and estimate reports share one source of truth.
// The host supplies the content/send via onCopyText() + onShare(); this component
// owns all state, validation, and rendering. `noun` ("load" / "estimate") drives
// the dialog titles and the copied toast.
import { useState, useRef, useEffect } from 'react';
import { Share, Mail, Phone, FileText, CheckCircle, X } from '../icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareMenu({
  palette,
  noun = 'load',
  copiedLabel = 'Copied',
  emailFootnote = null,
  noteMaxEmail = 1000,
  noteMaxText = 300,
  onCopyText,            // () => string  — clipboard content
  onShare,               // ({ channel, recipient, note }) => Promise (throws on error)
}) {
  const p = {
    accent: '#2563eb',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    cardBg: '#ffffff',
    inputBg: '#ffffff',
    ...palette,
  };
  const [open, setOpen] = useState(false);       // chooser dropdown
  const [mode, setMode] = useState(null);        // 'email' | 'text' dialog
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef(null);
  const copiedTimer = useRef(null);

  // Close the chooser on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const openDialog = (m) => {
    setOpen(false);
    setMode(m);
    setRecipient('');
    setNote('');
    setError(null);
    setSent(false);
  };

  const handleCopy = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(onCopyText());
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
      // Log the share; a logging failure shouldn't disturb the copy UX.
      onShare({ channel: 'copy', recipient: null, note: '' }).catch((err) =>
        console.error('Share log failed:', err.message));
    } catch (err) {
      console.error('Clipboard write failed:', err.message);
      setError('Could not access the clipboard');
      setMode('copy-error');
    }
  };

  const handleSend = async () => {
    setError(null);
    if (mode === 'email' && !EMAIL_RE.test(recipient.trim())) {
      setError('Enter a valid email address');
      return;
    }
    if (mode === 'text' && recipient.replace(/\D/g, '').length !== 10) {
      setError('Enter a 10-digit US mobile number');
      return;
    }
    setSending(true);
    try {
      await onShare({
        channel: mode,
        recipient: mode === 'text' ? `+1${recipient.replace(/\D/g, '')}` : recipient.trim(),
        note: note.trim(),
      });
      setSent(true);
      setTimeout(() => setMode(null), 1500);
    } catch (err) {
      setError(err.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', background: p.inputBg, color: p.text,
    border: `1px solid ${p.border}`, borderRadius: '8px', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  };
  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '14px', fontWeight: 600, color: p.text, textAlign: 'left',
  };

  const noteMax = mode === 'email' ? noteMaxEmail : noteMaxText;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Share this ${noun}`}
        aria-label={`Share this ${noun}`}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'none', border: `1px solid ${p.border}`, borderRadius: '8px', cursor: 'pointer', color: p.accent, fontSize: '13px', fontWeight: 700 }}
      >
        <Share size={15} /> Share
      </button>

      {copied && (
        <span style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, padding: '6px 12px', background: '#16a34a', color: '#fff', borderRadius: '8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', zIndex: 30000, display: 'flex', alignItems: 'center', gap: '5px' }}>
          <CheckCircle size={13} /> {copiedLabel}
        </span>
      )}

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: p.cardBg, border: `1px solid ${p.border}`, borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 30000, minWidth: '150px', overflow: 'hidden' }}>
          <button style={itemStyle} onClick={() => openDialog('email')}><Mail size={15} color={p.accent} /> Email</button>
          <button style={itemStyle} onClick={() => openDialog('text')}><Phone size={15} color={p.accent} /> Text</button>
          <button style={itemStyle} onClick={handleCopy}><FileText size={15} color={p.accent} /> Copy</button>
        </div>
      )}

      {(mode === 'email' || mode === 'text') && (
        <div
          onClick={() => !sending && setMode(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: p.cardBg, borderRadius: '14px', width: '100%', maxWidth: '420px', padding: '22px', border: `1px solid ${p.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: p.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {mode === 'email' ? <Mail size={17} color={p.accent} /> : <Phone size={17} color={p.accent} />}
                {mode === 'email' ? `Email this ${noun}` : `Text this ${noun}`}
              </div>
              <button onClick={() => setMode(null)} disabled={sending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted, padding: '4px' }}><X size={16} /></button>
            </div>

            {sent ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <CheckCircle size={18} /> Sent!
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: p.textMuted, marginBottom: '6px' }}>
                  {mode === 'email' ? 'Recipient email' : 'Mobile number'}
                </label>
                {mode === 'email' ? (
                  <input
                    type="email"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="name@company.com"
                    disabled={sending}
                    style={inputStyle}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    {/* Non-editable +1 country code (US only) */}
                    <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: p.border, color: p.textMuted, border: `1px solid ${p.border}`, borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: '14px', fontWeight: 700 }}>+1</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="3365551234"
                      disabled={sending}
                      style={{ ...inputStyle, borderRadius: '0 8px 8px 0' }}
                    />
                  </div>
                )}

                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: p.textMuted, margin: '14px 0 6px' }}>
                  Note <span style={{ fontWeight: 400 }}>({note.length}/{noteMax})</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, noteMax))}
                  maxLength={noteMax}
                  rows={mode === 'email' ? 4 : 3}
                  placeholder={mode === 'email' ? 'Add a note for the recipient…' : 'Short note (SMS)…'}
                  disabled={sending}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />

                {mode === 'email' && emailFootnote && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: p.textMuted }}>
                    {emailFootnote}
                  </div>
                )}

                {error && <div style={{ marginTop: '10px', fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>{error}</div>}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button onClick={() => setMode(null)} disabled={sending} style={{ padding: '9px 16px', background: 'none', border: `1px solid ${p.border}`, borderRadius: '8px', color: p.textMuted, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleSend} disabled={sending} style={{ padding: '9px 18px', background: p.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1 }}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
