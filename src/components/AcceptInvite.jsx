import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

export const AcceptInvite = () => {
  const { user, session } = useAuth();
  const { colors } = useTheme();

  const [token, setToken] = useState(null);
  const [invite, setInvite] = useState(null);   // { valid, org_name, inviter_name, email, status }
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [result, setResult] = useState(null);   // { action: 'accepted'|'declined' } | null
  const [error, setError] = useState(null);

  // Login form state (shown when not logged in — existing users)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Magic-link state (shown for unauthenticated new users)
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Password-setting state (shown for authenticated new users before accepting)
  const [displayName, setDisplayName] = useState(''); // #46: required for invited users
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  useEffect(() => {
    // Check for Supabase auth error in the URL hash (e.g. otp_expired)
    const hash = new URLSearchParams(window.location.hash.replace('#', ''));
    if (hash.get('error')) {
      const code = hash.get('error_code') || hash.get('error');
      const isExpired = code === 'otp_expired' || code === 'access_denied';
      setError(isExpired
        ? 'This sign-in link has expired. Ask your admin to resend the invite.'
        : hash.get('error_description')?.replace(/\+/g, ' ') || 'Authentication failed. Please try again.'
      );
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setError('No invite token found in this link.');
      setLoading(false);
      return;
    }
    setToken(t);
    fetchInviteDetails(t);
  }, []);

  const fetchInviteDetails = async (t) => {
    try {
      const response = await fetch(`/api/orgs/invite-token?token=${t}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'This invite link is invalid.');
      } else {
        setInvite(data);
      }
    } catch (err) {
      setError('Failed to load invite details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (action) => {
    if (!session?.access_token) return;
    setResponding(true);
    setError(null);
    try {
      const response = await fetch('/api/orgs/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ token, action })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to process your response.');
      } else {
        setResult({ action: data.action });
        if (action === 'accept') {
          // Refresh org context then redirect to app after a brief delay
          setTimeout(() => {
            window.location.href = '/app';
          }, 2500);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setResponding(false);
    }
  };

  const handleSendOtp = async () => {
    setSendingOtp(true);
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: invite.email,
        options: {
          emailRedirectTo: window.location.href,
          shouldCreateUser: false
        }
      });
      if (error) throw error;
      setOtpSent(true);
    } catch (err) {
      setLoginError(err.message || 'Failed to send sign-in link. Please try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (!displayName.trim()) {
      setPasswordError('Please enter your display name.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setSettingPassword(true);
    try {
      // #46: invited users had no display name — capture it here and store as full_name.
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { full_name: displayName.trim() },
      });
      if (error) throw error;
      setPasswordSet(true);
    } catch (err) {
      setPasswordError(err.message || 'Failed to set password. Please try again.');
    } finally {
      setSettingPassword(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      });
      if (error) throw error;
      // onAuthStateChange in AuthContext will update session; page re-renders
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoggingIn(false);
    }
  };

  const containerStyle = {
    minHeight: '100vh',
    background: colors.background.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  };

  const cardStyle = {
    background: colors.background.card || colors.background.secondary,
    border: `1px solid ${colors.border.primary}`,
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '460px',
    textAlign: 'center'
  };

  const logoStyle = {
    fontSize: '22px',
    fontWeight: 800,
    marginBottom: '32px',
    color: colors.text.primary
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
          <p style={{ color: colors.text.secondary }}>Loading invite details...</p>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px 0', color: colors.text.primary }}>Invalid Invite</h2>
          <p style={{ color: colors.text.secondary, fontSize: '15px' }}>{error}</p>
          <a href="/app" style={{ display: 'inline-block', marginTop: '24px', color: colors.accent.primary, textDecoration: 'none', fontWeight: 600 }}>
            Go to Haul Monitor →
          </a>
        </div>
      </div>
    );
  }

  if (invite && !invite.valid) {
    const messages = {
      accepted: 'This invite has already been accepted.',
      declined: 'This invite was declined.',
      expired: 'This invite link has expired. Ask your org admin to send a new one.'
    };
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>
            {invite.status === 'accepted' ? '✅' : '⏱️'}
          </div>
          <h2 style={{ margin: '0 0 12px 0', color: colors.text.primary }}>
            {invite.status === 'accepted' ? 'Already Accepted' : 'Invite Expired'}
          </h2>
          <p style={{ color: colors.text.secondary, fontSize: '15px' }}>
            {messages[invite.status] || 'This invite is no longer valid.'}
          </p>
          <a href="/app" style={{ display: 'inline-block', marginTop: '24px', color: colors.accent.primary, textDecoration: 'none', fontWeight: 600 }}>
            Go to Haul Monitor →
          </a>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>
            {result.action === 'accepted' ? '🎉' : '👋'}
          </div>
          <h2 style={{ margin: '0 0 12px 0', color: colors.text.primary }}>
            {result.action === 'accepted' ? `Welcome to ${invite?.org_name}!` : 'Invite Declined'}
          </h2>
          <p style={{ color: colors.text.secondary, fontSize: '15px' }}>
            {result.action === 'accepted'
              ? 'You\'ve been added to the organization. Redirecting you to Haul Monitor...'
              : 'No problem — you can always ask for a new invite later.'}
          </p>
          {result.action !== 'accepted' && (
            <a href="/app" style={{ display: 'inline-block', marginTop: '24px', color: colors.accent.primary, textDecoration: 'none', fontWeight: 600 }}>
              Go to Haul Monitor →
            </a>
          )}
        </div>
      </div>
    );
  }

  // Authenticated new user must set a password before accepting
  if (user && invite?.is_new_user && !passwordSet) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔐</div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: colors.text.primary }}>
            Create your password
          </h2>
          <p style={{ color: colors.text.secondary, fontSize: '14px', margin: '0 0 24px 0' }}>
            Set a password for <strong style={{ color: colors.text.primary }}>{user.email}</strong> to finish joining {invite?.org_name}.
          </p>
          <form onSubmit={handleSetPassword}>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Display name (e.g., Jenny James)"
              required
              autoComplete="name"
              style={{ width: '100%', padding: '12px', marginBottom: '12px', background: colors.background.primary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              required
              style={{ width: '100%', padding: '12px', marginBottom: '12px', background: colors.background.primary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              style={{ width: '100%', padding: '12px', marginBottom: '16px', background: colors.background.primary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            {passwordError && (
              <div style={{ padding: '10px', background: `${colors.accent.danger}20`, border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px', color: colors.accent.danger, fontSize: '13px', marginBottom: '16px' }}>
                {passwordError}
              </div>
            )}
            <button
              type="submit"
              disabled={settingPassword}
              style={{ width: '100%', padding: '13px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#0d1117', fontSize: '15px', fontWeight: 700, cursor: settingPassword ? 'not-allowed' : 'pointer', opacity: settingPassword ? 0.7 : 1 }}
            >
              {settingPassword ? 'Setting password...' : 'Set Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Show unauthenticated state — different flow for new vs existing users
  if (!user) {
    const inviteBanner = (
      <div style={{
        background: `${colors.accent.primary}15`,
        border: `1px solid ${colors.accent.primary}40`,
        borderRadius: '10px',
        padding: '16px 20px',
        marginBottom: '28px',
        textAlign: 'left'
      }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: colors.text.secondary }}>
          <strong style={{ color: colors.text.primary }}>{invite?.inviter_name}</strong> has invited you to join
        </p>
        <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>
          {invite?.org_name}
        </p>
      </div>
    );

    // New user — no password yet; send a magic sign-in link
    if (invite?.is_new_user) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
            {inviteBanner}

            {otpSent ? (
              <>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>📬</div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>
                  Check your inbox
                </h3>
                <p style={{ color: colors.text.secondary, fontSize: '14px', lineHeight: 1.6 }}>
                  We sent a sign-in link to <strong style={{ color: colors.text.primary }}>{invite.email}</strong>.
                  Click it to verify your email, then you'll be brought back here to accept the invite.
                </p>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: colors.text.secondary }}>
                  Verify your email to continue
                </h3>
                <p style={{ color: colors.text.secondary, fontSize: '14px', margin: '0 0 20px 0' }}>
                  We'll send a sign-in link to <strong style={{ color: colors.text.primary }}>{invite?.email}</strong>.
                </p>
                {loginError && (
                  <div style={{ padding: '10px', background: `${colors.accent.danger}20`, border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px', color: colors.accent.danger, fontSize: '13px', marginBottom: '16px' }}>
                    {loginError}
                  </div>
                )}
                <button
                  onClick={handleSendOtp}
                  disabled={sendingOtp}
                  style={{ width: '100%', padding: '13px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#0d1117', fontSize: '15px', fontWeight: 700, cursor: sendingOtp ? 'not-allowed' : 'pointer', opacity: sendingOtp ? 0.7 : 1 }}
                >
                  {sendingOtp ? 'Sending...' : 'Send Sign-In Link'}
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    // Existing user — show password login form
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>
          {inviteBanner}

          <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 600, color: colors.text.secondary }}>
            Log in to accept
          </h3>

          <form onSubmit={handleLogin}>
            <input
              type="email"
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              placeholder="Email"
              required
              style={{ width: '100%', padding: '12px', marginBottom: '12px', background: colors.background.primary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            <input
              type="password"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              placeholder="Password"
              required
              style={{ width: '100%', padding: '12px', marginBottom: '16px', background: colors.background.primary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            {loginError && (
              <div style={{ padding: '10px', background: `${colors.accent.danger}20`, border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px', color: colors.accent.danger, fontSize: '13px', marginBottom: '16px' }}>
                {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={loggingIn}
              style={{ width: '100%', padding: '13px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#0d1117', fontSize: '15px', fontWeight: 700, cursor: loggingIn ? 'not-allowed' : 'pointer', opacity: loggingIn ? 0.7 : 1 }}
            >
              {loggingIn ? 'Logging in...' : 'Log In & Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Logged in — show accept/decline
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}><span style={{ color: colors.accent.primary }}>Haul</span> Monitor</div>

        <div style={{
          width: '64px', height: '64px', borderRadius: '14px',
          background: '#1B7A4A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          color: '#fff', fontWeight: 900, fontSize: '18px'
        }}>
          {invite?.org_name?.charAt(0)?.toUpperCase() || 'O'}
        </div>

        <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 700, color: colors.text.primary }}>
          Join {invite?.org_name}?
        </h2>
        <p style={{ color: colors.text.secondary, fontSize: '15px', margin: '0 0 8px 0' }}>
          <strong style={{ color: colors.text.primary }}>{invite?.inviter_name}</strong> has invited you to join their organization on Haul Monitor.
        </p>
        <p style={{ color: colors.text.muted || colors.text.secondary, fontSize: '13px', margin: '0 0 32px 0', opacity: 0.7 }}>
          Logged in as {user.email}
        </p>

        {error && (
          <div style={{ padding: '12px', background: `${colors.accent.danger}20`, border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px', color: colors.accent.danger, fontSize: '14px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => handleRespond('decline')}
            disabled={responding}
            style={{ flex: 1, padding: '13px', background: 'transparent', border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '15px', fontWeight: 600, cursor: responding ? 'not-allowed' : 'pointer', opacity: responding ? 0.5 : 1 }}
          >
            Decline
          </button>
          <button
            onClick={() => handleRespond('accept')}
            disabled={responding}
            style={{ flex: 2, padding: '13px', background: '#1B7A4A', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: responding ? 'not-allowed' : 'pointer', opacity: responding ? 0.7 : 1 }}
          >
            {responding ? 'Processing...' : `Accept & Join ${invite?.org_name}`}
          </button>
        </div>
      </div>
    </div>
  );
};
