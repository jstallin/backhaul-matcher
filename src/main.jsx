import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AppV2 from './AppV2.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'

// v2 is the default UI. Admins can revert to v1 via Settings → Developer.
const useV2 = localStorage.getItem('hm_ui') !== 'v1';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        {useV2 ? <AppV2 /> : <App />}
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
