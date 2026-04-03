import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Sun, Moon, ChevronRight, User, Lock, Link2 } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const Users2Icon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

export const Settings = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState('accessibility');
  const { theme, toggleTheme, colors } = useTheme();
  const { user, isAdmin, org, isOrgAdmin } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // DAT Integration state
  const [showDatModal, setShowDatModal] = useState(false);
  const [datEmail, setDatEmail] = useState('');
  const [datConnecting, setDatConnecting] = useState(false);
  const [datError, setDatError] = useState('');
  const [datConnection, setDatConnection] = useState(null); // { connected, account_email, connected_at }
  const [loadingDatStatus, setLoadingDatStatus] = useState(true);

  // Direct Freight Integration state
  const [showDfModal, setShowDfModal] = useState(false);
  const [dfUsername, setDfUsername] = useState('');
  const [dfPassword, setDfPassword] = useState('');
  const [dfConnecting, setDfConnecting] = useState(false);
  const [dfError, setDfError] = useState('');
  const [dfConnection, setDfConnection] = useState(null); // { connected, username, connected_at }
  const [loadingDfStatus, setLoadingDfStatus] = useState(true);

  // Truckstop Integration state
  const [showTsModal, setShowTsModal] = useState(false);
  const [tsApiToken, setTsApiToken] = useState('');
  const [tsUsername, setTsUsername] = useState('');
  const [tsPassword, setTsPassword] = useState('');
  const [tsConnecting, setTsConnecting] = useState(false);
  const [tsError, setTsError] = useState('');
  const [tsConnection, setTsConnection] = useState(null); // { connected, is_org_token, org_domain, username, connected_at }
  const [loadingTsStatus, setLoadingTsStatus] = useState(true);

  // Check all connection statuses on mount
  useEffect(() => {
    checkDatStatus();
    checkDfStatus();
    checkTsStatus();
  }, []);

  const checkDatStatus = async () => {
    try {
      setLoadingDatStatus(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/integrations/dat', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDatConnection(data);
      }
    } catch (error) {
      console.error('Error checking DAT status:', error);
    } finally {
      setLoadingDatStatus(false);
    }
  };

  const handleDatConnect = async (e) => {
    e.preventDefault();
    setDatError('');

    if (!datEmail.trim()) {
      setDatError('Please enter your DAT email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(datEmail.trim())) {
      setDatError('Please enter a valid email address');
      return;
    }

    setDatConnecting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDatError('Please log in to connect your DAT account');
        return;
      }

      const response = await fetch('/api/integrations/dat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: datEmail.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setDatError(data.error || 'Failed to link DAT account');
        return;
      }

      // Success - update connection state and close modal
      setDatConnection({
        connected: true,
        account_email: data.account_email,
        connected_at: data.connected_at
      });
      setShowDatModal(false);
      setDatEmail('');
    } catch (error) {
      console.error('DAT connect error:', error);
      setDatError('An unexpected error occurred. Please try again.');
    } finally {
      setDatConnecting(false);
    }
  };

  const checkDfStatus = async () => {
    try {
      setLoadingDfStatus(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/integrations/directfreight?action=status', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDfConnection(data);
      }
    } catch (error) {
      console.error('Error checking Direct Freight status:', error);
    } finally {
      setLoadingDfStatus(false);
    }
  };

  const handleDfConnect = async (e) => {
    e.preventDefault();
    setDfError('');

    if (!dfUsername.trim() || !dfPassword.trim()) {
      setDfError('Username and password are required');
      return;
    }

    setDfConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDfError('Please log in to connect your Direct Freight account');
        return;
      }

      const response = await fetch('/api/integrations/directfreight?action=auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ username: dfUsername.trim(), password: dfPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        setDfError(data.error || 'Failed to connect to Direct Freight');
        return;
      }

      setDfConnection({ connected: true, username: data.username, connected_at: data.connected_at });
      setShowDfModal(false);
      setDfUsername('');
      setDfPassword('');
    } catch (error) {
      console.error('Direct Freight connect error:', error);
      setDfError('An unexpected error occurred. Please try again.');
    } finally {
      setDfConnecting(false);
    }
  };

  const handleDfDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Direct Freight account?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/integrations/directfreight?action=auth', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        setDfConnection({ connected: false });
      }
    } catch (error) {
      console.error('Error disconnecting Direct Freight:', error);
    }
  };

  const checkTsStatus = async () => {
    try {
      setLoadingTsStatus(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/integrations/truckstop', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTsConnection(data);
        // Pre-populate username for edit form if already connected
        if (data.connected && data.username) setTsUsername(data.username);
      }
    } catch (error) {
      console.error('Error checking Truckstop status:', error);
    } finally {
      setLoadingTsStatus(false);
    }
  };

  const handleTsConnect = async (e) => {
    e.preventDefault();
    setTsError('');

    if (!tsApiToken.trim()) { setTsError('API token is required'); return; }
    if (!tsUsername.trim()) { setTsError('Username is required'); return; }
    if (!tsPassword.trim()) { setTsError('Password is required'); return; }

    setTsConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTsError('Please log in to connect your Truckstop account');
        return;
      }

      const response = await fetch('/api/integrations/truckstop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          api_token: tsApiToken.trim(),
          username: tsUsername.trim(),
          password: tsPassword.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setTsError(data.error || 'Failed to save credentials');
        return;
      }

      setTsConnection({
        connected: true,
        is_org_token: data.is_org_token,
        org_domain: data.org_domain,
        username: data.username,
        connected_at: new Date().toISOString()
      });
      setShowTsModal(false);
      setTsApiToken('');
      setTsUsername('');
      setTsPassword('');
    } catch (error) {
      console.error('Truckstop connect error:', error);
      setTsError('An unexpected error occurred. Please try again.');
    } finally {
      setTsConnecting(false);
    }
  };

  const handleTsDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Truckstop?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/integrations/truckstop', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        setTsConnection({ connected: false });
      }
    } catch (error) {
      console.error('Error disconnecting Truckstop:', error);
    }
  };

  // Organization state
  const [orgMembers, setOrgMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  useEffect(() => {
    if (activeSection === 'organization' && org && isOrgAdmin) {
      fetchOrgMembers();
    }
  }, [activeSection, org, isOrgAdmin]);

  const fetchOrgMembers = async () => {
    try {
      setLoadingMembers(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/orgs/members', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setOrgMembers(data.members || []);
      }
    } catch (err) {
      console.error('Error fetching org members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) { setInviteError('Email is required'); return; }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/orgs/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: inviteEmail.trim() })
      });
      const data = await response.json();
      if (!response.ok) {
        setInviteError(data.error || 'Failed to send invite');
      } else {
        setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
        setInviteEmail('');
        setTimeout(() => { setShowInviteModal(false); setInviteSuccess(''); }, 2000);
      }
    } catch (err) {
      setInviteError('An unexpected error occurred');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Remove this member from your organization?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/orgs/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: memberId })
      });
      if (response.ok) {
        setOrgMembers(prev => prev.filter(m => m.user_id !== memberId));
      }
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  const handleDatDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your DAT account?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/integrations/dat', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        setDatConnection({ connected: false });
      }
    } catch (error) {
      console.error('Error disconnecting DAT:', error);
    }
  };

  const sections = [
    { id: 'general', label: 'General', icon: SettingsIcon, badge: null },
    { id: 'account', label: 'Account & Access', icon: User, badge: null },
    { id: 'integrations', label: 'Integrations', icon: Link2, badge: null },
    { id: 'organization', label: 'Organization', icon: Users2Icon, badge: null },
    { id: 'accessibility', label: 'Accessibility', icon: Sun, badge: null },
    ...(isAdmin ? [{ id: 'developer', label: 'Developer', icon: SettingsIcon, badge: null }] : [])
  ];

  const [creditsBypass, setCreditsBypass] = useState(
    localStorage.getItem('hm_credits_bypass') === 'true'
  );

  const toggleCreditsBypass = () => {
    const next = !creditsBypass;
    setCreditsBypass(next);
    if (next) {
      localStorage.setItem('hm_credits_bypass', 'true');
    } else {
      localStorage.removeItem('hm_credits_bypass');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setChangingPassword(true);

    try {
      const { supabase } = await import('../lib/supabase');
      
      // Update password
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;

      setPasswordSuccess('Password changed successfully!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      // Clear success message after 3 seconds
      setTimeout(() => {
        setPasswordSuccess('');
      }, 3000);
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError(error.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.background.primary,
      color: colors.text.primary
    }}>
      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              margin: '0 0 4px 0',
              fontSize: '28px',
              fontWeight: 900,
              background: `linear-gradient(135deg, ${colors.accent.primary} 0%, ${colors.accent.primary} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Settings
            </h1>
            <p style={{ margin: 0, color: colors.text.secondary, fontSize: '14px' }}>
              Manage your preferences and account settings
            </p>
          </div>
          <button
            onClick={onBack}
            style={{
              padding: '10px 20px',
              background: colors.background.secondary,
              border: `1px solid ${colors.border.accent}`,
              borderRadius: '8px',
              color: colors.text.primary,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = colors.background.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = colors.background.secondary}
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '32px' }}>
          
          {/* Sidebar */}
          <div style={{
            background: colors.background.card,
            border: `1px solid ${colors.border.primary}`,
            borderRadius: '16px',
            padding: '16px',
            height: 'fit-content',
            position: 'sticky',
            top: '32px'
          }}>
            <div style={{ marginBottom: '8px', padding: '0 12px' }}>
              <h3 style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 700,
                color: colors.text.tertiary,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Settings
              </h3>
            </div>
            
            {sections.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: isActive ? `${colors.accent.primary}20` : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    marginBottom: '4px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = colors.background.tertiary;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Icon 
                    size={18} 
                    color={isActive ? colors.accent.primary : colors.text.secondary}
                  />
                  <span style={{
                    flex: 1,
                    fontSize: '14px',
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? colors.accent.primary : colors.text.primary
                  }}>
                    {section.label}
                  </span>
                  {section.badge && (
                    <span style={{
                      padding: '2px 8px',
                      background: colors.accent.primary,
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#fff'
                    }}>
                      {section.badge}
                    </span>
                  )}
                  {isActive && (
                    <ChevronRight size={16} color={colors.accent.primary} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Content Area */}
          <div>
            {activeSection === 'general' && (
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '16px',
                padding: '32px'
              }}>
                <h2 style={{
                  margin: '0 0 24px 0',
                  fontSize: '24px',
                  fontWeight: 900,
                  color: colors.text.primary
                }}>
                  General Settings
                </h2>
                
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: colors.text.secondary
                }}>
                  <SettingsIcon size={48} color={colors.text.tertiary} style={{ marginBottom: '16px' }} />
                  <p style={{ margin: 0, fontSize: '16px' }}>
                    General settings coming soon
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'account' && (
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '16px',
                padding: '32px'
              }}>
                <h2 style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: 900,
                  color: colors.text.primary
                }}>
                  Account & Access
                </h2>
                <p style={{
                  margin: '0 0 32px 0',
                  color: colors.text.secondary,
                  fontSize: '14px'
                }}>
                  Manage your account security and access settings
                </p>

                {/* Account Info */}
                <div style={{
                  marginBottom: '32px',
                  padding: '20px',
                  background: colors.background.secondary,
                  borderRadius: '12px',
                  border: `1px solid ${colors.border.secondary}`
                }}>
                  <h3 style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: colors.text.primary
                  }}>
                    Account Information
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '14px' }}>
                      <span style={{ color: colors.text.secondary }}>Email: </span>
                      <span style={{ color: colors.text.primary, fontWeight: 600 }}>{user?.email}</span>
                    </div>
                  </div>
                </div>

                {/* Change Password */}
                <div style={{
                  padding: '24px',
                  background: colors.background.secondary,
                  borderRadius: '12px',
                  border: `1px solid ${colors.border.secondary}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <Lock size={20} color={colors.accent.primary} />
                    <h3 style={{
                      margin: 0,
                      fontSize: '16px',
                      fontWeight: 700,
                      color: colors.text.primary
                    }}>
                      Change Password
                    </h3>
                  </div>

                  <form onSubmit={handlePasswordChange}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: colors.text.primary
                      }}>
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                        disabled={changingPassword}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: colors.background.primary,
                          border: `1px solid ${colors.border.accent}`,
                          borderRadius: '8px',
                          color: colors.text.primary,
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: colors.text.primary
                      }}>
                        New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        disabled={changingPassword}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: colors.background.primary,
                          border: `1px solid ${colors.border.accent}`,
                          borderRadius: '8px',
                          color: colors.text.primary,
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                      <div style={{
                        marginTop: '4px',
                        fontSize: '12px',
                        color: colors.text.tertiary
                      }}>
                        Must be at least 6 characters
                      </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: colors.text.primary
                      }}>
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        disabled={changingPassword}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: colors.background.primary,
                          border: `1px solid ${colors.border.accent}`,
                          borderRadius: '8px',
                          color: colors.text.primary,
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {passwordError && (
                      <div style={{
                        padding: '12px',
                        background: `${colors.accent.danger}20`,
                        border: `1px solid ${colors.accent.danger}`,
                        borderRadius: '8px',
                        color: colors.accent.danger,
                        fontSize: '14px',
                        marginBottom: '16px'
                      }}>
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div style={{
                        padding: '12px',
                        background: `${colors.accent.success}20`,
                        border: `1px solid ${colors.accent.success}`,
                        borderRadius: '8px',
                        color: colors.accent.success,
                        fontSize: '14px',
                        marginBottom: '16px'
                      }}>
                        {passwordSuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={changingPassword}
                      style={{
                        padding: '12px 24px',
                        background: colors.accent.primary,
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: changingPassword ? 'not-allowed' : 'pointer',
                        opacity: changingPassword ? 0.5 : 1
                      }}
                    >
                      {changingPassword ? 'Changing Password...' : 'Change Password'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeSection === 'integrations' && (
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '16px',
                padding: '32px'
              }}>
                <h2 style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: 900,
                  color: colors.text.primary
                }}>
                  Integrations
                </h2>
                <p style={{
                  margin: '0 0 32px 0',
                  color: colors.text.secondary,
                  fontSize: '14px'
                }}>
                  Connect your load board accounts to access real-time freight data
                </p>

                {/* Truckstop Integration */}
                <div style={{
                  border: `1px solid ${tsConnection?.connected ? colors.accent.success : colors.border.primary}`,
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '16px',
                  background: tsConnection?.connected ? `${colors.accent.success}08` : 'transparent'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: '#1B7A4A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: '13px'
                      }}>
                        TS
                      </div>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>
                          Truckstop
                        </h3>
                        <p style={{ margin: 0, fontSize: '14px', color: colors.text.secondary }}>
                          Access live loads from Truckstop.com
                        </p>
                        {tsConnection?.connected && tsConnection.username && (
                          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: colors.text.tertiary }}>
                            {tsConnection.is_org_token
                              ? `Org token · ${tsConnection.username}`
                              : tsConnection.username}
                          </p>
                        )}
                      </div>
                    </div>
                    {loadingTsStatus ? (
                      <div style={{ padding: '6px 12px', background: colors.background.secondary, borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: colors.text.tertiary }}>
                        Checking...
                      </div>
                    ) : tsConnection?.connected ? (
                      <div style={{ padding: '6px 12px', background: `${colors.accent.success}20`, borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: colors.accent.success }}>
                        Connected
                      </div>
                    ) : (
                      <div style={{ padding: '6px 12px', background: colors.background.secondary, borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: colors.text.tertiary }}>
                        Not Connected
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.border.secondary}`, display: 'flex', gap: '12px' }}>
                    {tsConnection?.connected ? (
                      <>
                        {/* Org token: only org admin can edit/disconnect. Personal token: user can always edit. */}
                        {(!tsConnection.is_org_token || isOrgAdmin) && (
                          <>
                            <button
                              onClick={() => { setTsApiToken(''); setTsPassword(''); setTsError(''); setShowTsModal(true); }}
                              style={{ padding: '12px 24px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Edit Credentials
                            </button>
                            <button
                              onClick={handleTsDisconnect}
                              style={{ padding: '12px 24px', background: 'transparent', border: `1px solid ${colors.accent.danger}`, borderRadius: '8px', color: colors.accent.danger, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                        {tsConnection.is_org_token && !isOrgAdmin && (
                          <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary }}>
                            Managed by your org admin.
                          </p>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => { setShowTsModal(true); setTsError(''); }}
                        disabled={loadingTsStatus}
                        style={{ padding: '12px 24px', background: '#1B7A4A', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: loadingTsStatus ? 'not-allowed' : 'pointer', opacity: loadingTsStatus ? 0.5 : 1 }}
                      >
                        Connect Truckstop
                      </button>
                    )}
                  </div>
                </div>

                {/* DAT Integration — coming soon */}
                {/* <div style={{
                  border: `1px solid ${datConnection?.connected ? colors.accent.success : colors.border.primary}`,
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '16px',
                  background: datConnection?.connected ? `${colors.accent.success}08` : 'transparent'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: '#0066CC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: '14px'
                      }}>
                        DAT
                      </div>
                      <div>
                        <h3 style={{
                          margin: '0 0 4px 0',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: colors.text.primary
                        }}>
                          DAT Freight & Analytics
                        </h3>
                        <p style={{
                          margin: 0,
                          fontSize: '14px',
                          color: colors.text.secondary
                        }}>
                          Access loads from DAT One, the largest load board network
                        </p>
                        {datConnection?.connected && datConnection.account_email && (
                          <p style={{
                            margin: '4px 0 0 0',
                            fontSize: '13px',
                            color: colors.text.tertiary
                          }}>
                            Connected as: {datConnection.account_email}
                          </p>
                        )}
                      </div>
                    </div>
                    {loadingDatStatus ? (
                      <div style={{
                        padding: '6px 12px',
                        background: colors.background.secondary,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.text.tertiary
                      }}>
                        Checking...
                      </div>
                    ) : datConnection?.connected ? (
                      <div style={{
                        padding: '6px 12px',
                        background: `${colors.accent.success}20`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.accent.success
                      }}>
                        Connected
                      </div>
                    ) : (
                      <div style={{
                        padding: '6px 12px',
                        background: colors.background.secondary,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.text.tertiary
                      }}>
                        Not Connected
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.border.secondary}` }}>
                    {datConnection?.connected ? (
                      <button
                        onClick={handleDatDisconnect}
                        style={{
                          padding: '12px 24px',
                          background: 'transparent',
                          border: `1px solid ${colors.accent.danger}`,
                          borderRadius: '8px',
                          color: colors.accent.danger,
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Disconnect DAT Account
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDatModal(true)}
                        disabled={loadingDatStatus}
                        style={{
                          padding: '12px 24px',
                          background: colors.accent.primary,
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: loadingDatStatus ? 'not-allowed' : 'pointer',
                          opacity: loadingDatStatus ? 0.5 : 1
                        }}
                      >
                        Connect DAT Account
                      </button>
                    )}
                  </div>
                </div> */}

                {false && (
                <div style={{
                  border: `1px solid ${dfConnection?.connected ? colors.accent.success : colors.border.primary}`,
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '16px',
                  background: dfConnection?.connected ? `${colors.accent.success}08` : 'transparent'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: '#E8712A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: '14px'
                      }}>
                        DF
                      </div>
                      <div>
                        <h3 style={{
                          margin: '0 0 4px 0',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: colors.text.primary
                        }}>
                          Direct Freight
                        </h3>
                        <p style={{
                          margin: 0,
                          fontSize: '14px',
                          color: colors.text.secondary
                        }}>
                          Access live loads from the Direct Freight load board
                        </p>
                        {dfConnection?.connected && dfConnection.username && (
                          <p style={{
                            margin: '4px 0 0 0',
                            fontSize: '13px',
                            color: colors.text.tertiary
                          }}>
                            Connected as: {dfConnection.username}
                          </p>
                        )}
                      </div>
                    </div>
                    {loadingDfStatus ? (
                      <div style={{
                        padding: '6px 12px',
                        background: colors.background.secondary,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.text.tertiary
                      }}>
                        Checking...
                      </div>
                    ) : dfConnection?.connected ? (
                      <div style={{
                        padding: '6px 12px',
                        background: `${colors.accent.success}20`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.accent.success
                      }}>
                        Connected
                      </div>
                    ) : (
                      <div style={{
                        padding: '6px 12px',
                        background: colors.background.secondary,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.text.tertiary
                      }}>
                        Not Connected
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.border.secondary}` }}>
                    {dfConnection?.connected ? (
                      <button
                        onClick={handleDfDisconnect}
                        style={{
                          padding: '12px 24px',
                          background: 'transparent',
                          border: `1px solid ${colors.accent.danger}`,
                          borderRadius: '8px',
                          color: colors.accent.danger,
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Disconnect Direct Freight
                      </button>
                    ) : (
                      <button
                        onClick={() => { setShowDfModal(true); setDfError(''); }}
                        disabled={loadingDfStatus}
                        style={{
                          padding: '12px 24px',
                          background: colors.accent.primary,
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: loadingDfStatus ? 'not-allowed' : 'pointer',
                          opacity: loadingDfStatus ? 0.5 : 1
                        }}
                      >
                        Connect Direct Freight
                      </button>
                    )}
                  </div>
                </div>
                )}

                {false && (
                /* Chrome Extension */
                <div style={{
                  border: `1px solid ${colors.accent.primary}`,
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '16px',
                  background: `${colors.accent.primary}08`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: `linear-gradient(135deg, ${colors.accent.primary} 0%, #B8860B 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff'
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="3" width="15" height="13" rx="2"/>
                          <circle cx="5.5" cy="18.5" r="2.5"/>
                          <circle cx="13.5" cy="18.5" r="2.5"/>
                          <path d="M16 8h4l3 5v4h-3"/>
                          <circle cx="20" cy="18.5" r="2.5"/>
                        </svg>
                      </div>
                      <div>
                        <h3 style={{
                          margin: '0 0 4px 0',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: colors.text.primary
                        }}>
                          Chrome Extension
                        </h3>
                        <p style={{
                          margin: 0,
                          fontSize: '14px',
                          color: colors.text.secondary
                        }}>
                          Import loads directly from DAT and other load boards
                        </p>
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 12px',
                      background: `${colors.accent.primary}20`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: colors.accent.primary
                    }}>
                      Available
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.border.secondary}` }}>
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                        Installation Instructions:
                      </h4>
                      <ol style={{ margin: 0, paddingLeft: '20px', color: colors.text.secondary, fontSize: '14px', lineHeight: '1.8' }}>
                        <li>Download and unzip the extension file</li>
                        <li>Go to <code style={{ background: colors.background.secondary, padding: '2px 6px', borderRadius: '4px' }}>chrome://extensions</code> in Chrome</li>
                        <li>Enable <strong>Developer mode</strong> (toggle in top right)</li>
                        <li>Click <strong>Load unpacked</strong> and select the unzipped folder</li>
                      </ol>
                    </div>
                    <a
                      href="/haul-monitor-extension.zip"
                      download="haul-monitor-extension.zip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        background: colors.accent.primary,
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Download Extension
                    </a>
                  </div>
                </div>
                )}

                {/* Coming Soon Integrations */}
                <div style={{
                  border: `1px dashed ${colors.border.primary}`,
                  borderRadius: '12px',
                  padding: '24px',
                  opacity: 0.6
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: colors.background.secondary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Link2 size={24} color={colors.text.tertiary} />
                    </div>
                    <div>
                      <h3 style={{
                        margin: '0 0 4px 0',
                        fontSize: '18px',
                        fontWeight: 700,
                        color: colors.text.primary
                      }}>
                        More Integrations Coming Soon
                      </h3>
                      <p style={{
                        margin: 0,
                        fontSize: '14px',
                        color: colors.text.secondary
                      }}>
                        DAT, 123, and Direct Freight and other integrations coming soon
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'organization' && (
              <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px' }}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 900, color: colors.text.primary }}>Organization</h2>
                <p style={{ margin: '0 0 32px 0', color: colors.text.secondary, fontSize: '14px' }}>
                  Manage your organization membership and team access
                </p>

                {org ? (
                  <>
                    {/* Org header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', padding: '20px', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.secondary}` }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#1B7A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '18px', flexShrink: 0 }}>
                        {org.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>{org.name}</div>
                        {org.email_domain && <div style={{ fontSize: '13px', color: colors.text.secondary }}>@{org.email_domain}</div>}
                      </div>
                      <div style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: isOrgAdmin ? `${colors.accent.primary}20` : colors.background.primary, color: isOrgAdmin ? colors.accent.primary : colors.text.secondary, border: `1px solid ${isOrgAdmin ? colors.accent.primary : colors.border.secondary}` }}>
                        {isOrgAdmin ? 'Admin' : 'Member'}
                      </div>
                    </div>

                    {/* Members section */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: colors.text.primary }}>Members</h3>
                      {isOrgAdmin && (
                        <button
                          onClick={() => { setShowInviteModal(true); setInviteError(''); setInviteSuccess(''); setInviteEmail(''); }}
                          style={{ padding: '8px 18px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#0d1117', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          + Invite Member
                        </button>
                      )}
                    </div>

                    {loadingMembers ? (
                      <div style={{ color: colors.text.secondary, fontSize: '14px', padding: '20px 0' }}>Loading members...</div>
                    ) : isOrgAdmin ? (
                      <div style={{ border: `1px solid ${colors.border.secondary}`, borderRadius: '10px', overflow: 'hidden' }}>
                        {orgMembers.length === 0 ? (
                          <div style={{ padding: '20px', color: colors.text.secondary, fontSize: '14px', textAlign: 'center' }}>No members yet.</div>
                        ) : orgMembers.map((m, i) => (
                          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderBottom: i < orgMembers.length - 1 ? `1px solid ${colors.border.secondary}` : 'none' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `${colors.accent.primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.accent.primary, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                              {(m.full_name || m.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {m.full_name && <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>{m.full_name}</div>}
                              <div style={{ fontSize: '13px', color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                            </div>
                            <div style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: m.role === 'admin' ? `${colors.accent.primary}20` : colors.background.secondary, color: m.role === 'admin' ? colors.accent.primary : colors.text.secondary }}>
                              {m.role}
                            </div>
                            {m.user_id !== user?.id && (
                              <button
                                onClick={() => handleRemoveMember(m.user_id)}
                                style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${colors.border.secondary}`, borderRadius: '6px', color: colors.text.secondary, fontSize: '12px', cursor: 'pointer' }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: colors.text.secondary, fontSize: '14px' }}>Contact your org admin to manage members.</p>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '32px', textAlign: 'center', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.secondary}` }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: colors.text.primary }}>No Organization</p>
                    <p style={{ margin: 0, fontSize: '14px', color: colors.text.secondary }}>
                      You're not part of an organization. If your company uses Haul Monitor, ask an admin to invite you.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Invite Member Modal */}
            {showInviteModal && (
              <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                onClick={() => !inviting && setShowInviteModal(false)}
              >
                <div style={{ background: colors.background.card, borderRadius: '16px', maxWidth: '440px', width: '100%', border: `1px solid ${colors.border.primary}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}` }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>Invite Member</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: colors.text.secondary }}>Send an invite to join {org?.name}</p>
                  </div>
                  <form onSubmit={handleInvite} style={{ padding: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      disabled={inviting}
                      style={{ width: '100%', padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
                    />
                    {inviteError && <div style={{ padding: '10px', background: `${colors.accent.danger}20`, border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px', color: colors.accent.danger, fontSize: '13px', marginBottom: '16px' }}>{inviteError}</div>}
                    {inviteSuccess && <div style={{ padding: '10px', background: `${colors.accent.success}20`, border: `1px solid ${colors.accent.success}40`, borderRadius: '8px', color: colors.accent.success, fontSize: '13px', marginBottom: '16px' }}>{inviteSuccess}</div>}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button type="button" onClick={() => setShowInviteModal(false)} disabled={inviting} style={{ flex: 1, padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button type="submit" disabled={inviting} style={{ flex: 1, padding: '12px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#0d1117', fontSize: '14px', fontWeight: 700, cursor: inviting ? 'not-allowed' : 'pointer', opacity: inviting ? 0.7 : 1 }}>
                        {inviting ? 'Sending...' : 'Send Invite'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeSection === 'accessibility' && (
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '16px',
                padding: '32px'
              }}>
                <h2 style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: 900,
                  color: colors.text.primary
                }}>
                  Accessibility
                </h2>
                <p style={{
                  margin: '0 0 32px 0',
                  color: colors.text.secondary,
                  fontSize: '15px'
                }}>
                  Customize the appearance and accessibility features
                </p>

                {/* Theme Toggle */}
                <div style={{
                  padding: '24px',
                  background: colors.background.secondary,
                  border: `1px solid ${colors.border.primary}`,
                  borderRadius: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        margin: '0 0 4px 0',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: colors.text.primary
                      }}>
                        Theme
                      </h3>
                      <p style={{
                        margin: 0,
                        fontSize: '14px',
                        color: colors.text.secondary
                      }}>
                        Choose between light and dark mode
                      </p>
                    </div>
                  </div>

                  {/* Theme Options */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Light Mode Option */}
                    <button
                      onClick={() => theme === 'dark' && toggleTheme()}
                      style={{
                        padding: '16px',
                        background: theme === 'light' 
                          ? `linear-gradient(135deg, ${colors.accent.primary}20 0%, ${colors.accent.primary}10 100%)`
                          : colors.background.tertiary,
                        border: theme === 'light'
                          ? `2px solid ${colors.accent.primary}`
                          : `1px solid ${colors.border.primary}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                      onMouseEnter={(e) => {
                        if (theme !== 'light') {
                          e.currentTarget.style.borderColor = colors.border.accent;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (theme !== 'light') {
                          e.currentTarget.style.borderColor = colors.border.primary;
                        }
                      }}
                    >
                      <Sun 
                        size={32} 
                        color={theme === 'light' ? colors.accent.primary : colors.text.secondary}
                        style={{ marginBottom: '8px' }}
                      />
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: theme === 'light' ? colors.accent.primary : colors.text.primary,
                        marginBottom: '4px'
                      }}>
                        Light Mode
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: colors.text.tertiary
                      }}>
                        Bright and clean
                      </div>
                      {theme === 'light' && (
                        <div style={{
                          marginTop: '8px',
                          padding: '4px 12px',
                          background: colors.accent.primary,
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#fff',
                          display: 'inline-block'
                        }}>
                          Active
                        </div>
                      )}
                    </button>

                    {/* Dark Mode Option */}
                    <button
                      onClick={() => theme === 'light' && toggleTheme()}
                      style={{
                        padding: '16px',
                        background: theme === 'dark' 
                          ? `linear-gradient(135deg, ${colors.accent.purple}20 0%, ${colors.accent.purple}10 100%)`
                          : colors.background.tertiary,
                        border: theme === 'dark'
                          ? `2px solid ${colors.accent.purple}`
                          : `1px solid ${colors.border.primary}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                      onMouseEnter={(e) => {
                        if (theme !== 'dark') {
                          e.currentTarget.style.borderColor = colors.border.accent;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (theme !== 'dark') {
                          e.currentTarget.style.borderColor = colors.border.primary;
                        }
                      }}
                    >
                      <Moon 
                        size={32} 
                        color={theme === 'dark' ? colors.accent.purple : colors.text.secondary}
                        style={{ marginBottom: '8px' }}
                      />
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: theme === 'dark' ? colors.accent.purple : colors.text.primary,
                        marginBottom: '4px'
                      }}>
                        Dark Mode
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: colors.text.tertiary
                      }}>
                        Easy on the eyes
                      </div>
                      {theme === 'dark' && (
                        <div style={{
                          marginTop: '8px',
                          padding: '4px 12px',
                          background: colors.accent.purple,
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#fff',
                          display: 'inline-block'
                        }}>
                          Active
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Info Box */}
                <div style={{
                  padding: '16px',
                  background: `${colors.accent.info}15`,
                  border: `1px solid ${colors.accent.info}40`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: colors.text.secondary
                }}>
                  Your theme preference is saved automatically and will persist across sessions.
                </div>
              </div>
            )}

            {activeSection === 'developer' && (
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: '16px',
                padding: '32px'
              }}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 900, color: colors.text.primary }}>
                  Developer
                </h2>
                <p style={{ margin: '0 0 28px 0', color: colors.text.secondary, fontSize: '15px' }}>
                  Testing and development tools. Not visible to end users.
                </p>

                <div style={{
                  padding: '20px 24px',
                  background: colors.background.secondary,
                  border: `1px solid ${colors.border.primary}`,
                  borderRadius: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>
                        Bypass Credit Gate
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary }}>
                        Skip credit deduction on searches. Searches run free while enabled.
                      </p>
                    </div>
                    <div
                      onClick={toggleCreditsBypass}
                      role="switch"
                      aria-checked={creditsBypass}
                      style={{
                        width: '44px', height: '24px', borderRadius: '12px',
                        background: creditsBypass ? colors.accent.primary : colors.border.secondary,
                        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        flexShrink: 0, marginLeft: '16px'
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '3px',
                        left: creditsBypass ? '23px' : '3px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }} />
                    </div>
                  </div>
                  {creditsBypass && (
                    <div style={{
                      marginTop: '12px', padding: '8px 12px',
                      background: `${colors.accent.primary}15`,
                      border: `1px solid ${colors.accent.primary}40`,
                      borderRadius: '6px', fontSize: '12px', color: colors.accent.primary, fontWeight: 600
                    }}>
                      Credit gate is bypassed — searches will not deduct credits
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Truckstop Connection Modal */}
      {showTsModal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => !tsConnecting && setShowTsModal(false)}
        >
          <div
            style={{ background: colors.background.card, borderRadius: '16px', maxWidth: '480px', width: '100%', border: `1px solid ${colors.border.primary}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#1B7A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '13px' }}>
                TS
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>
                  {tsConnection?.connected ? 'Edit Truckstop Credentials' : 'Connect to Truckstop'}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: colors.text.secondary }}>
                  Enter your Truckstop API token, username, and password
                </p>
              </div>
            </div>

            <form onSubmit={handleTsConnect} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                  API Token
                </label>
                <input
                  type="text"
                  value={tsApiToken}
                  onChange={(e) => setTsApiToken(e.target.value)}
                  placeholder={tsConnection?.connected ? 'Enter new API token' : 'Paste your Truckstop API token'}
                  disabled={tsConnecting}
                  autoComplete="off"
                  style={{ width: '100%', padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                  Username
                </label>
                <input
                  type="text"
                  value={tsUsername}
                  onChange={(e) => setTsUsername(e.target.value)}
                  placeholder="Truckstop username or email"
                  disabled={tsConnecting}
                  autoComplete="username"
                  style={{ width: '100%', padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                  Password
                </label>
                <input
                  type="password"
                  value={tsPassword}
                  onChange={(e) => setTsPassword(e.target.value)}
                  placeholder={tsConnection?.connected ? 'Enter new password' : 'Truckstop password'}
                  disabled={tsConnecting}
                  autoComplete="current-password"
                  style={{ width: '100%', padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {tsError && (
                <div style={{ padding: '12px', background: `${colors.accent.danger}20`, border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px', color: colors.accent.danger, fontSize: '14px', marginBottom: '16px' }}>
                  {tsError}
                </div>
              )}

              <p style={{ margin: '0 0 24px 0', fontSize: '12px', color: colors.text.tertiary, lineHeight: '1.5' }}>
                Users with the same company email domain will share these credentials — you only need to enter them once for your organization.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => { setShowTsModal(false); setTsApiToken(''); setTsPassword(''); setTsError(''); }}
                  disabled={tsConnecting}
                  style={{ flex: 1, padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: tsConnecting ? 'not-allowed' : 'pointer', opacity: tsConnecting ? 0.5 : 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={tsConnecting}
                  style={{ flex: 1, padding: '12px', background: '#1B7A4A', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: tsConnecting ? 'not-allowed' : 'pointer', opacity: tsConnecting ? 0.7 : 1 }}
                >
                  {tsConnecting ? 'Saving...' : tsConnection?.connected ? 'Update Credentials' : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DAT Connection Modal */}
      {showDatModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: colors.background.card,
            borderRadius: '16px',
            padding: '32px',
            width: '100%',
            maxWidth: '440px',
            border: `1px solid ${colors.border.primary}`,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#0066CC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 900,
                fontSize: '14px'
              }}>
                DAT
              </div>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 700,
                  color: colors.text.primary
                }}>
                  Connect to DAT
                </h3>
                <p style={{
                  margin: '4px 0 0 0',
                  fontSize: '14px',
                  color: colors.text.secondary
                }}>
                  Link your DAT One account
                </p>
              </div>
            </div>

            {/* Link Form */}
            <form onSubmit={handleDatConnect}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: colors.text.primary
                }}>
                  DAT Account Email
                </label>
                <input
                  type="email"
                  value={datEmail}
                  onChange={(e) => setDatEmail(e.target.value)}
                  placeholder="Enter your DAT account email"
                  disabled={datConnecting}
                  autoComplete="email"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: colors.background.primary,
                    border: `1px solid ${colors.border.accent}`,
                    borderRadius: '8px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <p style={{
                  margin: '8px 0 0 0',
                  fontSize: '12px',
                  color: colors.text.tertiary
                }}>
                  Use the email associated with your DAT One subscription
                </p>
              </div>

              {/* Error Message */}
              {datError && (
                <div style={{
                  padding: '12px',
                  background: `${colors.accent.danger}20`,
                  border: `1px solid ${colors.accent.danger}`,
                  borderRadius: '8px',
                  color: colors.accent.danger,
                  fontSize: '14px',
                  marginBottom: '16px'
                }}>
                  {datError}
                </div>
              )}

              {/* Info Box */}
              <div style={{
                padding: '12px',
                background: `${colors.accent.info}15`,
                border: `1px solid ${colors.accent.info}40`,
                borderRadius: '8px',
                fontSize: '13px',
                color: colors.text.secondary,
                marginBottom: '24px'
              }}>
                Linking your DAT email enables Haul Monitor to retrieve loads on your behalf. Make sure this email has an active DAT One subscription with the required seats (Connexion, Load Board).
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDatModal(false);
                    setDatEmail('');
                    setDatError('');
                  }}
                  disabled={datConnecting}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'transparent',
                    border: `1px solid ${colors.border.accent}`,
                    borderRadius: '8px',
                    color: colors.text.primary,
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: datConnecting ? 'not-allowed' : 'pointer',
                    opacity: datConnecting ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={datConnecting}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#0066CC',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: datConnecting ? 'not-allowed' : 'pointer',
                    opacity: datConnecting ? 0.7 : 1
                  }}
                >
                  {datConnecting ? 'Linking...' : 'Link Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Freight Connection Modal */}
      {showDfModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            zIndex: 10000, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '20px'
          }}
          onClick={() => !dfConnecting && setShowDfModal(false)}
        >
          <div
            style={{
              background: colors.background.overlay, borderRadius: '16px',
              maxWidth: '480px', width: '100%',
              border: `1px solid ${colors.border.accent}`,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '10px', background: '#1a3a5c',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 900, fontSize: '11px'
              }}>
                DF
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: 700, color: colors.text.primary }}>
                  Connect to Direct Freight
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: colors.text.secondary }}>
                  Enter your Direct Freight login credentials
                </p>
              </div>
            </div>

            <form onSubmit={handleDfConnect} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                  Username or Email
                </label>
                <input
                  type="text"
                  value={dfUsername}
                  onChange={(e) => setDfUsername(e.target.value)}
                  placeholder="Username or email address"
                  disabled={dfConnecting}
                  autoComplete="username"
                  style={{
                    width: '100%', padding: '12px', background: colors.background.secondary,
                    border: `1px solid ${colors.border.accent}`, borderRadius: '8px',
                    color: colors.text.primary, fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>
                  Password
                </label>
                <input
                  type="password"
                  value={dfPassword}
                  onChange={(e) => setDfPassword(e.target.value)}
                  placeholder="Your Direct Freight password"
                  disabled={dfConnecting}
                  autoComplete="current-password"
                  style={{
                    width: '100%', padding: '12px', background: colors.background.secondary,
                    border: `1px solid ${colors.border.accent}`, borderRadius: '8px',
                    color: colors.text.primary, fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {dfError && (
                <div style={{
                  padding: '12px', background: `${colors.accent.danger}20`,
                  border: `1px solid ${colors.accent.danger}40`, borderRadius: '8px',
                  color: colors.accent.danger, fontSize: '14px', marginBottom: '16px'
                }}>
                  {dfError}
                </div>
              )}

              <p style={{ margin: '0 0 24px 0', fontSize: '12px', color: colors.text.tertiary, lineHeight: '1.5' }}>
                Your credentials are used once to obtain an API token. The password is never stored.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => { setShowDfModal(false); setDfUsername(''); setDfPassword(''); setDfError(''); }}
                  disabled={dfConnecting}
                  style={{
                    flex: 1, padding: '12px', background: colors.background.secondary,
                    border: `1px solid ${colors.border.accent}`, borderRadius: '8px',
                    color: colors.text.primary, fontSize: '14px', fontWeight: 600,
                    cursor: dfConnecting ? 'not-allowed' : 'pointer', opacity: dfConnecting ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dfConnecting}
                  style={{
                    flex: 1, padding: '12px', background: '#1a3a5c',
                    border: 'none', borderRadius: '8px', color: '#fff',
                    fontSize: '14px', fontWeight: 700,
                    cursor: dfConnecting ? 'not-allowed' : 'pointer', opacity: dfConnecting ? 0.7 : 1
                  }}
                >
                  {dfConnecting ? 'Connecting...' : 'Connect Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
