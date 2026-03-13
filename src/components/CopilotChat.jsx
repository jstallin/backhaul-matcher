import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const GREETINGS = {
  results: (data) => {
    const count = data.matches?.length ?? 0;
    const name = data.request?.request_name || 'this request';
    return `I can see ${count} load${count !== 1 ? 's' : ''} for ${name}. Ask me anything — which gets you closest to home, which has the best rate, whether any are worth negotiating.`;
  },
  requests: (data) => {
    const count = data.requests?.length ?? 0;
    return `You have ${count} open backhaul request${count !== 1 ? 's' : ''}. Ask me anything about them — status, patterns, what to prioritize.`;
  }
};

export const CopilotChat = ({ context, contextData }) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize greeting when opened for first time
  useEffect(() => {
    if (open && messages.length === 0) {
      const greetFn = GREETINGS[context];
      const greeting = greetFn ? greetFn(contextData) : 'How can I help?';
      setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened
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

    // Only send actual user/assistant turns to the API (skip the greeting)
    const apiMessages = updatedMessages.filter(m => !(m.role === 'assistant' && m.isGreeting));

    try {
      const response = await fetch('/api/ai/analyze-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, context, contextData })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Sorry, I couldn\'t generate a response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <style>{`
        .copilot-btn { transition: all 0.2s; }
        .copilot-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,139,0,0.4); }
        .copilot-panel { animation: slideUp 0.2s ease; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .copilot-msg-user { background: #008b0020; border: 1px solid #008b0040; border-radius: 12px 12px 2px 12px; }
        .copilot-msg-assistant { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 2px 12px 12px 12px; }
        .copilot-send:hover { background: #00a800 !important; }
        .copilot-send:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      {/* Floating button (minimized) */}
      {!open && (
        <button
          className="copilot-btn"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 20px',
            background: '#008b00',
            border: 'none', borderRadius: '28px',
            color: '#fff', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,139,0,0.35)'
          }}
        >
          ✦ Co-pilot
        </button>
      )}

      {/* Chat panel (expanded) */}
      {open && (
        <div
          className="copilot-panel"
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(500px, calc(100vh - 80px))',
            background: '#0d1117',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#008b00', fontSize: '16px' }}>✦</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Dispatch Co-pilot</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={msg.role === 'user' ? 'copilot-msg-user' : 'copilot-msg-assistant'}
                style={{
                  padding: '10px 13px',
                  fontSize: '13px',
                  lineHeight: '1.55',
                  color: msg.role === 'user' ? '#90ee90' : 'rgba(255,255,255,0.88)',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%'
                }}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div
                className="copilot-msg-assistant"
                style={{ padding: '10px 13px', fontSize: '13px', color: 'rgba(255,255,255,0.4)', alignSelf: 'flex-start' }}
              >
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', gap: '8px', flexShrink: 0
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about these loads..."
              rows={1}
              style={{
                flex: 1, padding: '9px 12px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                color: '#fff', fontSize: '13px',
                resize: 'none', outline: 'none',
                fontFamily: 'inherit', lineHeight: '1.4'
              }}
            />
            <button
              className="copilot-send"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                padding: '9px 14px',
                background: '#008b00', border: 'none',
                borderRadius: '10px', color: '#fff',
                fontSize: '14px', cursor: 'pointer',
                flexShrink: 0, transition: 'background 0.15s'
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
