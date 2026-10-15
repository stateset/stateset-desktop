/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigModal } from './ConfigModal';
import type { AgentSessionConfig } from '../../../types';

vi.mock('../../connections/hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => [
    {
      id: 'stateset-response',
      name: 'StateSet ResponseCX',
      isLocalOnly: false,
      isMcpServer: true,
      connected: true,
    },
    { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
    { id: 'gorgias', name: 'Gorgias', isLocalOnly: false, isMcpServer: true, connected: false },
  ],
  useMcpServerOptionsState: () => ({
    options: [
      {
        id: 'stateset-response',
        name: 'StateSet ResponseCX',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
      },
      { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
      { id: 'gorgias', name: 'Gorgias', isLocalOnly: false, isMcpServer: true, connected: false },
    ],
    isLoading: false,
  }),
}));

function makeConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    loop_interval_ms: 2000,
    max_iterations: 10,
    iteration_timeout_secs: 30,
    pause_on_error: false,
    custom_instructions: 'Be helpful',
    mcp_servers: ['shopify', 'gorgias'],
    model: 'claude-sonnet-4-6',
    temperature: 0.5,
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof ConfigModal>[0]> = {}) {
  return {
    configDraft: makeConfig(),
    isPending: false,
    onUpdate: vi.fn(),
    onSave: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function getInputByLabel(label: string): HTMLElement {
  return screen.getByLabelText(new RegExp(label));
}

describe('ConfigModal', () => {
  it('renders the modal with current config values', () => {
    render(<ConfigModal {...makeProps()} />);

    expect(screen.getByText('Agent Settings')).toBeInTheDocument();
    expect(screen.getByText('Changes apply on the next agent loop.')).toBeInTheDocument();
    expect(getInputByLabel('Loop Interval')).toHaveValue(2000);
    expect(getInputByLabel('Max Iterations')).toHaveValue(10);
    expect(getInputByLabel('Iteration Timeout')).toHaveValue(30);
    expect(getInputByLabel('Temperature')).toHaveValue(0.5);
    expect(getInputByLabel('Model')).toHaveValue('claude-sonnet-4-6');
    expect(screen.getByRole('button', { name: /Shopify/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Gorgias/ })).toHaveAttribute('aria-pressed', 'true');
    expect(getInputByLabel('Custom Instructions')).toHaveValue('Be helpful');
  });

  it('updates the loop interval, clamping to a minimum of 100ms', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.change(getInputByLabel('Loop Interval'), { target: { value: '500' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ loop_interval_ms: 500 });

    fireEvent.change(getInputByLabel('Loop Interval'), { target: { value: '5' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ loop_interval_ms: 100 });
  });

  it('clamps max iterations to at least 1', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.change(getInputByLabel('Max Iterations'), { target: { value: '0' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ max_iterations: 1 });

    fireEvent.change(getInputByLabel('Max Iterations'), { target: { value: '25' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ max_iterations: 25 });
  });

  it('clamps the temperature between 0 and 2', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.change(getInputByLabel('Temperature'), { target: { value: '5' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ temperature: 2 });

    fireEvent.change(getInputByLabel('Temperature'), { target: { value: '-1' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ temperature: 0 });

    fireEvent.change(getInputByLabel('Temperature'), { target: { value: '1.2' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ temperature: 1.2 });
  });

  it('updates the model', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.change(getInputByLabel('Model'), { target: { value: 'claude-opus-4-6' } });
    expect(props.onUpdate).toHaveBeenCalledWith({ model: 'claude-opus-4-6' });
  });

  it('adds a StateSet MCP server when its toggle is selected', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /StateSet ResponseCX/ }));
    expect(props.onUpdate).toHaveBeenCalledWith({
      mcp_servers: ['shopify', 'gorgias', 'stateset-response'],
    });
  });

  it('adds a custom MCP server id', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.change(screen.getByLabelText('Add server by id'), { target: { value: 'my-mcp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(props.onUpdate).toHaveBeenCalledWith({
      mcp_servers: ['shopify', 'gorgias', 'my-mcp'],
    });
  });

  it('updates custom instructions', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.change(getInputByLabel('Custom Instructions'), {
      target: { value: 'Always escalate refunds' },
    });
    expect(props.onUpdate).toHaveBeenCalledWith({
      custom_instructions: 'Always escalate refunds',
    });
  });

  it('toggles pause on error', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(props.onUpdate).toHaveBeenCalledWith({ pause_on_error: true });
  });

  it('invokes save, reset and close callbacks', () => {
    const props = makeProps();
    render(<ConfigModal {...props} />);

    fireEvent.click(screen.getByText('Save Settings'));
    expect(props.onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Reset to current'));
    expect(props.onReset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('disables save when there is no config draft', () => {
    render(<ConfigModal {...makeProps({ configDraft: null })} />);
    expect(screen.getByText('Save Settings').closest('button')).toBeDisabled();
  });

  it('disables save while pending', () => {
    render(<ConfigModal {...makeProps({ isPending: true })} />);
    const saveButton = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-busy') === 'true');
    expect(saveButton).toBeDefined();
    expect(saveButton).toBeDisabled();
  });
});
