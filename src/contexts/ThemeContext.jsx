import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Check localStorage for saved preference
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'dark';
  });

  useEffect(() => {
    // Save theme preference
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const colors = theme === 'dark' ? {
    // Dark mode colors (current)
    background: {
      primary: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2a1f3a 100%)',
      secondary: 'rgba(26, 31, 58, 0.6)',
      tertiary: 'rgba(26, 31, 58, 0.4)',
      card: 'rgba(26, 31, 58, 0.8)',
      hover: 'rgba(26, 31, 58, 0.8)',
      overlay: 'rgba(26, 31, 58, 0.98)'
    },
    text: {
      primary: '#e8eaed',
      secondary: '#8b92a7',
      tertiary: '#6b7280',
      inverse: '#0a0e27'
    },
    border: {
      primary: 'rgba(255, 255, 255, 0.1)',
      secondary: 'rgba(255, 255, 255, 0.08)',
      accent: 'rgba(255, 255, 255, 0.15)'
    },
    accent: {
      orange: '#ff6b35',
      cyan: '#00d4ff',
      purple: '#a855f7',
      green: '#10b981',
      red: '#ef4444',
      yellow: '#f59e0b',
      blue: '#3b82f6'
    }
  } : {
    // Light mode colors - IMPROVED CONTRAST
    background: {
      primary: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
      secondary: 'rgba(255, 255, 255, 0.9)',
      tertiary: 'rgba(248, 250, 252, 0.8)',
      card: 'rgba(255, 255, 255, 0.95)',
      hover: 'rgba(241, 245, 249, 0.95)',
      overlay: 'rgba(255, 255, 255, 0.98)'
    },
    text: {
      primary: '#0f172a',      // Much darker for better contrast
      secondary: '#334155',     // Darker gray instead of light
      tertiary: '#475569',      // Medium gray instead of light
      inverse: '#ffffff'
    },
    border: {
      primary: 'rgba(15, 23, 42, 0.15)',    // Darker borders
      secondary: 'rgba(15, 23, 42, 0.1)',
      accent: 'rgba(15, 23, 42, 0.2)'
    },
    accent: {
      orange: '#ea580c',
      cyan: '#0891b2',
      purple: '#9333ea',
      green: '#059669',
      red: '#dc2626',
      yellow: '#d97706',
      blue: '#2563eb'
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
