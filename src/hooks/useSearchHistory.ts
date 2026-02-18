import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'stateset:search-history';
const MAX_HISTORY_ITEMS = 10;

interface SavedFilter {
  id: string;
  name: string;
  query: string;
  status: string;
  createdAt: number;
}

interface SearchHistoryState {
  recentSearches: string[];
  savedFilters: SavedFilter[];
}

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const parseHistoryState = (raw: string | null): SearchHistoryState => {
  if (!raw) {
    return { recentSearches: [], savedFilters: [] };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const safeParsed = parsed as Partial<SearchHistoryState>;
    return {
      recentSearches: Array.isArray(safeParsed?.recentSearches)
        ? safeParsed.recentSearches.filter((value): value is string => typeof value === 'string')
        : [],
      savedFilters: Array.isArray(safeParsed?.savedFilters)
        ? safeParsed.savedFilters.filter(
            (filter): filter is SavedFilter =>
              !!filter &&
              typeof filter === 'object' &&
              typeof filter.id === 'string' &&
              typeof filter.name === 'string' &&
              typeof filter.query === 'string' &&
              typeof filter.status === 'string' &&
              typeof filter.createdAt === 'number'
          )
        : [],
    };
  } catch {
    return { recentSearches: [], savedFilters: [] };
  }
};

function loadFromStorage(): SearchHistoryState {
  if (typeof window === 'undefined') {
    return { recentSearches: [], savedFilters: [] };
  }

  try {
    const sessionStorage = getSessionStorage();
    if (sessionStorage) {
      const sessionStored = sessionStorage.getItem(STORAGE_KEY);
      if (sessionStored) {
        return parseHistoryState(sessionStored);
      }
    }

    const localStorage = getLocalStorage();
    const localStored = localStorage?.getItem(STORAGE_KEY);
    if (!localStored) {
      return { recentSearches: [], savedFilters: [] };
    }

    const parsed = parseHistoryState(localStored);
    if (sessionStorage) {
      try {
        sessionStorage.setItem(STORAGE_KEY, localStored);
        localStorage?.removeItem(STORAGE_KEY);
      } catch {
        // Ignore migration failures and keep local storage as source-of-truth.
      }
    }
    return parsed;
  } catch {
    // Ignore parse errors
  }
  return { recentSearches: [], savedFilters: [] };
}

function saveToStorage(state: SearchHistoryState): void {
  if (typeof window === 'undefined') return;
  try {
    const sessionStorage = getSessionStorage();
    if (sessionStorage) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return;
    }

    const localStorage = getLocalStorage();
    localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function useSearchHistory() {
  const [state, setState] = useState<SearchHistoryState>(loadFromStorage);

  // Persist to storage on changes
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const addToHistory = useCallback((query: string) => {
    if (!query.trim()) return;

    setState((prev) => {
      // Remove duplicate if exists
      const filtered = prev.recentSearches.filter((q) => q !== query);
      // Add to front and limit size
      const recentSearches = [query, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      return { ...prev, recentSearches };
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setState((prev) => ({
      ...prev,
      recentSearches: prev.recentSearches.filter((q) => q !== query),
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, recentSearches: [] }));
  }, []);

  const saveFilter = useCallback((name: string, query: string, status: string) => {
    const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const filter: SavedFilter = {
      id,
      name,
      query,
      status,
      createdAt: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      savedFilters: [...prev.savedFilters, filter],
    }));

    return id;
  }, []);

  const removeFilter = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      savedFilters: prev.savedFilters.filter((f) => f.id !== id),
    }));
  }, []);

  const updateFilter = useCallback(
    (id: string, updates: Partial<Omit<SavedFilter, 'id' | 'createdAt'>>) => {
      setState((prev) => ({
        ...prev,
        savedFilters: prev.savedFilters.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      }));
    },
    []
  );

  return {
    recentSearches: state.recentSearches,
    savedFilters: state.savedFilters,
    addToHistory,
    removeFromHistory,
    clearHistory,
    saveFilter,
    removeFilter,
    updateFilter,
  };
}

/**
 * Simple hook for tracking the last N searches without persistence
 */
export function useRecentSearches(maxItems: number = 5) {
  const [searches, setSearches] = useState<string[]>([]);

  const addSearch = useCallback(
    (query: string) => {
      if (!query.trim()) return;
      setSearches((prev) => {
        const filtered = prev.filter((q) => q !== query);
        return [query, ...filtered].slice(0, maxItems);
      });
    },
    [maxItems]
  );

  const clearSearches = useCallback(() => {
    setSearches([]);
  }, []);

  return { searches, addSearch, clearSearches };
}
