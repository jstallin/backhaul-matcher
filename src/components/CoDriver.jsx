import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

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
    return `${count} load${count !== 1 ? 's' : ''} for ${name}. Ask me anything — which gets you closest to home, best rate, whether any are worth negotiating.`;
  },
  requests: (data) => {
    const count = data.requests?.length ?? 0;
    return `${count} open request${count !== 1 ? 's' : ''}. Ask me about status, patterns, or what to prioritize next.`;
  }
};

export const CoDriver = ({ context, contextData }) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      const greetFn = GREETINGS[context];
      const greeting = greetFn ? greetFn(contextData) : 'How can I help?';
      setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [open]);

  // Reset when context changes (e.g. new results loaded)
  useEffect(() => {
    setMessages([]);
  }, [context, contextData?.request?.id, contextData?.requests?.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      // Send only actual conversation turns (skip opening greeting for API calls)
      const apiMessages = updatedMessages
        .filter(m => !(m.isGreeting))
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/ai/analyze-load', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: apiMessages, context, contextData })
      });
      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'Sorry, I couldn\'t generate a response.'
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

  const placeholder = {
    dashboard: 'Create a fleet, add a truck, estimate a lane...',
    results: 'Which load is closest to home? Is #2 worth negotiating?',
    requests: 'Ask about your requests...'
  }[context] || 'Ask anything...';

  return (
    <>
      <style>{`
        .codriver-btn { transition: all 0.2s; }
        .codriver-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,139,0,0.45) !important; }
        .codriver-panel { animation: coDriveIn 0.2s ease; }
        @keyframes coDriveIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .cd-msg-user { background: rgba(0,139,0,0.12); border: 1px solid rgba(0,139,0,0.25); border-radius: 12px 12px 2px 12px; }
        .cd-msg-assistant { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 2px 12px 12px 12px; }
        .cd-send { transition: background 0.15s; }
        .cd-send:hover:not(:disabled) { background: #00aa00 !important; }
        .cd-send:disabled { opacity: 0.35; cursor: not-allowed; }
        .cd-input:focus { border-color: rgba(0,139,0,0.5) !important; outline: none; }
        .cd-msgs::-webkit-scrollbar { width: 4px; }
        .cd-msgs::-webkit-scrollbar-track { background: transparent; }
        .cd-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
      `}</style>

      {/* Minimized button */}
      {!open && (
        <button
          className="codriver-btn"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '11px 20px',
            background: '#008b00',
            border: 'none', borderRadius: '28px',
            color: '#fff', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,139,0,0.35)'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2"/>
            <path d="M8 12h8M12 8l4 4-4 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Co-driver
        </button>
      )}

      {/* Expanded chat panel */}
      {open && (
        <div
          className="codriver-panel"
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            width: 'min(390px, calc(100vw - 32px))',
            height: 'min(520px, calc(100vh - 80px))',
            background: '#0d1117',
            border: '1px solid rgba(0,139,0,0.2)',
            borderRadius: '16px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 16px 56px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,139,0,0.08)'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'rgba(0,139,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#008b00" strokeWidth="2"/>
                  <path d="M8 12h8M12 8l4 4-4 4" stroke="#008b00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>Co-driver</div>
                <div style={{ fontSize: '11px', color: 'rgba(0,200,0,0.7)', lineHeight: 1.2 }}>
                  {{ dashboard: 'Fleet Overview', results: 'Load Results', requests: 'Open Requests' }[context] || 'Dispatch Assistant'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '2px 6px' }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="cd-msgs" style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={msg.role === 'user' ? 'cd-msg-user' : 'cd-msg-assistant'}
                style={{
                  padding: '10px 13px',
                  fontSize: '13px', lineHeight: '1.55',
                  color: msg.role === 'user' ? '#90ee90' : 'rgba(255,255,255,0.88)',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="cd-msg-assistant" style={{ padding: '10px 13px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', alignSelf: 'flex-start' }}>
                <span style={{ animation: 'none' }}>thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '11px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '8px', flexShrink: 0 }}>
            <textarea
              ref={inputRef}
              className="cd-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={placeholder}
              rows={1}
              style={{
                flex: 1, padding: '9px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#fff', fontSize: '13px',
                resize: 'none', fontFamily: 'inherit', lineHeight: '1.4'
              }}
            />
            <button
              className="cd-send"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                padding: '9px 14px',
                background: '#008b00', border: 'none',
                borderRadius: '10px', color: '#fff',
                fontSize: '16px', cursor: 'pointer', flexShrink: 0
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
};
