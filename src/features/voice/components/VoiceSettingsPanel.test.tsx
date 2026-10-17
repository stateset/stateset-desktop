/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, ...rest } = props;
  return rest;
}

function makeProps(overrides: Partial<React.ComponentProps<typeof VoiceSettingsPanel>> = {}) {
  return {
    open: true,
    reduceMotion: false,
    apiKey: '',
    onApiKeyChange: vi.fn(),
    voiceId: 'voice-1',
    onVoiceIdChange: vi.fn(),
    sttModel: 'scribe_v1' as const,
    onSttModelChange: vi.fn(),
    ttsModel: 'eleven_turbo_v2_5',
    onTtsModelChange: vi.fn(),
    assistantFocus: 'support' as const,
    onAssistantFocusChange: vi.fn(),
    responseDepth: 'balanced' as const,
    onResponseDepthChange: vi.fn(),
    autoSpeak: true,
    onToggleAutoSpeak: vi.fn(),
    ...overrides,
  };
}

describe('VoiceSettingsPanel', () => {
  it('renders nothing when closed', () => {
    render(<VoiceSettingsPanel {...makeProps({ open: false })} />);
    expect(screen.queryByLabelText('ElevenLabs API Key')).not.toBeInTheDocument();
  });

  it('renders all settings fields when open', () => {
    render(<VoiceSettingsPanel {...makeProps()} />);

    expect(screen.getByLabelText('ElevenLabs API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Voice ID')).toHaveValue('voice-1');
    expect(screen.getByLabelText('STT Model')).toHaveValue('scribe_v1');
    expect(screen.getByLabelText('TTS Model')).toHaveValue('eleven_turbo_v2_5');
    expect(screen.getByLabelText('Focus')).toHaveValue('support');
    expect(screen.getByLabelText('Depth')).toHaveValue('balanced');
  });

  it('exposes the panel as a labelled region', () => {
    render(<VoiceSettingsPanel {...makeProps()} />);
    expect(screen.getByRole('region', { name: 'Voice settings' })).toBeInTheDocument();
  });

  it('masks the API key input', () => {
    render(<VoiceSettingsPanel {...makeProps()} />);
    expect(screen.getByLabelText('ElevenLabs API Key')).toHaveAttribute('type', 'password');
  });

  it('forwards field changes to the handlers', () => {
    const props = makeProps();
    render(<VoiceSettingsPanel {...props} />);

    fireEvent.change(screen.getByLabelText('ElevenLabs API Key'), {
      target: { value: 'xi-key' },
    });
    expect(props.onApiKeyChange).toHaveBeenCalledWith('xi-key');

    fireEvent.change(screen.getByLabelText('STT Model'), { target: { value: 'scribe_v2' } });
    expect(props.onSttModelChange).toHaveBeenCalledWith('scribe_v2');

    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'growth' } });
    expect(props.onAssistantFocusChange).toHaveBeenCalledWith('growth');

    fireEvent.change(screen.getByLabelText('Depth'), { target: { value: 'detailed' } });
    expect(props.onResponseDepthChange).toHaveBeenCalledWith('detailed');
  });

  it('renders the auto-speak toggle as a switch reflecting state', () => {
    const props = makeProps({ autoSpeak: false });
    render(<VoiceSettingsPanel {...props} />);

    const toggle = screen.getByRole('switch', { name: 'Auto-speak assistant replies' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveTextContent('Auto-speak off');

    fireEvent.click(toggle);
    expect(props.onToggleAutoSpeak).toHaveBeenCalledOnce();
  });
});
