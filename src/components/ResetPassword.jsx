import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect } from 'react';
import { Truck, Lock } from '../icons';

export const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { supabase } = await import('../lib/supabase');

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;

      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: '#f5f5f5',
        border: '1px solid #e0e0e0',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)'
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '32px',
          gap: '16px'
        }}>
          <HaulMonitorLogo size="large" variant="full" showText={false} />
          <p style={{ margin: 0, color: '#666666', fontSize: '14px' }}>
            Set your new password
          </p>
        </div>

        {success ? (
          /* Success Message */
          <div style={{
            padding: '24px',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '20px',
              fontWeight: 700,
              color: '#16a34a'
            }}>
              Password Reset Successful!
            </h3>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: '#666666'
            }}>
              Redirecting you to login...
            </p>
          </div>
        ) : (
          <>
            {/* Error message */}
            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '14px',
                marginBottom: '24px'
              }}>
                {error}
              </div>
            )}

            {/* Reset Password Form */}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1a1a1a'
                }}>
                  <Lock size={16} color="#008b00" />
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Enter your new password"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#ffffff',
                    border: '1px solid #d0d0d0',
                    borderRadius: '8px',
                    color: '#1a1a1a',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#008b00'}
                  onBlur={(e) => e.target.style.borderColor = '#d0d0d0'}
                />
                <p style={{
                  margin: '6px 0 0 0',
                  fontSize: '12px',
                  color: '#666666'
                }}>
                  Must be at least 6 characters
                </p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1a1a1a'
                }}>
                  <Lock size={16} color="#008b00" />
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Confirm your new password"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#ffffff',
                    border: '1px solid #d0d0d0',
                    borderRadius: '8px',
                    color: '#1a1a1a',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#008b00'}
                  onBlur={(e) => e.target.style.borderColor = '#d0d0d0'}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? 'rgba(0, 139, 0, 0.5)' : 'linear-gradient(135deg, #008b00 0%, #00a300 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Resetting Password...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
