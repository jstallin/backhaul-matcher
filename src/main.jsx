import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AppV2 from './AppV2.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'

// Append ?v2 to the URL to activate the new UI, or go to /?v2=false to revert.
// The choice is persisted in localStorage so it survives navigation.
const params = new URLSearchParams(window.location.search);
if (params.has('v2')) {
  const enable = params.get('v2') !== 'false';
  enable
    ? localStorage.setItem('hm_ui', 'v2')
    : localStorage.removeItem('hm_ui');
}
const useV2 = localStorage.getItem('hm_ui') === 'v2';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        {useV2 ? <AppV2 /> : <App />}
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
