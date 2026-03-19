import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const useCredits = () => {
  const { isAdmin } = useAuth();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setBalance(null); return; }
      const res = await fetch('/api/stripe?action=balance', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setBalance(d.balance ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const deductCredit = async (description = 'Backhaul search') => {
    if (isAdmin && localStorage.getItem('hm_credits_bypass') === 'true') {
      return { success: true, balance: balance ?? 999 };
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const res = await fetch('/api/stripe?action=deduct', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ description })
    });
    const d = await res.json();
    if (d.success && typeof d.balance === 'number') setBalance(d.balance);
    return d;
  };

  const openCheckout = async (packageId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/stripe?action=checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ packageId })
    });
    const d = await res.json();
    if (d.url) window.location.href = d.url;
  };

  return { balance, loading, fetchBalance, deductCredit, openCheckout };
};
