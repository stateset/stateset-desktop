import type { AssistantFocus } from '../../lib/voice/index';

/** Maximum number of conversation messages kept in the transcript view. */
export const CONVERSATION_MESSAGE_LIMIT = 40;

/** How long assistant audio playback is suppressed after the user barges in. */
export const BARGE_IN_COOLDOWN_MS = 1500;

/** MediaRecorder timeslice used while capturing microphone audio. */
export const RECORDER_TIMESLICE_MS = 250;

/** Agent session defaults for the voice surface. */
export const VOICE_AGENT_MODEL = 'claude-sonnet-4-6';
export const VOICE_AGENT_TEMPERATURE = 0.5;
export const VOICE_SESSION_LOOP_INTERVAL_MS = 1000;
export const VOICE_SESSION_ITERATION_TIMEOUT_SECS = 300;

/** Quick-start prompts shown in the empty state, keyed by assistant focus. */
export const QUICK_ACTION_PROMPTS: Record<AssistantFocus, readonly string[]> = {
  operations: [
    'Summarize current operational risks and suggest the top 3 mitigations.',
    'Draft a runbook for handling failed order modifications in under 5 minutes.',
    'Identify automations that would reduce repetitive support workload this week.',
  ],
  growth: [
    'Give me 3 high-impact conversion ideas based on common support conversations.',
    'Draft a concise campaign message for win-back customers.',
    'Recommend retention plays for customers with delayed shipments.',
  ],
  support: [
    'Help me respond to: "Where is my order #1001?"',
    'Draft a kind response for a delayed delivery complaint.',
    'Give a 3-step plan for handling return and exchange requests faster.',
  ],
};

/** Shared form control styles for the settings panel. */
export const SETTINGS_INPUT_CLASSES =
  'w-full rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm text-gray-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35';
export const SETTINGS_SELECT_CLASSES =
  'w-full rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35';

/** DOM id linking the settings toggle button to the collapsible panel. */
export const VOICE_SETTINGS_PANEL_ID = 'voice-settings-panel';
