/** @vitest-environment happy-dom */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeProps(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  return {
    onSend: vi.fn(),
    isLoading: false,
    ...overrides,
  };
}

describe('ChatInput', () => {
  it.each([{ isLoading: true }, { disabled: true }])(
    'allows opt-in drafting while submission is blocked by %j',
    (blocked) => {
      const props = makeProps({
        ...blocked,
        allowDraftEditing: true,
        hint: 'Draft now. Send when ready.',
        maxBytes: 8,
      });
      const { rerender } = render(<ChatInput {...props} />);
      const textarea = screen.getByLabelText('Chat message');
      expect(textarea).toBeEnabled();
      fireEvent.change(textarea, { target: { value: 'Next' } });
      expect(textarea).toHaveValue('Next');
      expect(textarea).toHaveAccessibleDescription('Draft now. Send when ready. 4 / 8 bytes');
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
      fireEvent.keyDown(textarea, { key: 'Enter' });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
      expect(props.onSend).not.toHaveBeenCalled();
      rerender(<ChatInput {...props} isLoading={false} disabled={false} hint={undefined} />);
      expect(textarea).toHaveValue('Next');
      expect(props.onSend).not.toHaveBeenCalled();
      fireEvent.change(textarea, { target: { value: '🙂🙂🙂' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(props.onSend).not.toHaveBeenCalled();
      fireEvent.change(textarea, { target: { value: 'Next' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(props.onSend).toHaveBeenCalledExactlyOnceWith('Next');
    }
  );
  it('retains a controlled draft until the owner clears the saved submission', () => {
    const props = makeProps({ value: 'Recovered draft', onChange: vi.fn(), onBlur: vi.fn() });
    const { rerender } = render(<ChatInput {...props} />);
    const textarea = screen.getByLabelText('Chat message');
    expect(props.onSend).not.toHaveBeenCalled();
    fireEvent.change(textarea, { target: { value: 'Edited draft' } });
    expect(props.onChange).toHaveBeenCalledWith('Edited draft');
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(props.onSend).toHaveBeenCalledWith('Recovered draft');
    expect(textarea).toHaveValue('Recovered draft');
    fireEvent.blur(textarea);
    expect(props.onBlur).toHaveBeenCalled();
    rerender(<ChatInput {...props} value="" />);
    expect(textarea).toHaveValue('');
  });

  it('measures multibyte messages in UTF-8 bytes before sending', () => {
    const props = makeProps({ maxBytes: 8 });
    render(<ChatInput {...props} />);
    const textarea = screen.getByLabelText('Chat message');
    fireEvent.change(textarea, { target: { value: '🙂🙂🙂' } });
    expect(screen.getByRole('alert')).toHaveTextContent('12 / 8 bytes');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(props.onSend).not.toHaveBeenCalled();
    fireEvent.change(textarea, { target: { value: '🙂🙂' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(props.onSend).toHaveBeenCalledWith('🙂🙂');
  });

  it('does not submit Enter while composing text with an input method', () => {
    const props = makeProps();
    render(<ChatInput {...props} />);
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: '日本語' } });
    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter', isComposing: true });
    expect(props.onSend).not.toHaveBeenCalled();
  });
  it('refits a draft when its width changes without moving focus or leaking observers', () => {
    let notify: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      }
    );
    let pendingFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      pendingFrame = callback;
      return 1;
    });
    const cancelFrame = vi.fn(() => {
      pendingFrame = undefined;
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const flushFrame = () =>
      act(() => {
        const callback = pendingFrame;
        pendingFrame = undefined;
        callback?.(0);
      });
    const onSend = vi.fn();
    const { unmount } = render(<ChatInput {...makeProps({ onSend })} />);
    const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;
    let width = 500;
    let height = 60;
    Object.defineProperties(textarea, {
      clientWidth: { configurable: true, get: () => width },
      scrollHeight: { configurable: true, get: () => height },
    });
    fireEvent.change(textarea, { target: { value: 'A draft that wraps after resizing' } });
    act(() => notify?.());
    flushFrame();
    expect(textarea.style.height).toBe('60px');
    // A resize in height alone must not reset scroll position inside a long draft.
    textarea.scrollTop = 20;
    height = 120;
    act(() => notify?.());
    expect(textarea.style.height).toBe('60px');
    expect(textarea.scrollTop).toBe(20);
    requestFrame.mockClear();
    width = 300;
    act(() => notify?.());
    width = 250;
    act(() => notify?.());
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(textarea.style.height).toBe('60px');
    flushFrame();
    expect(textarea.style.height).toBe('120px');
    expect(textarea).toHaveValue('A draft that wraps after resizing');
    expect(textarea).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
    width = 200;
    height = 240;
    act(() => notify?.());
    flushFrame();
    expect(textarea.style.height).toBe('160px');
    width = 500;
    height = 60;
    act(() => notify?.());
    flushFrame();
    expect(textarea.style.height).toBe('60px');
    width = 200;
    act(() => notify?.());
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(pendingFrame).toBeUndefined();
  });

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
