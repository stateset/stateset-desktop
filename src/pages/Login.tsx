import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore, type AuthError } from '../stores/auth';
import {
  Bot,
  Key,
  ArrowRight,
  AlertCircle,
  Mail,
  Lock,
  RefreshCw,
  WifiOff,
  ShieldAlert,
} from 'lucide-react';
import { loginWithEmail } from '../lib/registration';
import clsx from 'clsx';
import { usePageTitle } from '../hooks/usePageTitle';

type LoginMethod = 'email' | 'apikey';

/**
 * Get icon and styling for different error types
 */
function getErrorDisplay(error: AuthError | null) {
  if (!error) return null;

  switch (error.code) {
    case 'NETWORK_ERROR':
      return {
        icon: WifiOff,
        bgColor: 'bg-amber-900/30',
        borderColor: 'border-amber-800',
        textColor: 'text-amber-400',
        detailsColor: 'text-amber-300/70',
      };
    case 'SESSION_EXPIRED':
      return {
        icon: ShieldAlert,
        bgColor: 'bg-amber-900/30',
        borderColor: 'border-amber-800',
        textColor: 'text-amber-400',
        detailsColor: 'text-amber-300/70',
      };
    case 'SERVER_ERROR':
      return {
        icon: AlertCircle,
        bgColor: 'bg-red-900/30',
        borderColor: 'border-red-800',
        textColor: 'text-red-400',
        detailsColor: 'text-red-300/70',
      };
    default:
      return {
        icon: AlertCircle,
        bgColor: 'bg-red-900/30',
        borderColor: 'border-red-800',
        textColor: 'text-red-400',
        detailsColor: 'text-red-300/70',
      };
  }
}

export default function Login() {
  usePageTitle('Login');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(true);

  const {
    login,
    setSandboxApiKey,
    initialize,
    isAuthenticated,
    error: authError,
    clearError,
  } = useAuthStore();
  const navigate = useNavigate();

  // Combined error from local state and auth store
  const displayError = authError ? authError.message : localError;
  const errorDetails = authError?.details;

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const checkStorage = async () => {
      if (window.electronAPI?.auth?.isSecureStorageAvailable) {
        const available = await window.electronAPI.auth.isSecureStorageAvailable();
        setSecureStorageAvailable(available);
      }
    };
    checkStorage();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    const normalizedEmail = email.trim();
    const passwordValue = password;
    const normalizedApiKey = apiKey.trim();

    if (loginMethod === 'email') {
      if (!normalizedEmail || !passwordValue) {
        setLocalError('Please enter both email and password.');
        return;
      }
    } else if (!normalizedApiKey) {
      setLocalError('Please enter your API key.');
      return;
    }

    setIsLoading(true);

    try {
      if (loginMethod === 'email') {
        // Email/password login - auto-provisions keys
        const result = await loginWithEmail({
          email: normalizedEmail,
          password: passwordValue,
        });

        if (result.credentials) {
          await login(result.credentials.engine_api_key);
          if (result.credentials.sandbox_api_key) {
            await setSandboxApiKey(result.credentials.sandbox_api_key);
          }
        }
      } else {
        // API key login (legacy)
        await login(normalizedApiKey);
      }
      navigate('/');
    } catch (err) {
      // Auth store sets its own error, but we capture additional context
      setLocalError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    clearError();
    setLocalError('');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Drag region for title bar */}
      <div className="h-10 drag-region" />

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">StateSet</h1>
              <p className="text-gray-500 text-sm">AI Agent Desktop</p>
            </div>
          </div>

          {/* Login Form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">Welcome back</h2>
            <p className="text-gray-400 text-sm mb-6">Sign in to connect to StateSet</p>

            {/* Login Method Tabs */}
            <div className="flex gap-1 p-1 bg-gray-800 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('email');
                  setLocalError('');
                  clearError();
                }}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                  loginMethod === 'email'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('apikey');
                  setLocalError('');
                  clearError();
                }}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                  loginMethod === 'apikey'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                <Key className="w-4 h-4" />
                API Key
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {loginMethod === 'email' ? (
                <>
                  {/* Email field */}
                  <div className="mb-4">
                    <label
                      htmlFor="login-email"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        id="login-email"
                        type="email"
                        name="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (localError) {
                            setLocalError('');
                          }
                        }}
                        placeholder="you@company.com"
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="mb-4">
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-medium text-gray-300 mb-2"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        id="login-password"
                        type="password"
                        name="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (localError) {
                            setLocalError('');
                          }
                        }}
                        placeholder="Your password"
                        autoComplete="current-password"
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="mb-4">
                  <label
                    htmlFor="login-api-key"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    API Key
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      id="login-api-key"
                      type="password"
                      name="apiKey"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        if (localError) {
                          setLocalError('');
                        }
                      }}
                      placeholder="sk-..."
                      autoComplete="off"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                      autoFocus
                    />
                  </div>
                  {!secureStorageAvailable && (
                    <p className="text-xs text-amber-300 mt-2">
                      Secure storage is unavailable. Your API key will only be stored for this
                      session.
                    </p>
                  )}
                </div>
              )}

              {displayError && (
                <div
                  className={clsx(
                    'mb-4 p-3 rounded-lg border',
                    authError
                      ? `${getErrorDisplay(authError)?.bgColor} ${getErrorDisplay(authError)?.borderColor}`
                      : 'bg-red-900/30 border-red-800'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {authError ? (
                      (() => {
                        const display = getErrorDisplay(authError);
                        const Icon = display?.icon || AlertCircle;
                        return (
                          <Icon
                            className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', display?.textColor)}
                          />
                        );
                      })()
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={clsx(
                          'text-sm',
                          authError ? getErrorDisplay(authError)?.textColor : 'text-red-400'
                        )}
                      >
                        {displayError}
                      </p>
                      {errorDetails && (
                        <p
                          className={clsx(
                            'text-xs mt-1',
                            authError ? getErrorDisplay(authError)?.detailsColor : 'text-red-300/70'
                          )}
                        >
                          {errorDetails}
                        </p>
                      )}
                    </div>
                    {(authError?.code === 'NETWORK_ERROR' ||
                      authError?.code === 'SERVER_ERROR') && (
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
                        title="Dismiss"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isLoading ||
                  (loginMethod === 'email' ? !email.trim() || !password : !apiKey.trim())
                }
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-400 rounded-lg font-medium transition-colors"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Sign up link */}
          <p className="text-center text-gray-500 text-sm mt-6">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
            >
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
