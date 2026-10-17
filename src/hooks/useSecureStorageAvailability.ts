import { useEffect, useState } from 'react';

/** Unknown capability must not be presented as persistent credential storage. */
export function useSecureStorageAvailability() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const check = window.electronAPI?.auth?.isSecureStorageAvailable;
    if (check) {
      void check()
        .then((value) => {
          if (active && typeof value === 'boolean') setAvailable(value);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);
  return available;
}
