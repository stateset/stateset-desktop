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
  engineUrl: string;
  apiKey: string | null;
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
  removeBlueprint: (blueprintId: string) => Promise<void>;
  saveSchedule: (schedule: DurableWorkflowSchedule) => Promise<void>;
  removeSchedule: (scheduleId: string) => Promise<void>;
}

let initializePromise: Promise<void> | null = null;

async function persist(workflows: TrackedDurableWorkflow[]): Promise<void> {
  if (window.electronAPI?.store) {
    await window.electronAPI.store.set(WORKFLOWS_KEY, workflows);
  }
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
    (schedule.lastError === undefined || typeof schedule.lastError === 'string')
  );
}

export const useDurableWorkflowsStore = create<DurableWorkflowsState>((set, get) => ({
  initialized: false,
  engineUrl: DEFAULT_ENGINE_URL,
  apiKey: null,
  workflows: [],
  customAgents: [],
  blueprints: [],
  schedules: [],

  initialize: async () => {
    if (get().initialized) return;
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      try {
        const [
          storedUrl,
          storedWorkflows,
          storedAgents,
          storedBlueprints,
          storedSchedules,
          apiKey,
        ] = await Promise.all([
          window.electronAPI?.store?.get(ENGINE_URL_KEY),
          window.electronAPI?.store?.get(WORKFLOWS_KEY),
          window.electronAPI?.store?.get(CUSTOM_AGENTS_KEY),
          window.electronAPI?.store?.get(BLUEPRINTS_KEY),
          window.electronAPI?.store?.get(SCHEDULES_KEY),
          window.electronAPI?.auth?.getDurableEngineApiKey?.(),
        ]);
        set({
          initialized: true,
          engineUrl:
            typeof storedUrl === 'string' && storedUrl.trim() ? storedUrl : DEFAULT_ENGINE_URL,
          apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null,
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
        set({ initialized: true });
      } finally {
        initializePromise = null;
      }
    })();
    return initializePromise;
  },

  setConfiguration: async (engineUrl, apiKey) => {
    const normalizedUrl = engineUrl.trim().replace(/\/+$/, '');
    if (!normalizedUrl) throw new Error('Engine URL is required.');
    const parsed = new URL(normalizedUrl);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
      throw new Error('Use HTTPS for remote workflow engines.');
    }
    await window.electronAPI?.store?.set(ENGINE_URL_KEY, normalizedUrl);
    if (apiKey?.trim()) {
      await window.electronAPI?.auth?.setDurableEngineApiKey?.(apiKey.trim());
    }
    set((state) => ({
      engineUrl: normalizedUrl,
      apiKey: apiKey?.trim() || state.apiKey,
    }));
  },

  clearApiKey: async () => {
    await window.electronAPI?.auth?.clearDurableEngineApiKey?.();
    set({ apiKey: null });
  },

  track: async (workflow) => {
    const workflows = [
      workflow,
      ...get().workflows.filter((w) => w.workflowId !== workflow.workflowId),
    ];
    set({ workflows });
    await persist(workflows);
  },

  updateStatus: async (workflowId, details, lastError) => {
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
    set({ workflows });
    await persist(workflows);
  },

  markStatus: async (workflowId, status) => {
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
    set({ workflows });
    await persist(workflows);
  },

  setError: async (workflowId, message) => {
    const workflows = get().workflows.map((workflow) =>
      workflow.workflowId === workflowId
        ? { ...workflow, lastError: message, updatedAt: new Date().toISOString() }
        : workflow
    );
    set({ workflows });
    await persist(workflows);
  },

  remove: async (workflowId) => {
    const workflows = get().workflows.filter((workflow) => workflow.workflowId !== workflowId);
    set({ workflows });
    await persist(workflows);
  },

  saveCustomAgent: async (profile) => {
    if (!isValidCustomAgentProfile(profile)) throw new Error('Agent profile is invalid.');
    const customAgents = [
      profile,
      ...get().customAgents.filter((agent) => agent.id !== profile.id),
    ];
    await window.electronAPI?.store?.set(CUSTOM_AGENTS_KEY, customAgents);
    set({ customAgents });
  },

  removeCustomAgent: async (profileId) => {
    const customAgents = get().customAgents.filter((agent) => agent.id !== profileId);
    await window.electronAPI?.store?.set(CUSTOM_AGENTS_KEY, customAgents);
    set({ customAgents });
  },

  saveBlueprint: async (blueprint) => {
    if (!isWorkflowBlueprint(blueprint)) throw new Error('Workflow blueprint is invalid.');
    assertNoInlineSecrets(blueprint.definition.steps);
    const blueprints = [blueprint, ...get().blueprints.filter((item) => item.id !== blueprint.id)];
    await window.electronAPI?.store?.set(BLUEPRINTS_KEY, blueprints);
    set({ blueprints });
  },

  removeBlueprint: async (blueprintId) => {
    const blueprints = get().blueprints.filter((item) => item.id !== blueprintId);
    await window.electronAPI?.store?.set(BLUEPRINTS_KEY, blueprints);
    set({ blueprints });
  },

  saveSchedule: async (schedule) => {
    if (!isWorkflowSchedule(schedule)) throw new Error('Workflow schedule is invalid.');
    assertNoInlineSecrets(schedule.definition.steps);
    const schedules = [schedule, ...get().schedules.filter((item) => item.id !== schedule.id)];
    await window.electronAPI?.store?.set(SCHEDULES_KEY, schedules);
    set({ schedules });
  },

  removeSchedule: async (scheduleId) => {
    const schedules = get().schedules.filter((item) => item.id !== scheduleId);
    await window.electronAPI?.store?.set(SCHEDULES_KEY, schedules);
    set({ schedules });
  },
}));
