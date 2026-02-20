import { useState } from 'react';
import { Key, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../../stores/auth';

export function AccountSettings({ secureStorageAvailable }: { secureStorageAvailable: boolean }) {
  const { tenant, apiKey } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const maskApiKey = (key: string) => {
    if (key.length <= 12) return key;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  };

  const copyApiKey = () => {
    if (apiKey) {
      if (!navigator.clipboard?.writeText) return;
      void navigator.clipboard
        .writeText(apiKey)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
    }
  };

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold flex items-center gap-2">
          <Key className="w-5 h-5 text-gray-400" aria-hidden="true" />
          Account
        </h2>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Organization</label>
          <p className="text-lg">{tenant?.name || 'Unknown'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Plan</label>
          <span
            className={clsx(
              'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
              tenant?.tier === 'enterprise' && 'bg-purple-900/50 text-purple-400',
              tenant?.tier === 'pro' && 'bg-blue-900/50 text-blue-400',
              tenant?.tier === 'free' && 'bg-gray-800 text-gray-400'
            )}
          >
            {tenant?.tier?.charAt(0).toUpperCase() + (tenant?.tier?.slice(1) || '')}
          </span>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">API Key</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-gray-800 rounded-lg font-mono text-sm">
              {apiKey ? maskApiKey(apiKey) : 'Not set'}
            </code>
            <button
              type="button"
              onClick={copyApiKey}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              title="Copy API Key"
              aria-label="Copy API key"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-400" aria-hidden="true" />
              ) : (
                <Copy className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
          {!secureStorageAvailable && (
            <p className="text-xs text-amber-300 mt-2">
              Secure storage is unavailable. Your API key is kept in memory for this session only.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
