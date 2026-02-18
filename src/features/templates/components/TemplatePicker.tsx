import { useState, useEffect } from 'react';
import { useTemplatesStore } from '../../../stores/templates';
import { TEMPLATE_CATEGORIES } from '../../../lib/agentTemplates';
import { TemplateCard } from './TemplateCard';
import clsx from 'clsx';
import type { AgentTemplate } from '../../../types';

interface TemplatePickerProps {
  selectedId: string;
  onSelect: (template: AgentTemplate) => void;
}

export function TemplatePicker({ selectedId, onSelect }: TemplatePickerProps) {
  const { getAllTemplates, removeCustomTemplate, initialize, isLoaded } = useTemplatesStore();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isLoaded) return null;

  const allTemplates = getAllTemplates();

  const filtered =
    categoryFilter === 'all'
      ? allTemplates
      : categoryFilter === 'custom'
        ? allTemplates.filter((t) => t.isCustom)
        : allTemplates.filter((t) => t.category === categoryFilter);

  const customCount = allTemplates.filter((t) => t.isCustom).length;

  return (
    <div>
      {/* Category tabs */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {TEMPLATE_CATEGORIES.map((cat) => {
          const hide = cat.id === 'custom' && customCount === 0;
          if (hide) return null;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={clsx(
                'px-3 py-1 text-xs rounded-lg transition-colors whitespace-nowrap',
                categoryFilter === cat.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {cat.label}
              {cat.id === 'custom' && customCount > 0 && ` (${customCount})`}
            </button>
          );
        })}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
        {filtered.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedId === template.id}
            onSelect={() => onSelect(template)}
            onDelete={template.isCustom ? () => removeCustomTemplate(template.id) : undefined}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 py-8 text-center text-gray-500 text-sm">
            No templates in this category
          </div>
        )}
      </div>
    </div>
  );
}
