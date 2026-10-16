import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';

export default function PageNotFound() {
  usePageTitle('Page not found');
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <section className="page-recovery" aria-labelledby="page-not-found-title">
      <div className="page-recovery-content">
        <div className="page-recovery-icon" aria-hidden="true">
          <Search className="h-5 w-5" />
        </div>
        <h1 id="page-not-found-title" ref={heading} tabIndex={-1} className="page-recovery-title">
          Page not found
        </h1>
        <p className="page-recovery-description">
          This page may have moved. Choose a destination to continue.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            replace
            className="ui-button ui-button-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Back to Dashboard
          </Link>
          <Link
            to="/playground"
            replace
            className="ui-button ui-button-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Open chats
          </Link>
        </div>
      </div>
    </section>
  );
}
