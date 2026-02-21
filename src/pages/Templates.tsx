import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTemplatesStore } from '../stores/templates';
import { TEMPLATE_CATEGORIES } from '../lib/agentTemplates';
import { TemplateCard } from '../features/templates/components/TemplateCard';
import { TemplateDetailPanel } from '../features/templates/components/TemplateDetailPanel';
import { SaveAsTemplateDialog } from '../features/templates/components/SaveAsTemplateDialog';
import type { AgentTemplate } from '../types';
import clsx from 'clsx';

export default function Templates() {
  usePageTitle('Templates');
  const navigate = useNavigate();
  const { initialize, getAllTemplates, removeCustomTemplate } = useTemplatesStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const allTemplates = getAllTemplates();

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      if (selectedCategory === 'custom') {
        if (!t.isCustom) return false;
      } else if (selectedCategory !== 'all') {
        if (t.category !== selectedCategory) return false;
      }
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allTemplates, selectedCategory, debouncedSearch]);

  const handleUseTemplate = () => {
    navigate('/?create=1');
  };

  return (
    <div className="page-shell max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Browse and manage agent templates for quick deployment</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium border border-brand-600/40 transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          aria-label="Create template"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create Template
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates..."
          aria-label="Search templates"
          className="w-full pl-10 pr-4 py-2 bg-gray-900/90 border border-gray-800 rounded-lg hover:border-gray-600 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow text-sm"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TEMPLATE_CATEGORIES.map((category) => (
          <button
            type="button"
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
              selectedCategory === category.id
                ? 'bg-brand-600/20 text-brand-400 shadow-sm border border-brand-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
            )}
            aria-pressed={selectedCategory === category.id}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      {filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedTemplate?.id === template.id}
              onSelect={() => setSelectedTemplate(template)}
              onDelete={template.isCustom ? () => removeCustomTemplate(template.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <p className="text-sm">
            {searchQuery ? `No templates match "${searchQuery}"` : 'No templates in this category'}
          </p>
        </div>
      )}

      {/* Detail Panel */}
      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUseTemplate={handleUseTemplate}
        />
      )}

      {/* Create Custom Template Dialog */}
      {showCreateDialog && (
        <SaveAsTemplateDialog
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          agentType="interactive"
          config={{
            mcp_servers: [],
            model: 'claude-sonnet-4-6',
            temperature: 0.7,
            loop_interval_ms: 1000,
            max_iterations: 100,
            iteration_timeout_secs: 300,
            pause_on_error: false,
          }}
        />
      )}
    </div>
  );
}
