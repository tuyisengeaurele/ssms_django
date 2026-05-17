import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg, #f8faf9)', padding: '2rem', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: '#fef2f2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 1.5rem',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: '0.75rem' }}>
            An unexpected error occurred. Please refresh the page or go back to the dashboard.
          </p>
          {this.state.error && (
            <details style={{ textAlign: 'left', marginBottom: '1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
              <summary style={{ fontSize: '0.78rem', color: 'var(--text-faint)', cursor: 'pointer', fontWeight: 600 }}>Error details</summary>
              <pre style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'transparent',
                color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              Refresh page
            </button>
            <a
              href="/"
              style={{
                padding: '0.6rem 1.25rem', borderRadius: 10,
                background: 'var(--brand-600, #16a34a)', color: '#fff',
                fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
