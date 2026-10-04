import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ReportsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ReportsErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          className="card"
          style={{
            padding: '1.5rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-warm, #f59e0b)' }}>
            <AlertTriangle size={18} />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {this.props.sectionName ? `Unable to load ${this.props.sectionName}` : 'Section could not be loaded'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            An unexpected error occurred while rendering this section.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={this.handleRetry}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RefreshCw size={13} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
