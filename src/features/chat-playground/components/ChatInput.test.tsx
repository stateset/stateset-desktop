/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';

function makeProps(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  return {
    onSend: vi.fn(),
    isLoading: false,
    ...overrides,
  };
}

describe('ChatInput', () => {
  it('renders the default placeholder', () => {
    render(<ChatInput {...makeProps()} />);
    expect(
      screen.getByPlaceholderText('Type a message... (Shift+Enter for new line)')
    ).toBeInTheDocument();
  });

  it('renders a custom placeholder when provided', () => {
    render(<ChatInput {...makeProps({ placeholder: 'Ask the agent...' })} />);
    expect(screen.getByPlaceholderText('Ask the agent...')).toBeInTheDocument();
  });

  it('focuses the textarea on mount', () => {
    render(<ChatInput {...makeProps()} />);
    expect(screen.getByLabelText('Chat message')).toHaveFocus();
  });

  it('disables the send button when input is empty or whitespace', () => {
    render(<ChatInput {...makeProps()} />);
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: '   ' } });
    expect(sendButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'hi' } });
    expect(sendButton).toBeEnabled();
  });

  it('sends the message on button click and clears the input', () => {
    const onSend = vi.fn();
    render(<ChatInput {...makeProps({ onSend })} />);

    const textarea = screen.getByLabelText('Chat message');
    fireEvent.change(textarea, { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).toHaveBeenCalledWith('hello world');
    expect(textarea).toHaveValue('');
  });

  it('sends the message on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput {...makeProps({ onSend })} />);

    const textarea = screen.getByLabelText('Chat message');
    fireEvent.change(textarea, { target: { value: 'enter message' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('enter message');
    expect(textarea).toHaveValue('');
  });

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput {...makeProps({ onSend })} />);

    const textarea = screen.getByLabelText('Chat message');
    fireEvent.change(textarea, { target: { value: 'multiline' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('multiline');
  });

  it('does not send whitespace-only input on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput {...makeProps({ onSend })} />);

    const textarea = screen.getByLabelText('Chat message');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('blocks sending while loading', () => {
    const onSend = vi.fn();
    render(<ChatInput {...makeProps({ onSend, isLoading: true })} />);

    const textarea = screen.getByLabelText('Chat message');
    expect(textarea).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });
});
