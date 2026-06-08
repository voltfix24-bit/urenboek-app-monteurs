import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[TerreVolt] App error:', error);
    console.error('[TerreVolt] Component stack:', info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          fontFamily: 'DM Sans, system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚡</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Er ging iets mis
          </h1>
          <p style={{
            fontSize: 14,
            opacity: 0.7,
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.5,
            marginBottom: 24,
          }}>
            De app heeft een fout ondervonden. Je gegevens zijn veilig — probeer opnieuw te laden.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              fontSize: 11,
              padding: 12,
              borderRadius: 8,
              background: 'hsl(var(--muted))',
              color: 'hsl(var(--destructive))',
              maxWidth: '90vw',
              overflow: 'auto',
              marginBottom: 24,
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            Opnieuw laden
          </button>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              fontSize: 12,
              color: 'hsl(var(--muted-foreground))',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Toch doorgaan
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[TerreVolt] Route error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          textAlign: 'center',
          fontFamily: 'DM Sans, system-ui, sans-serif',
          color: 'hsl(var(--foreground))',
        }}>
          <p style={{ fontSize: 14, opacity: 0.7 }}>
            Deze pagina kon niet worden geladen.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 10,
              background: 'hsl(#10b981)',
              border: '1px solid hsl(#e5e7eb)',
              color: 'hsl(var(--accent-foreground))',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Probeer opnieuw
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
