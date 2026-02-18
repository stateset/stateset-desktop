import { useEffect } from 'react';

const BASE_TITLE = 'StateSet';

/**
 * Updates document.title when the page mounts and restores
 * the base title on unmount.
 */
export function usePageTitle(page: string) {
  useEffect(() => {
    document.title = `${page} — ${BASE_TITLE}`;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [page]);
}
