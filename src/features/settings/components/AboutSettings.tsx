import { Info, ExternalLink } from 'lucide-react';

export function AboutSettings({ appVersion, platform }: { appVersion: string; platform: string }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold flex items-center gap-2">
          <Info className="w-5 h-5 text-gray-400" />
          About
        </h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Version</span>
          <span>{appVersion || '1.0.0'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Platform</span>
          <span className="capitalize">{platform || 'Unknown'}</span>
        </div>
        <div className="pt-4 border-t border-gray-800 space-y-2">
          <a
            href="https://docs.stateset.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <span>Documentation</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a
            href="https://github.com/stateset/stateset-desktop/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <span>Report an Issue</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a
            href="https://stateset.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <span>StateSet Website</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        </div>
      </div>
    </section>
  );
}
