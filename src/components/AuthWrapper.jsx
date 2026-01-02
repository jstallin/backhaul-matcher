import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Login } from './Login';
import { SignUp } from './SignUp';
import { DriverDashboard } from './DriverDashboard';
import { useTheme } from '../contexts/ThemeContext';

export const AuthWrapper = ({ children }) => {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const [showLogin, setShowLogin] = useState(true);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    if (user) {
      // Check user role from metadata
      const role = user.user_metadata?.role || 'fleet_manager';
      setUserRole(role);
    }
  }, [user]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.background.primary,
        color: colors.text.primary,
        fontSize: '18px',
        fontWeight: 600
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            border: `4px solid ${colors.accent.primary}40`, 
            borderTop: `4px solid ${colors.accent.primary}`, 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite', 
            margin: '0 auto 16px' 
          }} />
          <div>Loading...</div>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return showLogin ? (
      <Login onToggleMode={() => setShowLogin(false)} />
    ) : (
      <SignUp onToggleMode={() => setShowLogin(true)} />
    );
  }

  // Route based on user role
  if (userRole === 'driver') {
    return <DriverDashboard />;
  }

  // Default: fleet_manager or other roles
  return children;
};
