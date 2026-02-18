import { Bot, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AuthError } from '../stores/auth';

interface AppLoadingScreenProps {
  status?: 'initializing' | 'authenticating' | 'loading';
  error?: AuthError | null;
  onRetry?: () => void;
}

/**
 * Full-screen loading screen with StateSet branding.
 * Shows during app initialization, authentication, and other loading states.
 */
export function AppLoadingScreen({
  status = 'initializing',
  error,
  onRetry,
}: AppLoadingScreenProps) {
  const statusMessages = {
    initializing: 'Starting up...',
    authenticating: 'Verifying credentials...',
    loading: 'Loading...',
  };

  const getErrorIcon = () => {
    if (!error) return null;
    switch (error.code) {
      case 'NETWORK_ERROR':
        return WifiOff;
      default:
        return AlertCircle;
    }
  };

  const ErrorIcon = getErrorIcon();

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950">
      {/* Drag region for window controls */}
      <div className="absolute top-0 left-0 right-0 h-10 drag-region" />

      {/* Logo and branding */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center"
      >
        {/* Animated logo */}
        <motion.div
          animate={error ? {} : { scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mb-6 shadow-lg shadow-brand-500/20"
        >
          <Bot className="w-9 h-9 text-white" />
        </motion.div>

        {/* App name */}
        <h1 className="text-2xl font-bold text-white mb-2">StateSet</h1>
        <p className="text-gray-500 text-sm mb-8">AI Agent Desktop</p>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center max-w-xs text-center"
            >
              {/* Error icon */}
              <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mb-4">
                {ErrorIcon && <ErrorIcon className="w-6 h-6 text-red-400" />}
              </div>

              {/* Error message */}
              <p className="text-red-400 font-medium mb-1">{error.message}</p>
              {error.details && <p className="text-gray-500 text-sm mb-4">{error.details}</p>}

              {/* Retry button */}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              {/* Loading spinner */}
              <div className="relative mb-4">
                <div className="w-8 h-8 rounded-full border-2 border-gray-800" />
                <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              </div>

              {/* Status message */}
              <motion.p
                key={status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-gray-400 text-sm"
              >
                {statusMessages[status]}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Version info at bottom */}
      <div className="absolute bottom-4 text-xs text-gray-700">Powered by StateSet</div>
    </div>
  );
}
