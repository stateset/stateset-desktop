import { useCallback, useRef } from 'react';
import { useToast } from '../components/ToastProvider';
import { getErrorMessage } from '../lib/errors';

interface ErrorHandlerOptions {
  /** Prevent showing the same error message twice in a row */
  preventDuplicates?: boolean;
  /** Custom action to perform after showing error */
  onError?: (error: unknown, message: string) => void;
}

/**
 * Consolidated error handling hook for mutations and queries
 * Reduces boilerplate and ensures consistent error handling across the app
 */
export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const { showToast } = useToast();
  const { preventDuplicates = true, onError } = options;
  const lastErrorRef = useRef<string | null>(null);

  /**
   * Handle errors from mutations (API write operations)
   * Shows error toast immediately
   */
  const handleMutationError = useCallback(
    (title: string) => (error: unknown) => {
      const message = getErrorMessage(error);
      showToast({
        variant: 'error',
        title,
        message,
      });
      onError?.(error, message);
    },
    [showToast, onError]
  );

  /**
   * Handle errors from queries (API read operations)
   * Prevents duplicate error toasts for the same message
   */
  const handleQueryError = useCallback(
    (title: string) => (error: unknown) => {
      const message = getErrorMessage(error);

      if (preventDuplicates && lastErrorRef.current === message) {
        return;
      }

      lastErrorRef.current = message;
      showToast({
        variant: 'error',
        title,
        message,
      });
      onError?.(error, message);
    },
    [showToast, preventDuplicates, onError]
  );

  /**
   * Handle stream/SSE connection errors
   * Provides user-friendly messaging for connection issues
   */
  const handleStreamError = useCallback(
    (error: unknown) => {
      const message = getErrorMessage(error);

      // Provide helpful context for common stream errors
      let title = 'Connection error';
      let displayMessage = message;

      if (message.includes('timeout')) {
        title = 'Connection timeout';
        displayMessage = 'The connection timed out. Please try reconnecting.';
      } else if (message.includes('network') || message.includes('offline')) {
        title = 'Network error';
        displayMessage = 'Unable to connect. Check your internet connection.';
      } else if (message.includes('unauthorized') || message.includes('401')) {
        title = 'Authentication error';
        displayMessage = 'Your session may have expired. Please log in again.';
      }

      showToast({
        variant: 'error',
        title,
        message: displayMessage,
      });
      onError?.(error, message);
    },
    [showToast, onError]
  );

  /**
   * Clear the last error (useful when error condition is resolved)
   */
  const clearLastError = useCallback(() => {
    lastErrorRef.current = null;
  }, []);

  /**
   * Show a custom error toast
   */
  const showError = useCallback(
    (title: string, message: string) => {
      showToast({
        variant: 'error',
        title,
        message,
      });
    },
    [showToast]
  );

  /**
   * Show a warning toast
   */
  const showWarning = useCallback(
    (title: string, message: string) => {
      showToast({
        variant: 'warning',
        title,
        message,
      });
    },
    [showToast]
  );

  return {
    handleMutationError,
    handleQueryError,
    handleStreamError,
    clearLastError,
    showError,
    showWarning,
  };
}
