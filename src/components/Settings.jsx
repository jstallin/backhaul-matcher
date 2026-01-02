import { useState } from 'react';
import { Settings as SettingsIcon, Sun, Moon, ChevronRight, User, Lock } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export const Settings = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState('accessibility');
  const { theme, toggleTheme, colors } = useTheme();
  const { user } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const sections = [
    { id: 'general', label: 'General', icon: SettingsIcon, badge: null },
    { id: 'account', label: 'Account & Access', icon: User, badge: null },
    { id: 'accessibility', label: 'Accessibility', icon: Sun, badge: null }
  ];

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
                  💡 Your theme preference is saved automatically and will persist across sessions.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
