import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any): State {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ paddingTop: 32 }}>
          <div className="card">
            <div className="card-header">Something went wrong</div>
            <div className="card-body">
              <div className="muted" style={{ marginBottom: 8 }}>{this.state.message || 'Unknown error'}</div>
              <div className="muted" style={{ fontSize: 12 }}>Check browser console for details.</div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

