import { create } from 'zustand';
import { z } from 'zod';
import { stripToolPayloads } from '../chat-playground/toolActivity';
import type { ChatConnection, ComputerChat } from './types';
import { actionSchema } from './api';
import {
  configurationSchema,
  durableStatusSchema,
  type DurableChatConfiguration,
} from './durableTypes';
import { parseStartConfiguration } from './configuration';

const STORAGE_KEY = 'computerChats';
export class ChatPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatPersistenceError';
  }
}
const policySchema = z.object({
  phase: z.enum(['admission', 'verification']),
  verdict: z.enum(['allow', 'rewrite', 'ask_user', 'deny']),
  actionHash: z.string(),
  evidenceIds: z.array(z.string()),
  reasons: z.array(z.string()),
  checkedAt: z.string(),
});
// Validate persisted scope and identity before allowing a stored chat to execute.
const storedChatSchema = z.object({
  id: z.uuid(),
  tenantId: z.string().min(1),
  brandId: z.string().min(1),
  title: z.string(),
  draft: z.string().optional(),
  lastOpenedAt: z.string().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  customTitle: z.boolean().optional(),
  historyTruncated: z.boolean().optional(),
  timeline: durableStatusSchema.shape.events.optional(),
  durableSession: z
    .object({
      version: z.literal(2),
      workflowId: z.string(),
      runId: z.string().optional(),
      engineUrl: z.string(),
      configuration: configurationSchema,
      initialMessage: z.object({ id: z.uuid(), content: z.string() }).optional(),
      importedMessages: z.array(z.object({ id: z.uuid(), content: z.string() })).optional(),
      closeAfterTurn: z.boolean().optional(),
    })
    .optional(),
  serverState: durableStatusSchema.optional(),
  pendingMessage: z.object({ id: z.uuid(), content: z.string() }).optional(),
  legacySourceId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(
    z
      .object({
        id: z.string(),
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.string(),
        timestamp: z.number(),
      })
      .passthrough()
  ),
  workflows: z.array(z.object({ workflowId: z.string(), runId: z.string() })),
  session: z
    .object({
      id: z.string().min(1),
      organizationId: z.string().min(1),
      status: z.string(),
      currentSandboxId: z.string().nullable().optional(),
    })
    .optional(),
  provisioningAttempted: z.boolean().optional(),
  pending: z
    .object({
      requestId: z.uuid(),
      action: actionSchema,
      command: z.array(z.string()).min(1),
      durable: z.boolean(),
      verify: z.boolean(),
      engineUrl: z.string().optional(),
      workflowId: z.string().optional(),
      runId: z.string().optional(),
      admission: policySchema.optional(),
      result: z
        .object({
          exitCode: z.number().int(),
          stdout: z.string(),
          stderr: z.string(),
          outputTruncated: z.boolean(),
        })
        .optional(),
    })
    .optional(),
  policy: policySchema.optional(),
  policyHistory: z.array(policySchema.extend({ requestId: z.uuid() })).optional(),
  stopped: z.boolean().optional(),
  error: z.string().optional(),
});

interface ComputerChatsState {
  persistenceError?: string;
  flush: () => Promise<void>;
  flushDrafts: () => Promise<void>;
  setDraft: (id: string, draft: string) => void;
  markOpened: (id: string) => Promise<void>;
  connections: Record<string, ChatConnection>;
  setConnection: (id: string, connection: ChatConnection) => void;
  updateMetadata: (
    id: string,
    metadata: { title?: string; pinned?: boolean; archived?: boolean }
  ) => Promise<void>;
  configurations: Record<string, DurableChatConfiguration>;
  setConfiguration: (scope: string, configuration: DurableChatConfiguration) => Promise<void>;
  chats: ComputerChat[];
  loaded: boolean;
  busy: Record<string, boolean>;
  initialize: () => Promise<void>;
  save: (chat: ComputerChat) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setBusy: (id: string, busy: boolean) => void;
}

let writeQueue: Promise<unknown> = Promise.resolve();
let initialization: Promise<void> | undefined;
let draftTimer: ReturnType<typeof setTimeout> | undefined;

function persist(chats: ComputerChat[]) {
  // Pending work includes its exact argv so retries reuse the same request.
  // Completed tool payloads and screenshots stay in memory only.
  const snapshot = chats.map(({ screenshot: _screenshot, ...chat }) => ({
    ...chat,
    serverState: chat.serverState
      ? {
          ...chat.serverState,
          messages: [],
          events: chat.timeline ? [] : chat.serverState.events,
          screenshot: null,
        }
      : undefined,
    pending:
      chat.pending?.action.name === 'screenshot' && chat.pending.result
        ? { ...chat.pending, result: { ...chat.pending.result, stdout: '' } }
        : chat.pending,
    messages: stripToolPayloads(chat.messages),
  }));
  const write = () => window.electronAPI?.store.set(STORAGE_KEY, snapshot);
  const task = writeQueue.then(write, write);
  writeQueue = task.catch(() => undefined);
  return task;
}

export const useComputerChatsStore = create<ComputerChatsState>((set, get) => ({
  markOpened: async (id) => {
    const chat = get().chats.find((item) => item.id === id);
    if (!chat) return;
    set((state) => ({
      chats: state.chats.map((item) =>
        item.id === id ? { ...item, lastOpenedAt: new Date().toISOString() } : item
      ),
    }));
    await get().flush();
  },
  setDraft: (id, draft) => {
    if (!get().chats.some((chat) => chat.id === id && chat.draft !== draft)) return;
    set((state) => ({
      chats: state.chats.map((chat) => (chat.id === id ? { ...chat, draft } : chat)),
    }));
    // Coalesce keystrokes without postponing the save indefinitely while typing.
    draftTimer ??= setTimeout(
      () =>
        void get()
          .flush()
          .catch(() => undefined),
      350
    );
  },
  flushDrafts: async () => {
    if (draftTimer !== undefined) await get().flush();
  },
  flush: async () => {
    clearTimeout(draftTimer);
    draftTimer = undefined;
    try {
      const result = await persist(get().chats);
      if (result === false) throw new Error('Desktop storage rejected the save');
      set({ persistenceError: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ persistenceError: message });
      throw new ChatPersistenceError(message);
    }
  },
  connections: {},
  setConnection: (id, connection) =>
    set((state) => ({ connections: { ...state.connections, [id]: connection } })),
  updateMetadata: async (id, metadata) => {
    const chat = get().chats.find((value) => value.id === id);
    if (!chat) throw new Error('Chat was removed');
    const title = metadata.title?.trim();
    if (title !== undefined && (!title || title.length > 120))
      throw new Error('Use a chat name between 1 and 120 characters');
    await get().save({
      ...chat,
      ...metadata,
      ...(title !== undefined ? { title, customTitle: true } : {}),
    });
  },
  configurations: {},
  setConfiguration: async (scope, configuration) => {
    const configurations = {
      ...get().configurations,
      [scope]: parseStartConfiguration(configuration),
    };
    await window.electronAPI?.store.set('computerChatPreferences', configurations);
    set({ configurations });
  },
  chats: [],
  loaded: false,
  busy: {},
  initialize: async () => {
    if (get().loaded) return;
    if (initialization) return initialization;
    initialization = (async () => {
      const [stored, preferences] = await Promise.all([
        window.electronAPI?.store.get(STORAGE_KEY),
        window.electronAPI?.store.get('computerChatPreferences'),
      ]);
      const chats = Array.isArray(stored)
        ? stored.flatMap((value) => {
            const parsed = storedChatSchema.safeParse(value);
            return parsed.success ? [parsed.data as unknown as ComputerChat] : [];
          })
        : [];
      const configurations: Record<string, DurableChatConfiguration> = {};
      if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
        for (const [key, value] of Object.entries(preferences)) {
          const parsed = configurationSchema.safeParse(value);
          if (parsed.success) configurations[key] = parsed.data;
        }
      }
      set({ chats, loaded: true, configurations });
    })().finally(() => {
      initialization = undefined;
    });
    return initialization;
  },
  save: async (chat) => {
    const chats = [chat, ...get().chats.filter((item) => item.id !== chat.id)];
    set({ chats });
    await get().flush();
  },
  remove: async (id) => {
    const chats = get().chats.filter((chat) => chat.id !== id);
    set({ chats });
    await get().flush();
  },
  setBusy: (id, busy) => set((state) => ({ busy: { ...state.busy, [id]: busy } })),
}));
