export function readStoredValue(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort local persistence only.
  }
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = readStoredValue(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}
