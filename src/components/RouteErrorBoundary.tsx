import {
  Component,
  createRef,
  useLayoutEffect,
  useRef,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function PageFailure({
  error,
  onRetry,
  containerRef,
}: {
  error: Error;
  onRetry: () => void;
  containerRef: RefObject<HTMLDivElement>;
}) {
  usePageTitle('Page unavailable');
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => heading.current?.focus({ preventScroll: true }), []);
  // React.lazy retains a rejected module promise. A renderer reload creates a
  // fresh module request; resetting only the boundary would reject it again.
  const reloadRequired =
    error.name === 'ChunkLoadError' ||
    /loading (?:css )?chunk .*failed|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(
      error.message
    );

  return (
    <div ref={containerRef} className="page-recovery" role="alert">
      <div className="page-recovery-content">
        <div className="page-recovery-icon ui-warning" aria-hidden="true">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 ref={heading} tabIndex={-1} className="page-recovery-title">
          This page couldn’t load
        </h1>
        <p className="page-recovery-description">
          {reloadRequired
            ? 'Part of the app couldn’t be loaded. Reload the app to try again.'
            : 'Try again, or return to the dashboard to continue.'}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reloadRequired ? () => window.location.reload() : onRetry}
            className="ui-button ui-button-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            {reloadRequired ? 'Reload app' : 'Try again'}
          </button>
          <Link
            to="/"
            replace
            className="ui-button ui-button-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Back to Dashboard
          </Link>
        </div>
        {error.message && (
          <details className="page-recovery-details">
            <summary>Technical details</summary>
            <pre>{error.message.slice(0, 2000)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

class PageErrorBoundary extends Component<Props & { resetKey: string }, State> {
  state: State = { error: null };
  private fallback = createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: unknown): State {
    return {
      error:
        error instanceof Error ? error : new Error('An unexpected error occurred on this page.'),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route error boundary caught:', error, errorInfo);
  }

  componentDidUpdate(previous: Props & { resetKey: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.reset();
  }

  private reset = () => {
    const container = this.fallback.current?.parentElement;
    this.setState({ error: null }, () => {
      if (this.state.error || !container?.isConnected) return;
      const target = container.querySelector<HTMLElement>('h1') ?? container;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
  };

  render() {
    if (this.state.error)
      return (
        <PageFailure error={this.state.error} onRetry={this.reset} containerRef={this.fallback} />
      );
    return this.props.children;
  }
}

export function RouteErrorBoundary({ children }: Props) {
  const location = useLocation();
  // Reset failed content on navigation, including a second visit to the same
  // address. Healthy content keeps its component state and unsent input.
  const resetKey = JSON.stringify([
    location.key,
    location.pathname,
    location.search,
    location.hash,
  ]);
  return <PageErrorBoundary resetKey={resetKey}>{children}</PageErrorBoundary>;
}
