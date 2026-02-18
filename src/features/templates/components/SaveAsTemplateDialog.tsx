import { useState } from 'react';
import { Save } from 'lucide-react';
import { useTemplatesStore } from '../../../stores/templates';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import type { AgentSessionConfig, AgentTemplate } from '../../../types';

interface SaveAsTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentType: string;
  config: AgentSessionConfig;
}

export function SaveAsTemplateDialog({
  isOpen,
  onClose,
  agentType,
  config,
}: SaveAsTemplateDialogProps) {
  const { addCustomTemplate } = useTemplatesStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const template: AgentTemplate = {
        id: `custom-${Date.now()}`,
        name: name.trim(),
        description: description.trim() || `Custom ${agentType} template`,
        icon: 'Bot',
        color: 'bg-gray-600',
        category: 'custom',
        agentType,
        config,
        isCustom: true,
        createdAt: new Date().toISOString(),
      };
      await addCustomTemplate(template);
      onClose();
      setName('');
      setDescription('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Save as Template" preventClose={isSaving}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Template Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Custom Agent"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Description <span className="text-gray-500">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this template do?"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400 space-y-1">
          <p>Config snapshot:</p>
          <p>Model: {config.model}</p>
          <p>Temperature: {config.temperature}</p>
          <p>MCP: {config.mcp_servers?.join(', ') || 'None'}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-800">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button icon={Save} onClick={handleSave} disabled={!name.trim()} loading={isSaving}>
          Save Template
        </Button>
      </div>
    </Modal>
  );
}
