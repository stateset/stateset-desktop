/// <reference types="vite/client" />

import type { Tenant, Brand } from './types';

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SANDBOX_API_URL?: string;
  readonly VITE_ALLOW_STREAM_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron API types
interface ElectronAPI {
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
    }>;
    installUpdate: () => Promise<boolean>;
    getUpdateStatus: () => Promise<{ checking: boolean }>;
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

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    __E2E_AUTH__?: { tenant: Tenant; brands: Brand[] };
  }
}

export {};
