/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceEmptyState } from './VoiceEmptyState';

const prompts = ['Prompt one', 'Prompt two', 'Prompt three'] as const;

function makeProps(overrides: Partial<React.ComponentProps<typeof VoiceEmptyState>> = {}) {
  return {
    isRecording: false,
    isConnected: false,
    isTranscribing: false,
    isSending: false,
    reduceMotion: true,
    hasApiKey: true,
    quickActionPrompts: prompts,
    onOpenSettings: vi.fn(),
    onSelectPrompt: vi.fn(),
    ...overrides,
  };
}

describe('VoiceEmptyState', () => {
  it('prompts for an API key when none is set', () => {
    const props = makeProps({ hasApiKey: false });
    render(<VoiceEmptyState {...props} />);

    expect(screen.getByText('ElevenLabs API key required')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open Settings/ }));
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('greets the user when an API key is present', () => {
    render(<VoiceEmptyState {...makeProps()} />);

    expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    expect(screen.queryByText('ElevenLabs API key required')).not.toBeInTheDocument();
  });

  it('renders quick action prompts and forwards selection', () => {
    const props = makeProps();
    render(<VoiceEmptyState {...props} />);

    for (const prompt of prompts) {
      expect(screen.getByRole('button', { name: prompt })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Prompt two' }));
    expect(props.onSelectPrompt).toHaveBeenCalledWith('Prompt two');
  });

  it('disables quick action prompts while sending', () => {
    render(<VoiceEmptyState {...makeProps({ isSending: true })} />);

    for (const prompt of prompts) {
      expect(screen.getByRole('button', { name: prompt })).toBeDisabled();
    }
  });
});
