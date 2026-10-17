import { useState, useEffect, useRef } from 'react';
import { useTemplatesStore } from '../../../stores/templates';
import { TEMPLATE_CATEGORIES } from '../../../lib/agentTemplates';
import { TemplateCard } from './TemplateCard';
import type { AgentTemplate } from '../../../types';

interface TemplatePickerProps {
  selectedId: string;
  onSelect: (template: AgentTemplate) => void;
}

export function TemplatePicker({ selectedId, onSelect }: TemplatePickerProps) {
  const { getAllTemplates, removeCustomTemplate, initialize, isLoaded } = useTemplatesStore();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const gridRef = useRef<HTMLDivElement>(null);
  const allFilterRef = useRef<HTMLButtonElement>(null);

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

  const handleDelete = (id: string, index: number) => {
    // Move focus before removing its element, keeping keyboard users in the picker.
    const choices = gridRef.current?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    const next = choices?.[index + 1] ?? choices?.[index - 1] ?? allFilterRef.current;
    next?.focus();
    if (categoryFilter === 'custom' && customCount === 1) setCategoryFilter('all');
    void removeCustomTemplate(id);
  };

  return (
    <div>
      {/* Category tabs */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {TEMPLATE_CATEGORIES.map((cat) => {
          const hide = cat.id === 'custom' && customCount === 0;
          if (hide) return null;
          return (
            <button
              type="button"
              key={cat.id}
              ref={cat.id === 'all' ? allFilterRef : undefined}
              onClick={() => setCategoryFilter(cat.id)}
              className="ui-segment px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap"
              aria-pressed={categoryFilter === cat.id}
            >
              {cat.label}
              {cat.id === 'custom' && customCount > 0 && ` (${customCount})`}
            </button>
          );
        })}
      </div>

      {/* Template grid */}
      <div
        ref={gridRef}
        role="group"
        aria-label="Agent templates"
        className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1"
      >
        {filtered.map((template, index) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedId === template.id}
            onSelect={() => onSelect(template)}
            onDelete={template.isCustom ? () => handleDelete(template.id, index) : undefined}
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
