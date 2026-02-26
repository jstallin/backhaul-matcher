import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HaulMonitorLogo } from './HaulMonitorLogo';

export const SignUp = ({ onToggleMode }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('fleet_manager');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, fullName, role);
      setSuccess(true);
      // Note: User will receive a confirmation email
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: '32px',
            color: '#fff'
          }}>
            ✓
          </div>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 800, color: '#1a1a1a' }}>
            Check Your Email
          </h2>
          <p style={{ margin: 0, color: '#666666', fontSize: '15px', lineHeight: '1.6' }}>
            We've sent you a confirmation email. Please check your inbox and click the link to verify your account.
          </p>
          <button
            onClick={onToggleMode}
            style={{
              marginTop: '24px',
              padding: '12px 24px',
              background: '#ffffff',
              border: '1px solid #d0d0d0',
              borderRadius: '8px',
              color: '#666666',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

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
            Create your account
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

        {/* Sign up form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a1a1a'
            }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a1a1a'
            }}>
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
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
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <option value="fleet_manager">Fleet Manager</option>
              <option value="driver">Driver</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
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

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a1a1a'
            }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* Login link */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ color: '#666666', fontSize: '14px', margin: 0 }}>
            Already have an account?{' '}
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
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
