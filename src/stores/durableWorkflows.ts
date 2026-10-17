import { create } from 'zustand';
import type { DurableWorkflowStatus } from '../lib/durableWorkflows';
import {
  isValidCustomAgentProfile,
  isValidDurableAgentProfile,
  type DurableAgentProfile,
} from '../lib/durableAgentProfiles';
import { assertNoInlineSecrets } from '../lib/workflowCommandSecurity';
import { isDurableWorkflowTerminal } from '../lib/durableWorkflowStatus';

const ENGINE_URL_KEY = 'durableWorkflowEngineUrl';
const WORKFLOWS_KEY = 'durableTrackedWorkflows';
const CUSTOM_AGENTS_KEY = 'durableCustomAgentProfiles';
const BLUEPRINTS_KEY = 'durableWorkflowBlueprints';
const SCHEDULES_KEY = 'durableWorkflowSchedules';
const DEFAULT_ENGINE_URL =
  import.meta.env.VITE_DURABLE_ENGINE_URL || 'https://api.workstream.stateset.com';

export interface DurableWorkflowDefinition {
  steps: string[][];
  activeWindowSeconds: number;
  maxFailures: number;
  perCommandTimeoutSeconds: number;
  agent?: DurableAgentProfile;
  stepAgents?: Array<DurableAgentProfile | null>;
}

export interface DurableWorkflowBlueprint {
  id: string;
  name: string;
  goal: string;
  definition: DurableWorkflowDefinition;
  createdAt: string;
  updatedAt: string;
}

export type DurableWorkflowScheduleFrequency = 'once' | 'daily' | 'weekly';

export interface PendingScheduledOccurrence {
  requestId: string;
  dueAt: string;
  engineUrl: string;
  tenantId: string;
  brandId: string;
  goal: string;
  definition: DurableWorkflowDefinition;
  claimedAt: string;
  workflowId: string;
  submitted: boolean;
  needsAttention?: boolean;
}

export interface DurableWorkflowSchedule {
  id: string;
  name: string;
  tenantId: string;
  brandId: string;
  goal: string;
  definition: DurableWorkflowDefinition;
  frequency: DurableWorkflowScheduleFrequency;
  allowOverlap?: boolean;
  nextRunAt: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastWorkflowId?: string;
  lastError?: string;
  pendingOccurrence?: PendingScheduledOccurrence;
}

export interface TrackedDurableWorkflow {
  workflowId: string;
  runId: string;
  requestId: string;
  tenantId: string;
  brandId: string;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  agent?: DurableAgentProfile;
  definition?: DurableWorkflowDefinition;
  details?: DurableWorkflowStatus;
  lastError?: string;
}

interface DurableWorkflowsState {
  initialized: boolean;
  initializationError: string | null;
  engineUrl: string;
  apiKey: string | null;
  connectionRevision: string | null;
  configuring: boolean;
  workflows: TrackedDurableWorkflow[];
  customAgents: DurableAgentProfile[];
  blueprints: DurableWorkflowBlueprint[];
  schedules: DurableWorkflowSchedule[];
  initialize: () => Promise<void>;
  setConfiguration: (engineUrl: string, apiKey?: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  track: (workflow: TrackedDurableWorkflow) => Promise<void>;
  updateStatus: (
    workflowId: string,
    status: DurableWorkflowStatus,
    lastError?: string
  ) => Promise<void>;
  setError: (workflowId: string, message: string) => Promise<void>;
  markStatus: (workflowId: string, status: string) => Promise<void>;
  remove: (workflowId: string) => Promise<void>;
  saveCustomAgent: (profile: DurableAgentProfile) => Promise<void>;
  removeCustomAgent: (profileId: string) => Promise<void>;
  saveBlueprint: (blueprint: DurableWorkflowBlueprint) => Promise<void>;
  saveBlueprints: (blueprints: DurableWorkflowBlueprint[]) => Promise<void>;
  removeBlueprint: (blueprintId: string) => Promise<void>;
  saveSchedule: (schedule: DurableWorkflowSchedule) => Promise<void>;
  updateSchedule: (
    scheduleId: string,
    updater: (current: DurableWorkflowSchedule) => DurableWorkflowSchedule | null
  ) => Promise<boolean>;
  removeSchedule: (scheduleId: string) => Promise<void>;
}

let initializePromise: Promise<void> | null = null;
let configurationGeneration = 0;
let pendingConfigurations = 0;
let configurationQueue: Promise<unknown> = Promise.resolve();
let scheduleWriteQueue: Promise<unknown> = Promise.resolve();
let workflowWriteQueue: Promise<unknown> = Promise.resolve();
let blueprintWriteQueue: Promise<unknown> = Promise.resolve();
const scheduleIntentGenerations = new Map<string, number>();

export function getWorkflowConnectionGeneration(): number {
  return configurationGeneration;
}

export function getScheduleIntentGeneration(scheduleId: string): number {
  return scheduleIntentGenerations.get(scheduleId) ?? 0;
}

function recordScheduleIntent(scheduleId: string) {
  scheduleIntentGenerations.set(scheduleId, getScheduleIntentGeneration(scheduleId) + 1);
}

function writeSchedule<T>(operation: () => Promise<T>): Promise<T> {
  const task = scheduleWriteQueue.then(operation, operation);
  scheduleWriteQueue = task.catch(() => undefined);
  return task;
}

function writeWorkflows(operation: () => Promise<void>): Promise<void> {
  const task = workflowWriteQueue.then(operation, operation);
  workflowWriteQueue = task.catch(() => undefined);
  return task;
}

function writeBlueprints(operation: () => Promise<void>): Promise<void> {
  const task = blueprintWriteQueue.then(operation, operation);
  blueprintWriteQueue = task.catch(() => undefined);
  return task;
}

function writeConfiguration(operation: () => Promise<void>, pending: (value: boolean) => void) {
  configurationGeneration++;
  pendingConfigurations++;
  pending(true);
  const task = configurationQueue.then(operation, operation);
  configurationQueue = task.catch(() => undefined);
  return task.finally(() => pending(--pendingConfigurations > 0));
}

async function nativeConnection() {
  return window.electronAPI?.computerChat?.getConnection?.();
}

async function persist(workflows: TrackedDurableWorkflow[]): Promise<void> {
  if (window.electronAPI?.store) {
    const stored = await window.electronAPI.store.set(WORKFLOWS_KEY, workflows);
    if (stored === false) throw new Error('Workflow tracking could not be saved. Try again.');
  }
}

async function persistSchedules(schedules: DurableWorkflowSchedule[]): Promise<void> {
  if (typeof window.electronAPI?.store?.set !== 'function')
    throw new Error(
      'Desktop storage is unavailable. Reopen the desktop app before scheduling work.'
    );
  const stored = await window.electronAPI.store.set(SCHEDULES_KEY, schedules);
  if (stored === false) throw new Error('Workflow schedules could not be saved. Try again.');
}

async function persistBlueprints(blueprints: DurableWorkflowBlueprint[]): Promise<void> {
  const storage = window.electronAPI?.store;
  if (typeof storage?.set !== 'function')
    throw new Error(
      'Desktop storage is unavailable. Reopen the desktop app before saving blueprints.'
    );
  const stored = await storage.set(BLUEPRINTS_KEY, blueprints);
  if (stored === false) throw new Error('Workflow blueprints could not be saved. Try again.');
}

function isTrackedWorkflow(value: unknown): value is TrackedDurableWorkflow {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.workflowId === 'string' &&
    typeof item.tenantId === 'string' &&
    typeof item.brandId === 'string' &&
    typeof item.goal === 'string'
  );
}

export function isWorkflowDefinition(value: unknown): value is DurableWorkflowDefinition {
  if (!value || typeof value !== 'object') return false;
  const definition = value as Record<string, unknown>;
  const steps = definition.steps;
  const stepAgents = definition.stepAgents;
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.length <= 500 &&
    steps.every(
      (step) =>
        Array.isArray(step) &&
        step.length > 0 &&
        step.every((command) => typeof command === 'string' && command.trim().length > 0)
    ) &&
    typeof definition.activeWindowSeconds === 'number' &&
    definition.activeWindowSeconds >= 300 &&
    definition.activeWindowSeconds <= 86_400 &&
    typeof definition.maxFailures === 'number' &&
    definition.maxFailures >= 1 &&
    definition.maxFailures <= 100 &&
    typeof definition.perCommandTimeoutSeconds === 'number' &&
    definition.perCommandTimeoutSeconds >= 30 &&
    definition.perCommandTimeoutSeconds <= 1_800 &&
    (definition.agent === undefined || isValidDurableAgentProfile(definition.agent)) &&
    (stepAgents === undefined ||
      (Array.isArray(stepAgents) &&
        stepAgents.length === steps.length &&
        stepAgents.every((agent) => agent === null || isValidDurableAgentProfile(agent))))
  );
}

export function isWorkflowBlueprint(value: unknown): value is DurableWorkflowBlueprint {
  if (!value || typeof value !== 'object') return false;
  const blueprint = value as Record<string, unknown>;
  return (
    typeof blueprint.id === 'string' &&
    blueprint.id.startsWith('blueprint-') &&
    typeof blueprint.name === 'string' &&
    blueprint.name.trim().length > 0 &&
    blueprint.name.length <= 80 &&
    typeof blueprint.goal === 'string' &&
    blueprint.goal.trim().length > 0 &&
    isWorkflowDefinition(blueprint.definition) &&
    typeof blueprint.createdAt === 'string' &&
    typeof blueprint.updatedAt === 'string'
  );
}

function snapshotBlueprints(blueprints: DurableWorkflowBlueprint[]): DurableWorkflowBlueprint[] {
  const snapshot: unknown = structuredClone(blueprints);
  if (!Array.isArray(snapshot) || !snapshot.every(isWorkflowBlueprint))
    throw new Error('Workflow blueprint is invalid.');
  const ids = new Set<string>();
  for (const blueprint of snapshot) {
    if (ids.has(blueprint.id)) throw new Error('Blueprint batch contains duplicate IDs.');
    ids.add(blueprint.id);
    assertNoInlineSecrets(blueprint.definition.steps);
  }
  return snapshot;
}

export function isWorkflowSchedule(value: unknown): value is DurableWorkflowSchedule {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Record<string, unknown>;
  return (
    typeof schedule.id === 'string' &&
    schedule.id.startsWith('schedule-') &&
    typeof schedule.name === 'string' &&
    schedule.name.trim().length > 0 &&
    schedule.name.length <= 80 &&
    typeof schedule.tenantId === 'string' &&
    schedule.tenantId.length > 0 &&
    typeof schedule.brandId === 'string' &&
    schedule.brandId.length > 0 &&
    typeof schedule.goal === 'string' &&
    schedule.goal.trim().length > 0 &&
    isWorkflowDefinition(schedule.definition) &&
    (schedule.frequency === 'once' ||
      schedule.frequency === 'daily' ||
      schedule.frequency === 'weekly') &&
    (schedule.allowOverlap === undefined || typeof schedule.allowOverlap === 'boolean') &&
    typeof schedule.nextRunAt === 'string' &&
    Number.isFinite(Date.parse(schedule.nextRunAt)) &&
    typeof schedule.enabled === 'boolean' &&
    typeof schedule.createdAt === 'string' &&
    Number.isFinite(Date.parse(schedule.createdAt)) &&
    typeof schedule.updatedAt === 'string' &&
    Number.isFinite(Date.parse(schedule.updatedAt)) &&
    (schedule.lastRunAt === undefined ||
      (typeof schedule.lastRunAt === 'string' &&
        Number.isFinite(Date.parse(schedule.lastRunAt)))) &&
    (schedule.lastWorkflowId === undefined || typeof schedule.lastWorkflowId === 'string') &&
    (schedule.lastError === undefined || typeof schedule.lastError === 'string') &&
    (schedule.pendingOccurrence === undefined ||
      isPendingScheduledOccurrence(schedule.pendingOccurrence))
  );
}

function isSafeEngineUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' || (local && url.protocol === 'http:'))
    );
  } catch {
    return false;
  }
}

function isPendingScheduledOccurrence(value: unknown): value is PendingScheduledOccurrence {
  if (!value || typeof value !== 'object') return false;
  const occurrence = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    typeof occurrence.requestId !== 'string' ||
    !uuid.test(occurrence.requestId) ||
    occurrence.requestId === '00000000-0000-0000-0000-000000000000' ||
    typeof occurrence.brandId !== 'string' ||
    !uuid.test(occurrence.brandId) ||
    occurrence.brandId === '00000000-0000-0000-0000-000000000000'
  )
    return false;
  const workflowId = `active-horizon-agent-${occurrence.brandId.replace(/-/g, '').toLowerCase()}-${occurrence.requestId.replace(/-/g, '').toLowerCase()}`;
  return (
    typeof occurrence.tenantId === 'string' &&
    occurrence.tenantId.trim().length > 0 &&
    isSafeEngineUrl(occurrence.engineUrl) &&
    occurrence.workflowId === workflowId &&
    typeof occurrence.goal === 'string' &&
    occurrence.goal.trim().length > 0 &&
    isWorkflowDefinition(occurrence.definition) &&
    typeof occurrence.dueAt === 'string' &&
    Number.isFinite(Date.parse(occurrence.dueAt)) &&
    typeof occurrence.claimedAt === 'string' &&
    Number.isFinite(Date.parse(occurrence.claimedAt)) &&
    typeof occurrence.submitted === 'boolean' &&
    (occurrence.needsAttention === undefined || typeof occurrence.needsAttention === 'boolean')
  );
}

export function assertWorkflowSettingsLoaded() {
  if (!useDurableWorkflowsStore.getState().initialized)
    throw new Error(
      'Saved workflow settings are not loaded. Retry loading them before continuing.'
    );
}

export const useDurableWorkflowsStore = create<DurableWorkflowsState>((set, get) => ({
  initialized: false,
  initializationError: null,
  engineUrl: DEFAULT_ENGINE_URL,
  apiKey: null,
  connectionRevision: null,
  configuring: false,
  workflows: [],
  customAgents: [],
  blueprints: [],
  schedules: [],

  initialize: async () => {
    if (get().initialized) return;
    if (initializePromise) return initializePromise;
    const task = (async () => {
      try {
        // A retry must not take a snapshot halfway through an earlier save.
        // Drain every queued native write before capturing its generation.
        while (pendingConfigurations > 0) await configurationQueue;
        const generation = configurationGeneration;
        const [
          storedUrl,
          storedWorkflows,
          storedAgents,
          storedBlueprints,
          storedSchedules,
          apiKey,
          connection,
        ] = await Promise.all([
          window.electronAPI?.store?.get(ENGINE_URL_KEY),
          window.electronAPI?.store?.get(WORKFLOWS_KEY),
          window.electronAPI?.store?.get(CUSTOM_AGENTS_KEY),
          window.electronAPI?.store?.get(BLUEPRINTS_KEY),
          window.electronAPI?.store?.get(SCHEDULES_KEY),
          window.electronAPI?.auth?.getDurableEngineApiKey?.(),
          nativeConnection(),
        ]);
        if (
          Array.isArray(storedSchedules) &&
          storedSchedules.some(
            (schedule) =>
              schedule &&
              typeof schedule === 'object' &&
              'pendingOccurrence' in schedule &&
              schedule.pendingOccurrence !== undefined &&
              !isWorkflowSchedule(schedule)
          )
        )
          throw new Error('A saved pending workflow occurrence could not be verified.');
        set({
          initialized: true,
          initializationError: null,
          ...(generation === configurationGeneration
            ? {
                engineUrl:
                  connection?.engineUrl ??
                  (typeof storedUrl === 'string' && storedUrl.trim()
                    ? storedUrl
                    : DEFAULT_ENGINE_URL),
                apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null,
                connectionRevision: connection?.revision ?? null,
              }
            : {}),
          workflows: Array.isArray(storedWorkflows)
            ? storedWorkflows.filter(isTrackedWorkflow)
            : [],
          customAgents: Array.isArray(storedAgents)
            ? storedAgents.filter(isValidCustomAgentProfile)
            : [],
          blueprints: Array.isArray(storedBlueprints)
            ? storedBlueprints.filter(isWorkflowBlueprint)
            : [],
          schedules: Array.isArray(storedSchedules)
            ? storedSchedules.filter(isWorkflowSchedule)
            : [],
        });
      } catch {
        // Failed hydration is not an empty/default configuration. Keep its
        // collections and connection untrusted until a complete retry succeeds.
        set({
          initialized: false,
          initializationError: 'Saved workflow settings could not be loaded. Retry to reconnect.',
        });
      }
    })();
    // Clean up after assignment even if a local bridge getter threw before
    // the task reached its first await.
    initializePromise = task;
    try {
      await task;
    } finally {
      initializePromise = null;
    }
  },

  setConfiguration: async (engineUrl, apiKey) => {
    const normalizedUrl = engineUrl.trim().replace(/\/+$/, '');
    if (!normalizedUrl) throw new Error('Engine URL is required.');
    const parsed = new URL(normalizedUrl);
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash)
      throw new Error(
        'Use a workflow engine URL without credentials, query parameters or fragments.'
      );
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
      throw new Error('Use HTTPS for remote workflow engines.');
    }
    await writeConfiguration(
      async () => {
        try {
          const stored = await window.electronAPI?.store?.set(ENGINE_URL_KEY, normalizedUrl);
          if (stored === false) throw new Error('The workflow connection could not be saved.');
          if (apiKey?.trim()) {
            const storedKey = await window.electronAPI?.auth?.setDurableEngineApiKey?.(
              apiKey.trim()
            );
            if (storedKey === false) throw new Error('The workflow credential could not be saved.');
          }
          const connection = await nativeConnection();
          const actualKey = connection
            ? await window.electronAPI!.auth.getDurableEngineApiKey()
            : undefined;
          set((state) => ({
            engineUrl: connection?.engineUrl ?? normalizedUrl,
            apiKey: connection ? actualKey?.trim() || null : apiKey?.trim() || state.apiKey,
            connectionRevision: connection?.revision ?? null,
          }));
        } catch (error) {
          // A URL write can succeed before saving the credential fails. Reflect
          // the actual native connection, and never retain an old revision.
          set({ connectionRevision: null });
          try {
            const connection = await nativeConnection();
            if (connection) {
              const actualKey = await window.electronAPI!.auth.getDurableEngineApiKey();
              set({
                engineUrl: connection.engineUrl,
                connectionRevision: connection.revision,
                apiKey: actualKey?.trim() || null,
              });
            }
          } catch {
            /* The failed connection remains untrusted until checked again. */
          }
          throw error;
        }
      },
      (configuring) => set({ configuring })
    );
  },

  clearApiKey: async () => {
    await writeConfiguration(
      async () => {
        await window.electronAPI?.auth?.clearDurableEngineApiKey?.();
        set({ apiKey: null, connectionRevision: null });
        const connection = await nativeConnection();
        if (connection)
          set({ engineUrl: connection.engineUrl, connectionRevision: connection.revision });
      },
      (configuring) => set({ configuring })
    );
  },

  track: async (workflow) => {
    assertWorkflowSettingsLoaded();
    await writeWorkflows(async () => {
      assertWorkflowSettingsLoaded();
      const existing = get().workflows.find((item) => item.workflowId === workflow.workflowId);
      const tracked = existing && isDurableWorkflowTerminal(existing.status) ? existing : workflow;
      const workflows = [
        tracked,
        ...get().workflows.filter((item) => item.workflowId !== workflow.workflowId),
      ];
      await persist(workflows);
      set({ workflows });
    });
  },

  updateStatus: async (workflowId, details, lastError) => {
    assertWorkflowSettingsLoaded();
    await writeWorkflows(async () => {
      assertWorkflowSettingsLoaded();
      const workflows = get().workflows.map((workflow) =>
        workflow.workflowId === workflowId
          ? isDurableWorkflowTerminal(workflow.status) && !isDurableWorkflowTerminal(details.status)
            ? workflow
            : {
                ...workflow,
                status: details.status,
                details,
                updatedAt: new Date().toISOString(),
                lastError,
              }
          : workflow
      );
      await persist(workflows);
      set({ workflows });
    });
  },

  markStatus: async (workflowId, status) => {
    assertWorkflowSettingsLoaded();
    await writeWorkflows(async () => {
      assertWorkflowSettingsLoaded();
      const workflows = get().workflows.map((workflow) =>
        workflow.workflowId === workflowId
          ? {
              ...workflow,
              status,
              details: workflow.details
                ? {
                    ...workflow.details,
                    status,
                    current_task_id: null,
                    cancelled: status === 'cancelled' || workflow.details.cancelled,
                  }
                : undefined,
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            }
          : workflow
      );
      await persist(workflows);
      set({ workflows });
    });
  },

  setError: async (workflowId, message) => {
    assertWorkflowSettingsLoaded();
    await writeWorkflows(async () => {
      assertWorkflowSettingsLoaded();
      const workflows = get().workflows.map((workflow) =>
        workflow.workflowId === workflowId
          ? { ...workflow, lastError: message, updatedAt: new Date().toISOString() }
          : workflow
      );
      await persist(workflows);
      set({ workflows });
    });
  },

  remove: async (workflowId) => {
    assertWorkflowSettingsLoaded();
    await writeWorkflows(async () => {
      assertWorkflowSettingsLoaded();
      const workflows = get().workflows.filter((workflow) => workflow.workflowId !== workflowId);
      await persist(workflows);
      set({ workflows });
    });
  },

  saveCustomAgent: async (profile) => {
    assertWorkflowSettingsLoaded();
    if (!isValidCustomAgentProfile(profile)) throw new Error('Agent profile is invalid.');
    const customAgents = [
      profile,
      ...get().customAgents.filter((agent) => agent.id !== profile.id),
    ];
    await window.electronAPI?.store?.set(CUSTOM_AGENTS_KEY, customAgents);
    set({ customAgents });
  },

  removeCustomAgent: async (profileId) => {
    assertWorkflowSettingsLoaded();
    const customAgents = get().customAgents.filter((agent) => agent.id !== profileId);
    await window.electronAPI?.store?.set(CUSTOM_AGENTS_KEY, customAgents);
    set({ customAgents });
  },

  saveBlueprint: async (blueprint) => {
    await get().saveBlueprints([blueprint]);
  },

  saveBlueprints: async (blueprints) => {
    assertWorkflowSettingsLoaded();
    const snapshot = snapshotBlueprints(blueprints);
    if (!snapshot.length) return;
    const ids = new Set(snapshot.map((blueprint) => blueprint.id));
    await writeBlueprints(async () => {
      assertWorkflowSettingsLoaded();
      const next = [...snapshot, ...get().blueprints.filter((blueprint) => !ids.has(blueprint.id))];
      await persistBlueprints(next);
      set({ blueprints: next });
    });
  },

  removeBlueprint: async (blueprintId) => {
    assertWorkflowSettingsLoaded();
    await writeBlueprints(async () => {
      assertWorkflowSettingsLoaded();
      const blueprints = get().blueprints.filter((item) => item.id !== blueprintId);
      await persistBlueprints(blueprints);
      set({ blueprints });
    });
  },

  saveSchedule: async (schedule) => {
    assertWorkflowSettingsLoaded();
    const base = get().schedules.find((item) => item.id === schedule.id);
    // An internal acknowledgement can advance the occurrence while this user
    // write waits. Apply only the fields the user changed from the visible base.
    const userFields = [
      'name',
      'tenantId',
      'brandId',
      'goal',
      'definition',
      'frequency',
      'allowOverlap',
      'nextRunAt',
      'enabled',
      'updatedAt',
      'lastError',
    ] as const;
    const changes = Object.fromEntries(
      userFields
        .filter((field) => JSON.stringify(base?.[field]) !== JSON.stringify(schedule[field]))
        .map((field) => [field, schedule[field]])
    ) as Partial<DurableWorkflowSchedule>;
    recordScheduleIntent(schedule.id);
    await writeSchedule(async () => {
      assertWorkflowSettingsLoaded();
      const current = get().schedules.find((item) => item.id === schedule.id);
      if (base && !current)
        throw new Error('This workflow schedule was removed. Reload schedules before editing it.');
      const next = {
        ...(current ?? schedule),
        ...changes,
        ...(current
          ? { lastRunAt: current.lastRunAt, lastWorkflowId: current.lastWorkflowId }
          : {}),
        pendingOccurrence: current
          ? current.pendingOccurrence?.submitted
            ? current.pendingOccurrence
            : undefined
          : schedule.pendingOccurrence,
      };
      if (!isWorkflowSchedule(next)) throw new Error('Workflow schedule is invalid.');
      assertNoInlineSecrets(next.definition.steps);
      if (next.pendingOccurrence) assertNoInlineSecrets(next.pendingOccurrence.definition.steps);
      const schedules = [next, ...get().schedules.filter((item) => item.id !== schedule.id)];
      await persistSchedules(schedules);
      set({ schedules });
    });
  },

  updateSchedule: async (scheduleId, updater) => {
    assertWorkflowSettingsLoaded();
    return writeSchedule(async () => {
      assertWorkflowSettingsLoaded();
      const current = get().schedules.find((item) => item.id === scheduleId);
      if (!current) return false;
      const next = updater(current);
      if (!next) return false;
      if (next.id !== scheduleId || !isWorkflowSchedule(next))
        throw new Error('Workflow schedule is invalid.');
      assertNoInlineSecrets(next.definition.steps);
      if (next.pendingOccurrence) assertNoInlineSecrets(next.pendingOccurrence.definition.steps);
      const schedules = get().schedules.map((item) => (item.id === scheduleId ? next : item));
      await persistSchedules(schedules);
      set({ schedules });
      return true;
    });
  },

  removeSchedule: async (scheduleId) => {
    assertWorkflowSettingsLoaded();
    recordScheduleIntent(scheduleId);
    await writeSchedule(async () => {
      assertWorkflowSettingsLoaded();
      const current = get().schedules.find((item) => item.id === scheduleId);
      if (current?.pendingOccurrence?.submitted)
        throw new Error(
          'This schedule has an unconfirmed launch. Check the pending run before deleting the schedule.'
        );
      const schedules = get().schedules.filter((item) => item.id !== scheduleId);
      await persistSchedules(schedules);
      set({ schedules });
    });
  },
}));
