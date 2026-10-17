import { useId, useState, type ReactNode } from 'react';
import { Loader2, Check, Plug, Trash2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { Platform } from '../platforms';
import type { McpVerification } from '../mcpVerifications';
import { formatVerifiedAgo, isVerificationStale } from '../mcpVerifications';

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
  /** Extra controls rendered inside the manual credential form (e.g. a server test). */
  formExtra?: ReactNode;
  /** Result of the last successful MCP handshake with this server, if any. */
  verification?: McpVerification;
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
  formExtra,
  verification,
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
  const formId = useId();
  const [showTools, setShowTools] = useState(false);
  const verifiedTools = verification?.tools ?? [];
  const isStale = verification ? isVerificationStale(verification.verifiedAt) : false;
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
                  <span className="flex items-center gap-1 px-2 py-0.5 ui-badge-positive text-xs rounded-full">
                    <Check className="w-3 h-3" aria-hidden="true" />
                    Connected
                  </span>
                )}
                {!isBuiltIn && (
                  <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-xs rounded-full">
                    Custom
                  </span>
                )}
                {isLocal && (
                  <span className="px-2 py-0.5 ui-badge-warning text-xs rounded-full">Local</span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">{platform.description}</p>
              {verification && (
                <div className="mt-1">
                  <p className={clsx('text-xs', isStale ? 'ui-warning' : 'text-gray-500')}>
                    {verification.toolCount} {verification.toolCount === 1 ? 'tool' : 'tools'} ·
                    verified {formatVerifiedAgo(verification.verifiedAt)}
                    {isStale && ' · test again'}
                    {verifiedTools.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowTools((prev) => !prev)}
                        aria-expanded={showTools}
                        aria-label={`${showTools ? 'Hide' : 'Show'} tools for ${platform.name}`}
                        className="ml-2 text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded"
                      >
                        {showTools ? 'hide tools' : 'show tools'}
                      </button>
                    )}
                  </p>
                  {showTools && verifiedTools.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {verifiedTools.map((tool) => (
                        <li
                          key={tool}
                          className="px-1.5 py-0.5 bg-slate-800/70 border border-slate-700/60 rounded text-[10px] font-mono text-gray-300"
                        >
                          {tool}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Manual connection form */}
        {isManual && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="space-y-3">
              {platform.requiredFields.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`${formId}-${field.key}`}
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    {field.label}
                  </label>
                  <input
                    id={`${formId}-${field.key}`}
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(e) => onCredentialChange(field.key, e.target.value)}
                    className="input-base bg-gray-800/90"
                  />
                </div>
              ))}
            </div>
            {formExtra && <div className="mt-3">{formExtra}</div>}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={onSaveCredentials}
                disabled={isStoring}
                type="button"
                className="ui-button ui-button-primary flex-1 py-2 rounded-lg font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                aria-label="Save credentials"
              >
                {isStoring ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" aria-hidden="true" />
                ) : (
                  'Save'
                )}
              </button>
              <button
                onClick={onCancel}
                type="button"
                className="ui-button ui-button-secondary px-4 py-2 rounded-lg transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
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
                <label
                  htmlFor={`${formId}-${field.key}`}
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  {field.label}
                </label>
                <input
                  id={`${formId}-${field.key}`}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={oauthInputs[field.key] || ''}
                  onChange={(e) => onOauthInputChange(field.key, e.target.value)}
                  className="input-base bg-gray-800/90"
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={onOAuthConnect}
                disabled={isStoring}
                type="button"
                className="ui-button ui-button-primary flex-1 py-2 rounded-lg font-medium transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                aria-label={`Authenticate with ${platform.name}`}
              >
                {isStoring ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" aria-hidden="true" />
                ) : (
                  platform.oauth.label
                )}
              </button>
              <button
                onClick={onCancel}
                type="button"
                className="ui-button ui-button-secondary px-4 py-2 rounded-lg transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
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
                  title="Test connection"
                  type="button"
                  className="ui-button ui-button-secondary flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                  aria-label="Test connection"
                >
                  {isTesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  )}
                  Test
                </button>
                <button
                  onClick={onDisconnect}
                  title={`Disconnect ${platform.name}`}
                  aria-label={`Disconnect ${platform.name}`}
                  type="button"
                  className="p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-1 border border-red-900/30 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                  disabled={isStoring || isTesting}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={platform.oauth ? onStartOAuth : onStartManual}
                  type="button"
                  className="ui-button ui-button-primary flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                  disabled={isStoring}
                >
                  <Plug className="w-4 h-4" aria-hidden="true" />
                  {platform.oauth ? platform.oauth.label : 'Connect'}
                </button>
                {platform.oauth && (
                  <button
                    onClick={onStartManual}
                    type="button"
                    className="ui-button ui-button-secondary px-3 py-2 rounded-lg text-sm transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
                    disabled={isStoring}
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
