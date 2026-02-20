import {
  MessageSquare,
  HelpCircle,
  ShoppingCart,
  Zap,
  Tag,
  PackageSearch,
  RotateCcw,
  BarChart3,
  Bot,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import type { AgentTemplate } from '../../../types';

const ICON_MAP: Record<string, React.ElementType> = {
  MessageSquare,
  HelpCircle,
  ShoppingCart,
  Zap,
  Tag,
  PackageSearch,
  RotateCcw,
  BarChart3,
  Bot,
};

interface TemplateCardProps {
  template: AgentTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

export function TemplateCard({ template, isSelected, onSelect, onDelete }: TemplateCardProps) {
  const Icon = ICON_MAP[template.icon] || Bot;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
        isSelected
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-gray-800 hover:border-gray-700 bg-gray-800/50'
      )}
    >
      <div
        className={clsx(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          template.color
        )}
      >
        <Icon className="w-5 h-5 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{template.name}</p>
          {template.isCustom && (
            <span className="px-1.5 py-0.5 text-[10px] bg-brand-600/30 text-brand-300 rounded">
              Custom
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-0.5">{template.description}</p>
        {template.config.mcp_servers && template.config.mcp_servers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {template.config.mcp_servers.map((server) => (
              <span key={server} className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                {server}
              </span>
            ))}
          </div>
        )}
      </div>
      {template.isCustom && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          type="button"
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-1"
          aria-label={`Delete template ${template.name}`}
          title="Delete template"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </button>
  );
}
