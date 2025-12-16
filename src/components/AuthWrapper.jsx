import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Login } from './Login';
import { SignUp } from './SignUp';

export const AuthWrapper = ({ children }) => {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(true);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
        color: '#e8eaed',
        fontSize: '18px',
        fontWeight: 600
      }}>
        Loading...
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

  return children;
};
