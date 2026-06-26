// #181: app-wide error boundary. Before this, any uncaught render exception
// (e.g. a stray object rendered as a React child) white-screened the entire app
// with no recovery. This catches it and shows a friendly fallback + reload, so a
// single bad render degrades gracefully instead of taking down the whole UI.
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surfaced in the console for diagnosis; a logging endpoint can hook in here later.
    console.error('App crash caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: '#f8fafc', fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      }}>
        <div style={{
          maxWidth: '460px', width: '100%', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '14px', padding: '28px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 20px', lineHeight: 1.5 }}>
            The page hit an unexpected error and couldn’t finish loading. Reloading usually fixes it.
            If it keeps happening, let the team know what you were doing.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 22px', background: '#2563eb', border: 'none', borderRadius: '8px',
              color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {this.state.error?.message && (
            <pre style={{
              marginTop: '18px', textAlign: 'left', fontSize: '11px', color: '#94a3b8',
              background: '#f1f5f9', borderRadius: '8px', padding: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {String(this.state.error.message)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
