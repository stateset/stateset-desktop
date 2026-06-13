/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageInput } from './MessageInput';

function makeProps(overrides: Partial<Parameters<typeof MessageInput>[0]> = {}) {
  return {
    input: '',
    canSend: true,
    isRunning: true,
    isPaused: false,
    isManualMode: false,
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  };
}

describe('MessageInput', () => {
  it('shows the running placeholder when the agent is running', () => {
    render(<MessageInput {...makeProps()} />);
    expect(screen.getByPlaceholderText('Send a message to the agent...')).toBeInTheDocument();
  });

  it('shows the manual mode placeholder when stopped in manual mode', () => {
    render(<MessageInput {...makeProps({ isRunning: false, isManualMode: true })} />);
    expect(screen.getByPlaceholderText('Send a message to start the agent...')).toBeInTheDocument();
  });

  it('shows the start-agent placeholder when stopped and not manual', () => {
    render(<MessageInput {...makeProps({ isRunning: false })} />);
    expect(screen.getByPlaceholderText('Start the agent to send messages')).toBeInTheDocument();
  });

  it('disables the textarea when sending is not allowed', () => {
    render(<MessageInput {...makeProps({ canSend: false, isRunning: false })} />);
    expect(screen.getByLabelText('Message to agent')).toBeDisabled();
    expect(screen.getByText('Start the agent to send messages.')).toBeInTheDocument();
  });

  it('shows contextual hints based on input state', () => {
    const { rerender } = render(<MessageInput {...makeProps()} />);
    expect(screen.getByText('Type a message to send to the agent.')).toBeInTheDocument();

    rerender(<MessageInput {...makeProps({ input: 'hello' })} />);
    expect(screen.getByText('Tip: Enter to send, Shift + Enter for newline.')).toBeInTheDocument();
  });

  it('forwards typed input to onInputChange', () => {
    const props = makeProps();
    render(<MessageInput {...props} />);

    fireEvent.change(screen.getByLabelText('Message to agent'), {
      target: { value: 'hello agent' },
    });
    expect(props.onInputChange).toHaveBeenCalledWith('hello agent');
  });

  it('disables the send button without text and enables it with text', () => {
    const { rerender } = render(<MessageInput {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Type a message to send' })).toBeDisabled();

    rerender(<MessageInput {...makeProps({ input: 'hi' })} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  it('labels the send button to start the agent when sending is not allowed', () => {
    render(<MessageInput {...makeProps({ canSend: false })} />);
    expect(screen.getByRole('button', { name: 'Start the agent first' })).toBeDisabled();
  });

  it('sends on button click', () => {
    const props = makeProps({ input: 'hello' });
    render(<MessageInput {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('sends on Enter when allowed', () => {
    const props = makeProps({ input: 'hello' });
    render(<MessageInput {...props} />);

    fireEvent.keyDown(screen.getByLabelText('Message to agent'), { key: 'Enter' });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('does not send on Shift+Enter', () => {
    const props = makeProps({ input: 'hello' });
    render(<MessageInput {...props} />);

    fireEvent.keyDown(screen.getByLabelText('Message to agent'), {
      key: 'Enter',
      shiftKey: true,
    });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter when input is only whitespace', () => {
    const props = makeProps({ input: '   ' });
    render(<MessageInput {...props} />);

    fireEvent.keyDown(screen.getByLabelText('Message to agent'), { key: 'Enter' });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter when canSend is false', () => {
    const props = makeProps({ input: 'hello', canSend: false });
    render(<MessageInput {...props} />);

    fireEvent.keyDown(screen.getByLabelText('Message to agent'), { key: 'Enter' });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('hides the character counter for short input', () => {
    render(<MessageInput {...makeProps({ input: 'short message' })} />);
    expect(screen.queryByText(/\/8,000/)).not.toBeInTheDocument();
  });

  it('shows the character counter above 70% of the limit', () => {
    const input = 'a'.repeat(6000);
    render(<MessageInput {...makeProps({ input })} />);
    expect(
      screen.getByText(`${(6000).toLocaleString()}/${(8000).toLocaleString()}`)
    ).toBeInTheDocument();
  });
});
