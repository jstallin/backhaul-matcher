import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const BRAND_GREEN = '#4ade80';
const PANEL_BG    = '#0d1f35';
const BORDER      = 'rgba(74,222,128,0.18)';

const GREETINGS = {
  dashboard: (data) => {
    const fleetCount = data.fleets?.length ?? 0;
    const active = data.activeRequests ?? 0;
    if (fleetCount === 0) return `No fleets set up yet. I can help you create one — just tell me the fleet name, equipment type, and home base.`;
    return `${fleetCount} fleet${fleetCount !== 1 ? 's' : ''} on file, ${active} active request${active !== 1 ? 's' : ''}. I can create requests, add trucks or drivers, estimate lanes, or just talk through your operation.`;
  },
  results: (data) => {
    const count = data.matches?.length ?? 0;
    const name = data.request?.request_name || 'this request';
    return `${count} load${count !== 1 ? 's' : ''} for ${name}. Ask me anything — which gets you closest to home, best rate, or whether any are worth negotiating.`;
  },
  requests: (data) => {
    const count = data.requests?.length ?? 0;
    return `${count} open request${count !== 1 ? 's' : ''}. Ask me about status, patterns, or what to prioritize next.`;
  },
  support: () => `I'm here to help. Ask me how anything works, what a number means, or how to set something up. If I can't resolve it, I'll help you reach the support team.`,
};

const PLACEHOLDERS = {
  dashboard: 'Create a fleet, add a truck, estimate a lane…',
  results:   'Which load is closest to home? Is #2 worth negotiating?',
  requests:  'Ask about your requests…',
  support:   'How do I set up relay mode? Why are my distances off?…',
};

const CONTEXT_LABELS = {
  dashboard: 'Fleet Overview',
  results:   'Load Results',
  requests:  'Open Requests',
  support:   'Help & Support',
};

// ── Haul Monitor wordmark icon ────────────────────────────────────────────────

function HaulMonitorIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="7" width="20" height="13" rx="2" stroke={BRAND_GREEN} strokeWidth="1.8"/>
      <path d="M7 7V5a5 5 0 0110 0v2" stroke={BRAND_GREEN} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="13.5" r="2" fill={BRAND_GREEN}/>
      <path d="M12 15.5v2" stroke={BRAND_GREEN} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CoDriverV2({ context, contextData = {}, initialOpen = false, onClose }) {
  const [open, setOpen] = useState(initialOpen);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Seed greeting when panel opens for the first time
  useEffect(() => {
    if (open && messages.length === 0) {
      const greetFn = GREETINGS[context];
      const greeting = greetFn ? greetFn(contextData) : 'How can I help?';
      setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [open]);

  // Reset when the request / matches change
  useEffect(() => {
    setMessages([]);
  }, [context, contextData?.request?.id, contextData?.requests?.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const apiMessages = updated
        .filter(m => !m.isGreeting)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/ai/analyze-load', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: apiMessages, context, contextData }),
      });
      let data;
      try { data = await res.json(); } catch { data = {}; }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'Sorry, I couldn\'t generate a response.',
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const emailHref = (() => {
    const subject = encodeURIComponent('Haul Monitor Support Request');
    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Me' : 'Co-driver'}: ${m.content}`)
      .join('\n\n');
    const body = encodeURIComponent(
      `Hi Haul Monitor team,\n\nI need help with the following:\n\n---\n${transcript}\n---\n\n[Please add any additional details here]`
    );
    return `mailto:support@haulmonitor.cloud?subject=${subject}&body=${body}`;
  })();

  return (
    <>
      <style>{`
        .cdv2-btn { transition: transform 0.18s, box-shadow 0.18s; }
        .cdv2-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(74,222,128,0.35) !important; }
        .cdv2-panel { animation: cdv2In 0.18s ease; }
        @keyframes cdv2In { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .cdv2-input:focus { border-color: rgba(74,222,128,0.5) !important; outline: none; }
        .cdv2-send { transition: background 0.12s; }
        .cdv2-send:hover:not(:disabled) { background: #22c55e !important; }
        .cdv2-send:disabled { opacity: 0.35; cursor: not-allowed; }
        .cdv2-msgs::-webkit-scrollbar { width: 4px; }
        .cdv2-msgs::-webkit-scrollbar-track { background: transparent; }
        .cdv2-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* Float button — hidden in support mode (panel starts open) */}
      {!open && context !== 'support' && (
        <button
          className="cdv2-btn"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px',
            background: '#0d2d4f',
            border: `1px solid ${BORDER}`,
            borderRadius: '28px',
            color: BRAND_GREEN,
            fontSize: '13px', fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px rgba(74,222,128,0.1)',
          }}
        >
          <HaulMonitorIcon size={16} />
          Co-driver
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="cdv2-panel"
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1100,
            width: 'min(390px, calc(100vw - 32px))',
            height: 'min(520px, calc(100vh - 80px))',
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: '16px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,222,128,0.06)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%',
                background: 'rgba(74,222,128,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <HaulMonitorIcon size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: BRAND_GREEN }}>Haul</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>Monitor</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginLeft: '2px' }}>Co-driver</span>
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(74,222,128,0.6)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {CONTEXT_LABELS[context] || 'Dispatch Assistant'}
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '2px 6px' }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="cdv2-msgs" style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 13px',
                  fontSize: '13px', lineHeight: '1.55',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  background: msg.role === 'user'
                    ? 'rgba(74,222,128,0.1)'
                    : 'rgba(255,255,255,0.04)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(74,222,128,0.2)'
                    : '1px solid rgba(255,255,255,0.07)',
                  color: msg.role === 'user' ? BRAND_GREEN : 'rgba(255,255,255,0.88)',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div style={{
                padding: '10px 13px', fontSize: '13px',
                color: 'rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '2px 12px 12px 12px',
                alignSelf: 'flex-start',
              }}>
                thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Email support link */}
          {messages.length > 1 && (
            <div style={{ padding: '4px 14px 2px', display: 'flex', justifyContent: 'flex-end' }}>
              <a
                href={emailHref}
                style={{ fontSize: '11px', color: 'rgba(100,160,255,0.6)', textDecoration: 'none' }}
              >
                Email Support with this chat
              </a>
            </div>
          )}

          {/* Input row */}
          <div style={{
            padding: '10px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', gap: '8px',
            flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              className="cdv2-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={PLACEHOLDERS[context] || 'Ask anything…'}
              rows={1}
              style={{
                flex: 1, padding: '9px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#fff', fontSize: '13px',
                resize: 'none', fontFamily: 'inherit', lineHeight: '1.4',
              }}
            />
            <button
              className="cdv2-send"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                padding: '9px 14px',
                background: BRAND_GREEN,
                border: 'none',
                borderRadius: '10px',
                color: '#0d1f35',
                fontSize: '16px', fontWeight: 800,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
