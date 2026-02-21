import { Info, ExternalLink } from 'lucide-react';

export function AboutSettings({ appVersion, platform }: { appVersion: string; platform: string }) {
  return (
    <section className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
        <h2 className="font-bold text-gray-200 flex items-center gap-2.5">
          <Info className="w-5 h-5 text-gray-400" />
          About
        </h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-medium">Version</span>
          <span className="font-mono text-sm">{appVersion || '1.0.1'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-medium">Platform</span>
          <span className="capitalize font-mono text-sm">{platform || 'Unknown'}</span>
        </div>
        <div className="pt-5 border-t border-slate-700/50 space-y-3">
          <a
            href="https://docs.stateset.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 bg-slate-800/40 hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-md border border-slate-700/50 hover:border-slate-600/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-xl transition-all duration-200 shadow-sm group"
          >
            <span className="font-medium text-gray-200 group-hover:text-white">Documentation</span>
            <ExternalLink
              className="w-4 h-4 text-gray-400 group-hover:text-brand-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200"
              aria-hidden="true"
            />
          </a>
          <a
            href="https://github.com/stateset/stateset-desktop/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 bg-slate-800/40 hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-md border border-slate-700/50 hover:border-slate-600/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-xl transition-all duration-200 shadow-sm group"
          >
            <span className="font-medium text-gray-200 group-hover:text-white">
              Report an Issue
            </span>
            <ExternalLink
              className="w-4 h-4 text-gray-400 group-hover:text-brand-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200"
              aria-hidden="true"
            />
          </a>
          <a
            href="https://stateset.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 bg-slate-800/40 hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-md border border-slate-700/50 hover:border-slate-600/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-xl transition-all duration-200 shadow-sm group"
          >
            <span className="font-medium text-gray-200 group-hover:text-white">
              StateSet Website
            </span>
            <ExternalLink
              className="w-4 h-4 text-gray-400 group-hover:text-brand-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200"
              aria-hidden="true"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
