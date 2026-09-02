/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import type { AgentSessionConfig, AgentTemplate } from '../../../types';

const mockAddCustomTemplate = vi.fn();

vi.mock('../../../stores/templates', () => ({
  useTemplatesStore: () => ({
    addCustomTemplate: mockAddCustomTemplate,
  }),
}));

const CONFIG: AgentSessionConfig = {
  loop_interval_ms: 2000,
  max_iterations: 50,
  iteration_timeout_secs: 300,
  pause_on_error: true,
  mcp_servers: ['gorgias', 'shopify'],
  model: 'claude-sonnet-4-6',
  temperature: 0.5,
};

describe('SaveAsTemplateDialog', () => {
  const defaults = {
    isOpen: true,
    onClose: vi.fn(),
    agentType: 'interactive',
    config: CONFIG,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddCustomTemplate.mockResolvedValue(undefined);
  });

  it('renders nothing when closed', () => {
    render(<SaveAsTemplateDialog {...defaults} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the form and config snapshot when open', () => {
    render(<SaveAsTemplateDialog {...defaults} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Save as Template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Custom Agent')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What does this template do?')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
    expect(screen.getByText('gorgias, shopify')).toBeInTheDocument();
  });

  it('shows "None" when there are no MCP servers', () => {
    render(<SaveAsTemplateDialog {...defaults} config={{ ...CONFIG, mcp_servers: null }} />);

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('disables the save button until a name is entered', () => {
    render(<SaveAsTemplateDialog {...defaults} />);

    const saveButton = screen.getByRole('button', { name: 'Save template' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('My Custom Agent'), {
      target: { value: 'My Template' },
    });
    expect(saveButton).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('My Custom Agent'), {
      target: { value: '   ' },
    });
    expect(saveButton).toBeDisabled();
  });

  it('saves a custom template with the entered name and description', async () => {
    const onClose = vi.fn();
    render(<SaveAsTemplateDialog {...defaults} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('My Custom Agent'), {
      target: { value: '  My Template  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('What does this template do?'), {
      target: { value: '  Does things  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => {
      expect(mockAddCustomTemplate).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });

    const template = mockAddCustomTemplate.mock.calls[0][0] as AgentTemplate;
    expect(template.name).toBe('My Template');
    expect(template.description).toBe('Does things');
    expect(template.category).toBe('custom');
    expect(template.agentType).toBe('interactive');
    expect(template.isCustom).toBe(true);
    expect(template.id).toMatch(/^custom-/);
    expect(template.config).toEqual(CONFIG);
  });

  it('falls back to a generated description when none is provided', async () => {
    render(<SaveAsTemplateDialog {...defaults} />);

    fireEvent.change(screen.getByPlaceholderText('My Custom Agent'), {
      target: { value: 'My Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => {
      expect(mockAddCustomTemplate).toHaveBeenCalledOnce();
    });
    const template = mockAddCustomTemplate.mock.calls[0][0] as AgentTemplate;
    expect(template.description).toBe('Custom interactive template');
  });

  it('calls onClose when Cancel is clicked without saving', () => {
    const onClose = vi.fn();
    render(<SaveAsTemplateDialog {...defaults} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(mockAddCustomTemplate).not.toHaveBeenCalled();
  });

  it('disables both buttons while saving', async () => {
    let resolveSave!: () => void;
    mockAddCustomTemplate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    render(<SaveAsTemplateDialog {...defaults} />);

    fireEvent.change(screen.getByPlaceholderText('My Custom Agent'), {
      target: { value: 'My Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    resolveSave();
    await waitFor(() => {
      expect(defaults.onClose).toHaveBeenCalled();
    });
  });
});
