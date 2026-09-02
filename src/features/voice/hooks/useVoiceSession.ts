import { useCallback, useState } from 'react';
import { agentApi } from '../../../lib/api';
import { requireBrandId, requireTenantId } from '../../../lib/auth-guards';
import {
  buildVoiceAgentPrompt,
  type AssistantFocus,
  type ResponseDepth,
} from '../../../lib/voice/index';
import type { Brand, Tenant } from '../../../types';
import {
  VOICE_AGENT_MODEL,
  VOICE_AGENT_TEMPERATURE,
  VOICE_SESSION_ITERATION_TIMEOUT_SECS,
  VOICE_SESSION_LOOP_INTERVAL_MS,
} from '../constants';

export interface UseVoiceSessionOptions {
  tenant: Tenant | null;
  currentBrand: Brand | null;
  assistantFocus: AssistantFocus;
  responseDepth: ResponseDepth;
  /** Invoked once a new session has been created and started. */
  onSessionReady?: (sessionId: string) => void;
}

export interface VoiceSession {
  sessionId: string | null;
  setSessionId: (sessionId: string | null) => void;
  isProvisioningSession: boolean;
  /**
   * Returns the current session id, provisioning and starting a new
   * interactive agent session when none exists yet.
   */
  ensureSession: () => Promise<string>;
}

/** Owns voice agent session provisioning against the agent API. */
export function useVoiceSession({
  tenant,
  currentBrand,
  assistantFocus,
  responseDepth,
  onSessionReady,
}: UseVoiceSessionOptions): VoiceSession {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isProvisioningSession, setIsProvisioningSession] = useState(false);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) {
      return sessionId;
    }

    if (!tenant || !currentBrand) {
      throw new Error('Select an active tenant and brand before starting voice mode.');
    }

    setIsProvisioningSession(true);
    try {
      const tenantId = requireTenantId(tenant);
      const brandId = requireBrandId(currentBrand);

      const session = await agentApi.createSession(tenantId, brandId, 'interactive', {
        loop_interval_ms: VOICE_SESSION_LOOP_INTERVAL_MS,
        max_iterations: 0,
        iteration_timeout_secs: VOICE_SESSION_ITERATION_TIMEOUT_SECS,
        pause_on_error: false,
        custom_instructions: buildVoiceAgentPrompt(assistantFocus, responseDepth),
        model: VOICE_AGENT_MODEL,
        temperature: VOICE_AGENT_TEMPERATURE,
        mcp_servers: [],
      });

      await agentApi.startSession(tenantId, brandId, session.id);
      setSessionId(session.id);
      onSessionReady?.(session.id);
      return session.id;
    } finally {
      setIsProvisioningSession(false);
    }
  }, [assistantFocus, currentBrand, onSessionReady, responseDepth, sessionId, tenant]);

  return { sessionId, setSessionId, isProvisioningSession, ensureSession };
}
