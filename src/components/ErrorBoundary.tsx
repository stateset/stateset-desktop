import React from 'react';
import * as Sentry from '@sentry/electron/renderer';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  eventId: string | null;
  showDetails: boolean;
  copied: boolean;
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

/**
 * Determines a user-friendly error category based on the error message
 */
function getErrorCategory(error: Error | null): {
  title: string;
  description: string;
  suggestion: string;
} {
  if (!error) {
    return {
      title: 'Something went wrong',
      description: 'An unexpected error occurred.',
      suggestion: 'Try reloading the app.',
    };
  }

  const message = error.message.toLowerCase();

  if (message.includes('network') || message.includes('fetch') || message.includes('cors')) {
    return {
      title: 'Connection Error',
      description: 'Unable to connect to the server.',
      suggestion: 'Check your internet connection and try again.',
    };
  }

  if (message.includes('auth') || message.includes('unauthorized') || message.includes('403')) {
    return {
      title: 'Authentication Error',
      description: 'Your session may have expired.',
      suggestion: 'Try logging out and back in.',
    };
  }

  if (message.includes('memory') || message.includes('heap')) {
    return {
      title: 'Memory Error',
      description: 'The app ran out of memory.',
      suggestion: 'Close some tabs or restart the app.',
    };
  }

  if (message.includes('render') || message.includes('component')) {
    return {
      title: 'Display Error',
      description: 'A component failed to render.',
      suggestion: 'Click "Try again" or reload the app.',
    };
  }

  return {
    title: 'Unexpected Error',
    description: 'The app encountered an unexpected problem.',
    suggestion: 'If this persists, please report the issue.',
  };
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    eventId: null,
    showDetails: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Store error info for display
    this.setState({ errorInfo: info });

    // Log to console in development
    console.error('Unhandled UI error:', error, info);

    // Report to Sentry in production
    if (import.meta.env.PROD && sentryDsn) {
      const eventId = Sentry.captureException(error, {
        extra: {
          componentStack: info.componentStack,
        },
      });
      this.setState({ eventId });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
      showDetails: false,
      copied: false,
    });
  };

  handleToggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  handleCopyError = async () => {
    const { error, errorInfo, eventId } = this.state;
    let appVersion = 'unknown';

    try {
      if (window.electronAPI?.app?.getVersion) {
        const version = await window.electronAPI.app.getVersion();
        appVersion = typeof version === 'string' ? version : appVersion;
      }
    } catch {
      appVersion = 'unknown';
    }

    const errorDetails = [
      `Error: ${error?.message || 'Unknown error'}`,
      error?.stack ? `\nStack Trace:\n${error.stack}` : '',
      errorInfo?.componentStack ? `\nComponent Stack:${errorInfo.componentStack}` : '',
      eventId ? `\nSentry Event ID: ${eventId}` : '',
      `\nApp Version: ${appVersion}`,
      `\nTimestamp: ${new Date().toISOString()}`,
    ].join('');

    try {
      await navigator.clipboard.writeText(errorDetails);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      console.error('Failed to copy error details');
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, eventId, showDetails, copied } = this.state;
      const category = getErrorCategory(error);

      return (
        <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-8">
          <div className="max-w-lg w-full space-y-6">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold">{category.title}</h1>
              <p className="text-gray-400">{category.description}</p>
              <p className="text-sm text-gray-500">{category.suggestion}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500 transition-colors"
              >
                Reload app
              </button>
            </div>

            {/* Error Details Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={this.handleToggleDetails}
                className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-400 hover:bg-gray-800/50 transition-colors"
              >
                <span>Error Details</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showDetails && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Error Message */}
                  {error?.message && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Error Message</p>
                      <pre className="text-xs text-red-300 bg-gray-950 rounded p-2 overflow-auto max-h-20">
                        {error.message}
                      </pre>
                    </div>
                  )}

                  {/* Stack Trace (dev only) */}
                  {import.meta.env.DEV && error?.stack && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Stack Trace</p>
                      <pre className="text-xs text-gray-400 bg-gray-950 rounded p-2 overflow-auto max-h-32">
                        {error.stack}
                      </pre>
                    </div>
                  )}

                  {/* Component Stack (dev only) */}
                  {import.meta.env.DEV && errorInfo?.componentStack && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Component Stack</p>
                      <pre className="text-xs text-gray-400 bg-gray-950 rounded p-2 overflow-auto max-h-32">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}

                  {/* Event ID */}
                  {eventId && (
                    <p className="text-xs text-gray-500">
                      Error ID: <code className="text-gray-400">{eventId}</code>
                    </p>
                  )}

                  {/* Copy Button */}
                  <button
                    onClick={this.handleCopyError}
                    className="w-full mt-2 px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <>
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy error details
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-friendly error boundary wrapper
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
