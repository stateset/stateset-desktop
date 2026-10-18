/// <reference types="vite/client" />

import type { Tenant, Brand } from './types';

// Electron API types
export type McpProbeResult =
  | {
      ok: true;
      serverName: string;
      serverVersion: string;
      protocolVersion: string;
      toolCount: number;
      tools: string[];
    }
  | { ok: false; error: string; status?: number; unreachable?: boolean };

interface ElectronAPI {
  durableWorkflows?: {
    request: (
      request: import('../electron/durable-workflow-bridge').DurableWorkflowRequest
    ) => Promise<import('../electron/durable-workflow-bridge').DurableWorkflowResponse>;
    stream: (
      request: import('../electron/durable-workflow-bridge').DurableWorkflowStreamRequest,
      onEvent: (event: import('../electron/durable-workflow-bridge').DurableWorkflowEvent) => void
    ) => Promise<void>;
    cancel: (id: string) => Promise<boolean>;
  };
  computerChat?: {
    getConnection: () => Promise<{ engineUrl: string; revision: string }>;
    request: (request: {
      engineUrl: string;
      revision: string;
      path: string;
      method: 'GET' | 'POST';
      tenantId: string;
      body?: unknown;
    }) => Promise<{ ok: boolean; status: number; body: unknown }>;
    saveArtifact: (request: {
      filename: string;
      contentBase64: string;
      sha256: string;
    }) => Promise<boolean>;
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
  };
  oauth: {
    shopify: {
      start: (shop: string) => Promise<unknown>;
      onSuccess: (callback: (result: unknown) => void) => () => void;
      onError: (callback: (error: unknown) => void) => () => void;
    };
    gorgias: {
      start: (domain: string) => Promise<unknown>;
      onSuccess: (callback: (result: unknown) => void) => () => void;
      onError: (callback: (error: unknown) => void) => () => void;
    };
    zendesk: {
      start: (subdomain: string) => Promise<unknown>;
      onSuccess: (callback: (result: unknown) => void) => () => void;
      onError: (callback: (error: unknown) => void) => () => void;
    };
  };
  auth: {
    setApiKey: (apiKey: string) => Promise<boolean>;
    getApiKey: () => Promise<string | undefined>;
    clearApiKey: () => Promise<boolean>;
    isSecureStorageAvailable: () => Promise<boolean>;
    // Sandbox API key operations
    setSandboxApiKey: (apiKey: string) => Promise<boolean>;
    getSandboxApiKey: () => Promise<string | undefined>;
    clearSandboxApiKey: () => Promise<boolean>;
    setDurableEngineApiKey: (apiKey: string) => Promise<boolean>;
    getDurableEngineApiKey: () => Promise<string | undefined>;
    clearDurableEngineApiKey: () => Promise<boolean>;
  };
  mcp: {
    probe: (request: { endpoint: string; authToken?: string }) => Promise<McpProbeResult>;
  };
  secrets: {
    getLocal: () => Promise<string | undefined>;
    setLocal: (payload: string) => Promise<boolean>;
    clearLocal: () => Promise<boolean>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    checkForUpdates: () => Promise<{
      available: boolean;
      version?: string;
      error?: string;
      message?: string;
      snapshot: UpdateStatusSnapshot;
    }>;
    installUpdate: () => Promise<boolean>;
    getUpdateStatus: () => Promise<UpdateStatusSnapshot>;
    isE2ETest: boolean;
    onUpdateChecking: (callback: () => void) => () => void;
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateNotAvailable: (callback: () => void) => () => void;
    onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void;
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateError: (callback: (error: string) => void) => () => void;
  };
  background: {
    setMinimizeToTray: (enabled: boolean) => Promise<boolean>;
    getMinimizeToTray: () => Promise<boolean>;
    updateAgentStatus: (status: { running: number; total: number }) => Promise<boolean>;
  };
  notifications: {
    show: (options: { title: string; body: string }) => Promise<boolean>;
  };
}

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

interface UpdateStatusSnapshot {
  status:
    'idle' | 'current' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'disabled';
  checking: boolean;
  available: boolean;
  progress: number;
  version?: string;
  error?: string;
  message?: string;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_SANDBOX_API_URL?: string;
    readonly VITE_DURABLE_ENGINE_URL?: string;
    readonly VITE_POLICY_API_URL?: string;
    readonly VITE_ALLOW_STREAM_API_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    electronAPI?: ElectronAPI;
    __E2E_AUTH__?: { tenant: Tenant; brands: Brand[] };
  }
}

export {};
