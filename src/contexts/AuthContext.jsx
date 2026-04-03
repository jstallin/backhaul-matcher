import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, db } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [org, setOrg] = useState(null);         // { id, name, email_domain }
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const checkAdmin = async (userId) => {
    if (!userId) { setIsAdmin(false); return; }
    const { data } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const checkOrg = async (userId, accessToken) => {
    if (!userId || !accessToken) { setOrg(null); setIsOrgAdmin(false); return; }
    try {
      const response = await fetch('/api/orgs/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setOrg(data.org || null);
        setIsOrgAdmin(data.is_org_admin || false);
      }
    } catch {
      // Non-critical — org context unavailable
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      checkAdmin(session?.user?.id);
      checkOrg(session?.user?.id, session?.access_token);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      checkAdmin(session?.user?.id);
      checkOrg(session?.user?.id, session?.access_token);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    session,
    loading,
    isAdmin,
    org,
    isOrgAdmin,
    signUp: async (email, password, fullName, role = 'fleet_manager') => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });
      if (error) throw error;
      return data;
    },
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
    updatePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
