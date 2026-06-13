/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateAgentDialog } from './CreateAgentDialog';
import { BUILT_IN_TEMPLATES } from '../lib/agentTemplates';

// TemplatePicker depends on the templates store (electron-backed); replace it
// with a simple list of buttons that call onSelect with real templates.
vi.mock('../features/templates', async () => {
  const { BUILT_IN_TEMPLATES: templates } = await import('../lib/agentTemplates');
  return {
    TemplatePicker: ({
      selectedId,
      onSelect,
    }: {
      selectedId: string;
      onSelect: (template: (typeof templates)[number]) => void;
    }) => (
      <div data-testid="template-picker">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            aria-pressed={template.id === selectedId}
            onClick={() => onSelect(template)}
          >
            {template.name}
          </button>
        ))}
      </div>
    ),
  };
});

describe('CreateAgentDialog', () => {
  const onClose = vi.fn();
  const onCreateAgent = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose,
    onCreateAgent,
    isCreating: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<CreateAgentDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a modal dialog with an accessible title', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Create New Agent' })).toBeInTheDocument();
  });

  it('calls onClose from the close button', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose from the Cancel button', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('creates an agent with the default template and no name', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    expect(onCreateAgent).toHaveBeenCalledWith(
      BUILT_IN_TEMPLATES[0].agentType,
      expect.objectContaining(BUILT_IN_TEMPLATES[0].config),
      undefined
    );
  });

  it('passes the session name when provided', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Session name'), {
      target: { value: 'My Support Agent' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    expect(onCreateAgent).toHaveBeenCalledWith(
      BUILT_IN_TEMPLATES[0].agentType,
      expect.any(Object),
      'My Support Agent'
    );
  });

  it('uses the selected template config and shows its name in the footer', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customer Support' }));
    expect(screen.getByText('Customer Support', { selector: 'strong' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === 'customer-support')!;
    expect(onCreateAgent).toHaveBeenCalledWith(
      template.agentType,
      expect.objectContaining(template.config),
      undefined
    );
  });

  it('warns when the selected template requires MCP servers', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    expect(screen.queryByText(/uses MCP servers/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customer Support' }));
    expect(screen.getByText(/uses MCP servers/i)).toBeInTheDocument();
    expect(screen.getByText(/gorgias/)).toBeInTheDocument();
  });

  it('toggles advanced settings with aria-expanded', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    const toggle = screen.getByRole('button', { name: /advanced settings/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('merges custom advanced settings into the created config', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }));
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText('Custom Instructions'), {
      target: { value: 'Be terse.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    expect(onCreateAgent).toHaveBeenCalledWith(
      BUILT_IN_TEMPLATES[0].agentType,
      expect.objectContaining({ temperature: 0.2, custom_instructions: 'Be terse.' }),
      undefined
    );
  });

  it('clamps temperature to the allowed range', () => {
    render(<CreateAgentDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }));
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    expect(onCreateAgent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ temperature: 2 }),
      undefined
    );
  });

  it('disables actions and shows progress while creating', () => {
    render(<CreateAgentDialog {...defaultProps} isCreating />);
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
