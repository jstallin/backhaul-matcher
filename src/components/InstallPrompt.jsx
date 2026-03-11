import { useState, useEffect } from 'react';

const DISMISS_KEY = 'hm-install-dismissed';
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isInStandaloneMode = () =>
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;
const isIOSSafari = () =>
  isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

const ShareIcon = () => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="#8b949e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}
  >
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    // Already installed — don't show
    if (isInStandaloneMode()) return;

    // Dismissed recently — don't show
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - parseInt(dismissed) < DISMISS_DURATION_MS) return;

    // Android/Chrome: capture the native install event
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowAndroid(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari: show manual instructions after a short delay
    let timer;
    if (isIOSSafari()) {
      timer = setTimeout(() => setShowIOS(true), 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowAndroid(false);
    setShowIOS(false);
    setDeferredPrompt(null);
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowAndroid(false);
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  };

  if (!showAndroid && !showIOS) return null;

  const banner = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    background: '#161b22',
    borderTop: '1px solid rgba(0, 139, 0, 0.4)',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.5)',
  };

  const dismissBtn = {
    background: 'none',
    border: 'none',
    color: '#6e7681',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px',
    flexShrink: 0,
    lineHeight: 1,
  };

  if (showAndroid) {
    return (
      <div style={banner}>
        <div style={{ fontSize: '26px', flexShrink: 0 }}>📱</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#f0f6fc', marginBottom: '2px' }}>
            Add Haul Monitor to your home screen
          </div>
          <div style={{ fontSize: '12px', color: '#8b949e' }}>
            Install for quick access — works like a native app
          </div>
        </div>
        <button
          onClick={handleAndroidInstall}
          style={{
            padding: '10px 18px',
            background: '#008b00',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            minHeight: '44px',
          }}
        >
          Install
        </button>
        <button onClick={dismiss} style={dismissBtn} aria-label="Dismiss">✕</button>
      </div>
    );
  }

  // iOS Safari manual instructions
  return (
    <div style={banner}>
      <div style={{ fontSize: '26px', flexShrink: 0 }}>📱</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f0f6fc', marginBottom: '4px' }}>
          Add Haul Monitor to your home screen
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
          Tap <span style={{ background: '#30363d', borderRadius: '4px', padding: '1px 5px', color: '#f0f6fc', fontWeight: 600 }}>
            Share
          </span> <ShareIcon /> then{' '}
          <span style={{ background: '#30363d', borderRadius: '4px', padding: '1px 5px', color: '#f0f6fc', fontWeight: 600 }}>
            Add to Home Screen
          </span>
        </div>
      </div>
      <button onClick={dismiss} style={dismissBtn} aria-label="Dismiss">✕</button>
    </div>
  );
};
