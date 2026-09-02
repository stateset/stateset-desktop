/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import { TemplateDetailPanel } from './TemplateDetailPanel';
import type { AgentTemplate } from '../../../types';

const mockAddCustomTemplate = vi.fn().mockResolvedValue(undefined);
const mockRemoveCustomTemplate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../stores/templates', () => ({
  useTemplatesStore: () => ({
    addCustomTemplate: mockAddCustomTemplate,
    removeCustomTemplate: mockRemoveCustomTemplate,
  }),
}));

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'tpl-1',
    name: 'Support Agent',
    description: 'Handles support tickets',
    icon: 'HelpCircle',
    color: 'bg-purple-600',
    category: 'support',
    agentType: 'interactive',
    config: {
      model: 'claude-sonnet-4-6',
      temperature: 0.5,
      max_iterations: 50,
      loop_interval_ms: 2000,
      iteration_timeout_secs: 120,
      pause_on_error: true,
      mcp_servers: ['gorgias', 'shopify'],
    },
    ...overrides,
  };
}

describe('TemplateDetailPanel', () => {
  const defaults = {
    onClose: vi.fn(),
    onUseTemplate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the template name, description, and category chips', () => {
    render(<TemplateDetailPanel template={makeTemplate()} {...defaults} />);

    expect(screen.getByText('Support Agent')).toBeInTheDocument();
    expect(screen.getByText('Handles support tickets')).toBeInTheDocument();
    expect(screen.getByText('support')).toBeInTheDocument();
    expect(screen.getByText('interactive')).toBeInTheDocument();
  });

  it('renders the configuration values', () => {
    render(<TemplateDetailPanel template={makeTemplate()} {...defaults} />);

    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('2000ms')).toBeInTheDocument();
    expect(screen.getByText('120s')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('falls back to default configuration values when missing', () => {
    render(<TemplateDetailPanel template={makeTemplate({ config: {} })} {...defaults} />);

    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('0.7')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('1000ms')).toBeInTheDocument();
    expect(screen.getByText('300s')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders MCP servers when present and hides the section when absent', () => {
    const { rerender } = render(<TemplateDetailPanel template={makeTemplate()} {...defaults} />);

    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getByText('gorgias')).toBeInTheDocument();
    expect(screen.getByText('shopify')).toBeInTheDocument();

    rerender(
      <TemplateDetailPanel template={makeTemplate({ config: { mcp_servers: [] } })} {...defaults} />
    );
    expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();
  });

  it('renders custom instructions only when provided', () => {
    const { rerender } = render(<TemplateDetailPanel template={makeTemplate()} {...defaults} />);

    expect(screen.queryByText('Custom Instructions')).not.toBeInTheDocument();

    rerender(
      <TemplateDetailPanel
        template={makeTemplate({
          config: { mcp_servers: [], custom_instructions: 'Always be polite' },
        })}
        {...defaults}
      />
    );
    expect(screen.getByText('Custom Instructions')).toBeInTheDocument();
    expect(screen.getByText('Always be polite')).toBeInTheDocument();
  });

  it('shows the Custom badge for custom templates', () => {
    render(<TemplateDetailPanel template={makeTemplate({ isCustom: true })} {...defaults} />);

    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TemplateDetailPanel
        template={makeTemplate()}
        onClose={onClose}
        onUseTemplate={defaults.onUseTemplate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close template details' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onUseTemplate with the template', () => {
    const onUseTemplate = vi.fn();
    const template = makeTemplate();
    render(
      <TemplateDetailPanel
        template={template}
        onClose={defaults.onClose}
        onUseTemplate={onUseTemplate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use template Support Agent' }));

    expect(onUseTemplate).toHaveBeenCalledWith(template);
  });

  it('duplicates built-in templates as custom copies', async () => {
    render(<TemplateDetailPanel template={makeTemplate()} {...defaults} />);

    expect(screen.queryByRole('button', { name: /Delete template/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate template Support Agent' }));

    await waitFor(() => {
      expect(mockAddCustomTemplate).toHaveBeenCalledOnce();
    });
    const duplicate = mockAddCustomTemplate.mock.calls[0][0] as AgentTemplate;
    expect(duplicate.name).toBe('Support Agent (Copy)');
    expect(duplicate.isCustom).toBe(true);
    expect(duplicate.id).toMatch(/^custom-/);
    expect(duplicate.createdAt).toBeTruthy();
  });

  it('deletes custom templates and closes the panel', async () => {
    const onClose = vi.fn();
    render(
      <TemplateDetailPanel
        template={makeTemplate({ isCustom: true })}
        onClose={onClose}
        onUseTemplate={defaults.onUseTemplate}
      />
    );

    expect(screen.queryByRole('button', { name: /Duplicate template/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete template Support Agent' }));

    await waitFor(() => {
      expect(mockRemoveCustomTemplate).toHaveBeenCalledWith('tpl-1');
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
