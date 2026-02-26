import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HaulMonitorLogo } from './HaulMonitorLogo';

export const Login = ({ onToggleMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setResetEmailSent(false);

    if (!email || !email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      const { supabase } = await import('../lib/supabase');
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (resetError) throw resetError;

      setResetEmailSent(true);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
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
            {showForgotPassword ? 'Reset your password' : 'Sign in to your account'}
          </p>
        </div>

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

        {/* Success message for password reset */}
        {resetEmailSent && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            color: '#16a34a',
            fontSize: '14px',
            marginBottom: '24px'
          }}>
            Password reset email sent! Check your inbox and spam folder.
          </div>
        )}

        {showForgotPassword ? (
          /* Password Reset Form */
          <form onSubmit={handlePasswordReset}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#1a1a1a'
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter your email address"
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
                margin: '8px 0 0 0', 
                fontSize: '13px', 
                color: '#666666' 
              }}>
                We'll send you a link to reset your password
              </p>
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
                opacity: loading ? 0.7 : 1,
                marginBottom: '16px'
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setResetEmailSent(false);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px',
                background: '#ffffff',
                border: '1px solid #d0d0d0',
                borderRadius: '8px',
                color: '#666666',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              Back to Sign In
            </button>
          </form>
        ) : (
          /* Login form */
          <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a1a1a'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
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

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a1a1a'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Forgot Password Link */}
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(true);
                setError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#008b00',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '14px',
                fontWeight: 600,
                padding: 0
              }}
            >
              Forgot Password?
            </button>
          </div>
        </form>
        )}

        {/* Sign up link - only show when not in forgot password mode */}
        {!showForgotPassword && (
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <p style={{ color: '#666666', fontSize: '14px', margin: 0 }}>
              Don't have an account?{' '}
              <button
                onClick={onToggleMode}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#008b00',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: 0
                }}
              >
                Sign Up
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
