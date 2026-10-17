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
  RefreshCw,
  BookOpen,
  Workflow,
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
  RefreshCw,
  BookOpen,
  Workflow,
};

interface TemplateCardProps {
  template: AgentTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

export function TemplateCard({ template, isSelected, onSelect, onDelete }: TemplateCardProps) {
  const Icon = ICON_MAP[template.icon] || Bot;

  const canDelete = template.isCustom && Boolean(onDelete);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className={clsx(
          'template-choice flex h-full w-full items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors',
          canDelete && 'pr-12',
          isSelected ? 'border-brand-500' : 'border-gray-800 hover:border-gray-700'
        )}
      >
        <span
          className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            template.color
          )}
        >
          <Icon className="w-5 h-5 text-white" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{template.name}</span>
            {template.isCustom && (
              <span className="template-custom-badge px-1.5 py-0.5 text-[10px] rounded">
                Custom
              </span>
            )}
          </span>
          <span className="block text-sm text-gray-400 mt-0.5">{template.description}</span>
          {template.config.mcp_servers && template.config.mcp_servers.length > 0 && (
            <span className="flex flex-wrap gap-1 mt-2">
              {template.config.mcp_servers.map((server) => (
                <span
                  key={server}
                  className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded"
                >
                  {server}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      {canDelete && (
        <button
          onClick={onDelete}
          type="button"
          className="template-delete absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-900/50 hover:text-red-400 transition-colors"
          aria-label={`Delete template ${template.name}`}
          title="Delete template"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
