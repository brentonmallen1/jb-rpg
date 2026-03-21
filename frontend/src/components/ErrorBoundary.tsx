import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  /** Optional fallback UI */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="container page-centered">
          <h1 className="text-danger mb-md">Something went wrong</h1>
          <p className="text-secondary mb-lg">
            An unexpected error occurred. Please try again.
          </p>
          <button className="btn" onClick={this.handleRetry}>
            Try Again
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-lg text-left text-sm" style={{
              background: 'var(--bg-secondary)',
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              overflow: 'auto',
              maxWidth: '100%'
            }}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
