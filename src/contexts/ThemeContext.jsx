import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Default to light theme now
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'light';
  });

  useEffect(() => {
    // Save theme preference
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const colors = theme === 'dark' ? {
    // Dark mode colors (rarely used)
    background: {
      primary: '#0f1419',
      secondary: '#1a1f2e',
      tertiary: '#232936',
      card: '#1a1f2e',
      hover: '#232936',
      overlay: '#1a1f2e'
    },
    text: {
      primary: '#e8eaed',
      secondary: '#8b92a7',
      tertiary: '#6b7280',
      inverse: '#0f1419'
    },
    border: {
      primary: 'rgba(94, 160, 219, 0.2)',
      secondary: 'rgba(94, 160, 219, 0.1)',
      accent: 'rgba(94, 160, 219, 0.3)'
    },
    accent: {
      primary: '#D89F38',      // Haul Monitor golden amber
      secondary: '#E8B55E',    // Lighter amber
      tertiary: '#C08920',     // Darker amber
      blue: '#5EA0DB',         // Keep blue for certain UI elements
      charcoal: '#2C3744',     // Haul Monitor charcoal
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#5EA0DB'
    }
  } : {
    // Light mode colors - CLEAN & FRESH
    background: {
      primary: '#FAFBFC',           // Off-white, very light
      secondary: '#FFFFFF',         // Pure white
      tertiary: '#F5F7FA',          // Slight gray tint
      card: '#FFFFFF',              // Pure white cards
      hover: '#F5F7FA',             // Subtle hover
      overlay: '#FFFFFF'            // White overlay
    },
    text: {
      primary: '#1a202c',           // Dark gray, almost black
      secondary: '#4a5568',         // Medium gray
      tertiary: '#718096',          // Light gray
      inverse: '#ffffff'            // White text on blue
    },
    border: {
      primary: '#E2E8F0',           // Light gray border
      secondary: '#EDF2F7',         // Very light border
      accent: '#CBD5E0'             // Medium border
    },
    accent: {
      primary: '#D89F38',           // Haul Monitor golden amber (primary brand)
      secondary: '#E8B55E',         // Lighter amber (hover states)
      tertiary: '#C08920',          // Darker amber (active states)
      blue: '#5EA0DB',              // Keep blue for certain UI elements
      charcoal: '#2C3744',          // Haul Monitor charcoal
      success: '#48BB78',           // Green
      warning: '#ED8936',           // Orange
      danger: '#F56565',            // Red
      info: '#4299E1'               // Info blue
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
