import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const CRISP_WEBSITE_ID = '4549a510-da65-44bf-a5dd-623d1c3181df';

export function CrispChat() {
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (window.$crisp) return; // already loaded
    window.$crisp = [];
    window.$crisp.push(['config', 'position:reverse', [true]]); // bottom-left, CoDriver is bottom-right
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!window.$crisp) return;
    if (isAdmin) {
      window.$crisp.push(['do', 'chat:hide']);
      return;
    }
    if (user?.email) {
      window.$crisp.push(['set', 'user:email', [user.email]]);
    }
    window.$crisp.push(['do', 'chat:show']);
  }, [user, isAdmin]);

  return null;
}
