import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem',
          background: 'var(--color-alabaster)',
          fontFamily: 'var(--font-body)',
        }}>
          <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
            <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
            <div style={{
              width: '64px', height: '64px',
              border: '1px solid var(--color-charcoal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}>
              <AlertCircle size={28} strokeWidth={1.5} style={{ color: '#C62828' }} />
            </div>

            <h2 style={{
              fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400,
              color: 'var(--color-charcoal)', marginBottom: '0.75rem',
            }}>
              Something went wrong
            </h2>

            <p style={{
              fontSize: '0.875rem', color: 'var(--color-warm-grey)', lineHeight: 1.6,
              marginBottom: '1.5rem',
            }}>
              An unexpected error occurred. Please try refreshing the page.
              {this.state.error?.message && (
                <span style={{
                  display: 'block', marginTop: '0.75rem', fontSize: '0.7rem',
                  color: 'var(--color-warm-grey)', fontFamily: 'monospace',
                  padding: '10px 0', borderTop: '1px solid rgba(26, 26, 26, 0.12)',
                }}>
                  {this.state.error.message}
                </span>
              )}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={this.handleReload}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 32px', height: '48px',
                  background: 'var(--color-charcoal)', color: '#FFFFFF', border: 'none',
                  fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500,
                  letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer',
                }}>
                <RefreshCw size={14} strokeWidth={1.5} /> Refresh Page
              </button>
              <button onClick={this.handleReset}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 32px', height: '48px',
                  background: 'transparent', color: 'var(--color-charcoal)',
                  border: '1px solid var(--color-charcoal)',
                  fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500,
                  letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer',
                }}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
