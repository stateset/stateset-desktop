/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceInputBar } from './VoiceInputBar';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...filterDomProps(props)}>{children}</span>
    ),
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...filterDomProps(props)}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, ...rest } = props;
  return rest;
}

function makeProps(overrides: Partial<React.ComponentProps<typeof VoiceInputBar>> = {}) {
  return {
    manualInput: '',
    onManualInputChange: vi.fn(),
    onManualSend: vi.fn(),
    canRecord: true,
    isRecording: false,
    isTranscribing: false,
    isSpeaking: false,
    isSending: false,
    reduceMotion: true,
    onRecordStart: vi.fn(),
    onRecordStop: vi.fn(),
    ...overrides,
  };
}

describe('VoiceInputBar', () => {
  it('forwards typed input to onManualInputChange', () => {
    const props = makeProps();
    render(<VoiceInputBar {...props} />);

    fireEvent.change(screen.getByLabelText('Message the voice agent'), {
      target: { value: 'hello' },
    });
    expect(props.onManualInputChange).toHaveBeenCalledWith('hello');
  });

  it('sends on Enter in the text input', () => {
    const props = makeProps({ manualInput: 'hello' });
    render(<VoiceInputBar {...props} />);

    fireEvent.keyDown(screen.getByLabelText('Message the voice agent'), { key: 'Enter' });
    expect(props.onManualSend).toHaveBeenCalledOnce();
  });

  it('disables the send button when input is empty or sending', () => {
    const { rerender } = render(<VoiceInputBar {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    rerender(<VoiceInputBar {...makeProps({ manualInput: 'hi' })} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();

    rerender(<VoiceInputBar {...makeProps({ manualInput: 'hi', isSending: true })} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('starts recording on mic pointer down and stops on pointer up', () => {
    const props = makeProps();
    const { rerender } = render(<VoiceInputBar {...props} />);

    const mic = screen.getByRole('button', { name: 'Hold to talk' });
    fireEvent.pointerDown(mic);
    expect(props.onRecordStart).toHaveBeenCalledOnce();

    rerender(<VoiceInputBar {...props} isRecording />);
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Release to send' }));
    expect(props.onRecordStop).toHaveBeenCalledOnce();
  });

  it('supports keyboard hold-to-talk on the mic button', () => {
    const props = makeProps();
    const { rerender } = render(<VoiceInputBar {...props} />);

    const mic = screen.getByRole('button', { name: 'Hold to talk' });
    fireEvent.keyDown(mic, { key: ' ' });
    expect(props.onRecordStart).toHaveBeenCalledOnce();

    rerender(<VoiceInputBar {...props} isRecording />);
    fireEvent.keyUp(screen.getByRole('button', { name: 'Release to send' }), { key: ' ' });
    expect(props.onRecordStop).toHaveBeenCalledOnce();
  });

  it('does not start recording when recording is unavailable', () => {
    const props = makeProps({ canRecord: false });
    render(<VoiceInputBar {...props} />);

    const mic = screen.getByRole('button', { name: 'Hold to talk' });
    expect(mic).toBeDisabled();
    fireEvent.pointerDown(mic);
    expect(props.onRecordStart).not.toHaveBeenCalled();
  });

  it('announces the active voice state politely', () => {
    const { rerender } = render(<VoiceInputBar {...makeProps({ isRecording: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Listening… release to send');

    rerender(<VoiceInputBar {...makeProps({ isTranscribing: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Transcribing…');

    rerender(<VoiceInputBar {...makeProps({ isSpeaking: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Speaking…');

    rerender(<VoiceInputBar {...makeProps()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
