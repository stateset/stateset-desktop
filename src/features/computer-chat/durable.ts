import { z } from 'zod';
import { engineRequest } from '../../lib/durableWorkflows';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { ChatPersistenceError, useComputerChatsStore } from './store';
import {
  artifactSchema,
  configurationSchema,
  durableStatusSchema,
  setupReportSchema,
  type DurableChatConfiguration,
} from './durableTypes';
import type { ComputerChat } from './types';
import { chatEnded } from './library';
import { mergeChatHistory, mergeTimeline } from './history';
import { decodeArtifactContent, sameArtifactVersion, type ArtifactVersion } from './artifacts';
import { approvalUnavailable, approvalVersion, supportedReplacement } from './approvals';

export class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ChatRequestError';
  }
}

export async function chatRequest<T>(
  tenantId: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T> {
  const bridge = window.electronAPI?.computerChat;
  if (bridge) {
    const result = await bridge.request({ tenantId, path, method, body });
    if (!result.ok) {
      const error = result.body as { message?: string; error?: string } | null;
      throw new ChatRequestError(
        error?.message || error?.error || `Workflow engine returned HTTP ${result.status}`,
        result.status
      );
    }
    return result.body as T;
  }
  return engineRequest<T>(path, { tenantId, method, body, signal: AbortSignal.timeout(60000) });
}
const route = (id: string, suffix: string) =>
  `/v1/computer-chats/${encodeURIComponent(id)}/${suffix}`;
export const durableChatApi = {
  diagnostics: async (tenantId: string, brandId: string, mcpServers: string[] = []) => {
    const report = setupReportSchema.parse(
      await chatRequest(tenantId, '/v1/computer-chats/diagnostics', 'POST', {
        brand_id: brandId,
        mcp_servers: mcpServers,
      })
    );
    if (
      report.ready &&
      mcpServers.some(
        (key) => !report.mcp_servers.some((server) => server.key === key && server.ready)
      )
    )
      throw new Error(
        'The diagnostic report does not confirm the selected tools. Run connection checks again.'
      );
    return report;
  },
  status: async (tenantId: string, id: string) =>
    durableStatusSchema.parse(await chatRequest(tenantId, route(id, 'status'))),
  control: (tenantId: string, id: string, control: 'pause' | 'resume' | 'retry' | 'stop') =>
    chatRequest(tenantId, route(id, `control/${control}`), 'POST'),
  message: (tenantId: string, id: string, message: { id: string; content: string }) =>
    chatRequest(tenantId, route(id, 'messages'), 'POST', message),
  review: (
    tenantId: string,
    id: string,
    review: { request_id: string; action_hash: string; approved: boolean; accept_rewrite: boolean }
  ) => chatRequest(tenantId, route(id, 'review'), 'POST', review),
  workspace: (
    tenantId: string,
    id: string,
    operation: 'list' | 'read' | 'screenshot' | 'checkpoint' | 'recover',
    path = '/workspace'
  ) =>
    chatRequest(tenantId, route(id, 'workspace'), 'POST', {
      id: crypto.randomUUID(),
      operation,
      path,
    }),
  artifact: async (tenantId: string, id: string, path: string) =>
    artifactSchema.parse(await chatRequest(tenantId, route(id, 'artifact'), 'POST', { path })),
};
const mutations = new Set<string>();
const polling = new Set<string>();
const artifactExports = new Set<string>();
function chat(id: string) {
  const value = useComputerChatsStore.getState().chats.find((c) => c.id === id);
  if (!value) throw new Error('Chat was removed');
  return value;
}
function scoped(id: string) {
  const value = chat(id);
  const auth = useAuthStore.getState();
  if (value.tenantId !== auth.tenant?.id || value.brandId !== auth.currentBrand?.id)
    throw new Error('Select this chat’s organization and brand to continue');
  const identity = value.durableSession;
  if (!identity) throw new Error('Import this previous chat into a durable computer session first');
  if (identity.engineUrl !== useDurableWorkflowsStore.getState().engineUrl)
    throw new Error('Restore this chat’s workflow engine URL before continuing');
  return { ...value, durableSession: identity };
}
async function save(id: string, patch: Partial<ComputerChat>) {
  await useComputerChatsStore.getState().save({ ...chat(id), ...patch });
}

function stillCurrent(value: ComputerChat) {
  const auth = useAuthStore.getState();
  const latest = useComputerChatsStore.getState().chats.find((c) => c.id === value.id);
  return (
    latest?.durableSession?.workflowId === value.durableSession?.workflowId &&
    value.tenantId === auth.tenant?.id &&
    value.brandId === auth.currentBrand?.id &&
    value.durableSession?.engineUrl === useDurableWorkflowsStore.getState().engineUrl
  );
}
async function readArtifact(id: string, path: string, expected?: ArtifactVersion) {
  const value = scoped(id);
  const recorded = value.serverState?.artifacts.find((artifact) => artifact.path === path);
  if (!recorded) throw new Error('Collect this file as a deliverable before opening it');
  const version = expected ?? { ...recorded };
  if (!sameArtifactVersion(recorded, version))
    throw new Error('This file has changed since collection. Collect and verify it again.');
  const response = await durableChatApi.artifact(
    value.tenantId,
    value.durableSession.workflowId,
    path
  );
  const content = await decodeArtifactContent(response, version);
  if (!stillCurrent(value))
    throw new Error('The conversation workspace changed while loading this file');
  const latest = chat(id).serverState?.artifacts.find((artifact) => artifact.path === path);
  if (!latest || !sameArtifactVersion(latest, version))
    throw new Error('This file has changed since collection. Collect and verify it again.');
  return content;
}
async function mutation(id: string, operation: () => Promise<void>) {
  if (mutations.has(id)) return;
  mutations.add(id);
  useComputerChatsStore.getState().setBusy(id, true);
  try {
    await save(id, { error: undefined });
    await operation();
  } catch (error) {
    await save(id, { error: error instanceof Error ? error.message : String(error) }).catch(
      () => undefined
    );
  } finally {
    mutations.delete(id);
    useComputerChatsStore.getState().setBusy(id, false);
  }
}

export const durableChatController = {
  create: async (
    tenantId: string,
    brandId: string,
    configuration: DurableChatConfiguration,
    source?: { id: string; title: string; messages: { role: string; content: string }[] }
  ) => {
    const config = configurationSchema.parse(configuration);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const workflowId = `computer-chat-${brandId.replace(/-/g, '')}-${id.replace(/-/g, '')}`;
    const imported = source?.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-30)
      .map((m) => ({
        id: crypto.randomUUID(),
        content: `Previous ${m.role}: ${m.content.slice(0, 7500)}`,
      }));
    await useComputerChatsStore.getState().save({
      id,
      tenantId,
      brandId,
      title: source?.title ?? 'New computer chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
      workflows: [],
      legacySourceId: source?.id,
      durableSession: {
        version: 2,
        workflowId,
        engineUrl: useDurableWorkflowsStore.getState().engineUrl,
        configuration: config,
        importedMessages: imported,
      },
    });
    return id;
  },
  provision: (id: string) =>
    mutation(id, async () => {
      const value = scoped(id);
      const identity = value.durableSession;
      const result = z.object({ workflow_id: z.string(), run_id: z.string() }).parse(
        await chatRequest(value.tenantId, '/v1/computer-chats/start', 'POST', {
          request_id: value.id,
          brand_id: value.brandId,
          ...identity.configuration,
          imported_messages: identity.importedMessages ?? [],
          initial_message: identity.initialMessage,
          close_after_turn: identity.closeAfterTurn ?? false,
        })
      );
      if (result.workflow_id !== identity.workflowId)
        throw new Error('The engine returned an unexpected conversation identity');
      await save(id, {
        durableSession: { ...identity, runId: result.run_id },
        workflows: [{ workflowId: result.workflow_id, runId: result.run_id }],
      });
      await durableChatController.refresh(id);
    }),
  refresh: async (id: string) => {
    if (polling.has(id)) return;
    polling.add(id);
    try {
      const value = scoped(id);
      const connection = useDurableWorkflowsStore.getState();
      if (connection.initialized && !connection.apiKey)
        throw new ChatRequestError(
          'Enter your workflow API key in connection settings to reconnect.',
          401
        );
      const state = await durableChatApi.status(value.tenantId, value.durableSession.workflowId);
      if (!stillCurrent(value)) return;
      if (state.request_id !== value.id || state.brand_id !== value.brandId)
        throw new Error('Conversation identity does not match this chat');
      const latest = chat(id);
      const previous = latest.serverState;
      if (
        previous &&
        (state.generation < previous.generation || state.last_event_id < previous.last_event_id)
      )
        return;
      useComputerChatsStore
        .getState()
        .setConnection(id, { status: 'connected', failures: 0, lastSyncedAt: Date.now() });
      const confirmedPending =
        latest.pendingMessage && state.messages.some((m) => m.id === latest.pendingMessage?.id);
      if (
        previous &&
        JSON.stringify(previous) === JSON.stringify(state) &&
        !confirmedPending &&
        !latest.error
      )
        return;
      const messages = state.messages.map((m) =>
        m.role === 'tool'
          ? { ...m, tool: m.tool ?? { name: m.content, status: 'success' as const } }
          : m
      );
      const history = mergeChatHistory(latest.messages, messages);
      const timeline = mergeTimeline(latest.timeline ?? previous?.events ?? [], state.events);
      const lastCachedEvent =
        latest.timeline?.[latest.timeline.length - 1]?.id ?? previous?.last_event_id ?? 0;
      const missedEvents = Boolean(state.events.length && state.events[0].id > lastCachedEvent + 1);
      const activityAt = Math.max(
        Date.parse(latest.updatedAt) || 0,
        ...state.messages.map((m) => m.timestamp),
        ...state.events.map((e) => e.at)
      );
      await save(id, {
        serverState: state,
        session: state.session ?? undefined,
        messages: history.messages,
        timeline: timeline.events,
        historyTruncated:
          latest.historyTruncated || history.truncated || timeline.truncated || missedEvents,
        updatedAt: activityAt ? new Date(activityAt).toISOString() : latest.updatedAt,
        pendingMessage: confirmedPending ? undefined : latest.pendingMessage,
        stopped: state.cleanup_verified,
        error: undefined,
        screenshot: state.screenshot ?? undefined,
      });
    } catch (error) {
      if (error instanceof ChatPersistenceError) return;
      const latest = useComputerChatsStore.getState().chats.find((c) => c.id === id);
      if (!latest || !stillCurrent(latest)) return;
      const previous = useComputerChatsStore.getState().connections[id];
      const failures = (previous?.failures ?? 0) + 1;
      const status =
        error instanceof Error && 'status' in error && typeof error.status === 'number'
          ? error.status
          : undefined;
      const retryable =
        status !== undefined
          ? [408, 425, 429].includes(status) || status >= 500
          : !(error instanceof z.ZodError) &&
            !(error instanceof Error && error.message.includes('identity'));
      useComputerChatsStore.getState().setConnection(id, {
        status: retryable ? 'reconnecting' : 'attention',
        failures,
        lastSyncedAt: previous?.lastSyncedAt,
        nextRetryAt: retryable
          ? Date.now() + Math.min(60000, 3000 * 2 ** Math.min(failures - 1, 5))
          : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      polling.delete(id);
    }
  },
  send: (id: string, content: string) =>
    mutation(id, async () => {
      const value = scoped(id);
      if (chatEnded(value) || value.serverState?.stop_requested)
        throw new Error(
          'This computer has ended or is stopping. Continue in a new computer to send another instruction.'
        );
      if (!content.trim() || new TextEncoder().encode(content.trim()).byteLength > 8000)
        throw new Error('Messages must contain 1–8000 UTF-8 bytes');
      const pending = value.pendingMessage ?? { id: crypto.randomUUID(), content: content.trim() };
      if (value.pendingMessage && value.pendingMessage.content !== content.trim())
        throw new Error('Resend the pending message before sending another');
      await save(id, {
        pendingMessage: pending,
        ...(value.draft === content ? { draft: undefined } : {}),
        title:
          value.customTitle || value.messages.some((m) => m.role === 'user')
            ? value.title
            : pending.content.slice(0, 60),
        updatedAt: new Date().toISOString(),
      });
      await durableChatApi.message(value.tenantId, value.durableSession.workflowId, pending);
      // Keep the request id until the workflow query confirms receipt, so a
      // lost signal acknowledgement can be retried without double posting.
      await durableChatController.refresh(id);
    }),
  control: (id: string, control: 'pause' | 'resume' | 'retry' | 'stop') =>
    mutation(id, async () => {
      const value = scoped(id);
      await durableChatApi.control(value.tenantId, value.durableSession.workflowId, control);
      await durableChatController.refresh(id);
    }),
  review: (id: string, expectedVersion: string, approved: boolean, acceptRewrite = false) =>
    mutation(id, async () => {
      const value = scoped(id);
      if (approvalVersion(value) !== expectedVersion)
        throw new Error('This action changed. Review the current action before deciding.');
      const unavailable = approvalUnavailable(value);
      if (unavailable) throw new Error(unavailable);
      if (
        navigator.onLine === false ||
        useComputerChatsStore.getState().connections[id]?.status !== 'connected'
      )
        throw new Error('Reconnect and refresh the conversation before reviewing this action.');
      const pending = value.serverState!.pending_action!;
      const rewrite = pending.admission!.final_verdict === 'rewrite';
      if (approved && rewrite && (!acceptRewrite || !supportedReplacement(value)))
        throw new Error('Explicit acceptance of a supported replacement is required.');
      await durableChatApi.review(value.tenantId, value.durableSession.workflowId, {
        request_id: pending.request_id,
        action_hash: pending.admission!.evaluation.canonical_action_hash,
        approved,
        accept_rewrite: approved && rewrite && acceptRewrite,
      });
      await durableChatController.refresh(id);
    }),
  workspace: (
    id: string,
    operation: 'list' | 'read' | 'screenshot' | 'checkpoint' | 'recover',
    path = '/workspace'
  ) =>
    mutation(id, async () => {
      const value = scoped(id);
      await durableChatApi.workspace(
        value.tenantId,
        value.durableSession.workflowId,
        operation,
        path
      );
      await durableChatController.refresh(id);
    }),
  readArtifact,
  exportArtifact: async (id: string, path: string, expected?: ArtifactVersion) => {
    const key = JSON.stringify([id, path]);
    if (artifactExports.has(key)) throw new Error('This file is already being saved');
    artifactExports.add(key);
    try {
      const artifact = await readArtifact(id, path, expected);
      const filename = artifact.path.split('/').pop() || 'deliverable';
      if (window.electronAPI?.computerChat)
        return await window.electronAPI.computerChat.saveArtifact({
          filename,
          contentBase64: artifact.contentBase64,
          sha256: artifact.sha256,
        });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(artifact.bytes)], { type: artifact.media_type })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } finally {
      artifactExports.delete(key);
    }
  },
};
