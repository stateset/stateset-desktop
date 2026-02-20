import { Loader2, Check, Plug, Trash2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { Platform } from '../platforms';

interface PlatformCardProps {
  platform: Platform;
  connected: boolean;
  isLocal: boolean;
  isBuiltIn: boolean;
  isConnecting: boolean;
  connectMode: 'manual' | 'oauth' | null;
  credentials: Record<string, string>;
  oauthInputs: Record<string, string>;
  isStoring: boolean;
  isTesting: boolean;
  disableTest: boolean;
  isLocalMode: boolean;
  onCredentialChange: (key: string, value: string) => void;
  onOauthInputChange: (key: string, value: string) => void;
  onSaveCredentials: () => void;
  onOAuthConnect: () => void;
  onStartManual: () => void;
  onStartOAuth: () => void;
  onCancel: () => void;
  onTest: () => void;
  onDisconnect: () => void;
}

export function PlatformCard({
  platform,
  connected,
  isLocal,
  isBuiltIn,
  isConnecting,
  connectMode,
  credentials,
  oauthInputs,
  isStoring,
  isTesting,
  disableTest,
  isLocalMode,
  onCredentialChange,
  onOauthInputChange,
  onSaveCredentials,
  onOAuthConnect,
  onStartManual,
  onStartOAuth,
  onCancel,
  onTest,
  onDisconnect,
}: PlatformCardProps) {
  const isManual = isConnecting && connectMode === 'manual';
  const isOAuth = isConnecting && connectMode === 'oauth';

  return (
    <div
      className={clsx(
        'bg-gray-900 border rounded-xl overflow-hidden transition-colors',
        connected ? 'border-green-600/50' : 'border-gray-800'
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                platform.color
              )}
            >
              {platform.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{platform.name}</h3>
                {connected && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded-full">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                )}
                {!isBuiltIn && (
                  <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-xs rounded-full">
                    Custom
                  </span>
                )}
                {isLocal && (
                  <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 text-xs rounded-full">
                    Local
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">{platform.description}</p>
            </div>
          </div>
        </div>

        {/* Manual connection form */}
        {isManual && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="space-y-3">
              {platform.requiredFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(e) => onCredentialChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={onSaveCredentials}
                disabled={isStoring}
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-colors"
              >
                {isStoring ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save'}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* OAuth connection form */}
        {isOAuth && platform.oauth && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
            {platform.oauth.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={oauthInputs[field.key] || ''}
                  onChange={(e) => onOauthInputChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={onOAuthConnect}
                disabled={isStoring}
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-colors"
              >
                {isStoring ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  platform.oauth.label
                )}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isConnecting && (
          <div className="flex items-center gap-2 mt-4">
            {connected ? (
              <>
                <button
                  onClick={onTest}
                  disabled={disableTest}
                  title={
                    isLocalMode
                      ? 'Local credentials cannot be tested without a configured vault.'
                      : 'Test connection'
                  }
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Test
                </button>
                <button
                  onClick={onDisconnect}
                  title={`Disconnect ${platform.name}`}
                  aria-label={`Disconnect ${platform.name}`}
                  className="p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={platform.oauth ? onStartOAuth : onStartManual}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plug className="w-4 h-4" />
                  {platform.oauth ? platform.oauth.label : 'Connect'}
                </button>
                {platform.oauth && (
                  <button
                    onClick={onStartManual}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
                  >
                    Manual
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
