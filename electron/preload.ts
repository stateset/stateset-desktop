import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Store operations
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },

  // OAuth operations
  oauth: {
    shopify: {
      start: (shop: string) => ipcRenderer.invoke('oauth:shopify:start', shop),
      onSuccess: (callback: (result: unknown) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
        ipcRenderer.on('oauth:shopify:success', listener);
        return () => ipcRenderer.removeListener('oauth:shopify:success', listener);
      },
      onError: (callback: (error: unknown) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, error: unknown) => callback(error);
        ipcRenderer.on('oauth:shopify:error', listener);
        return () => ipcRenderer.removeListener('oauth:shopify:error', listener);
      },
    },
    gorgias: {
      start: (domain: string) => ipcRenderer.invoke('oauth:gorgias:start', domain),
      onSuccess: (callback: (result: unknown) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
        ipcRenderer.on('oauth:gorgias:success', listener);
        return () => ipcRenderer.removeListener('oauth:gorgias:success', listener);
      },
      onError: (callback: (error: unknown) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, error: unknown) => callback(error);
        ipcRenderer.on('oauth:gorgias:error', listener);
        return () => ipcRenderer.removeListener('oauth:gorgias:error', listener);
      },
    },
    zendesk: {
      start: (subdomain: string) => ipcRenderer.invoke('oauth:zendesk:start', subdomain),
      onSuccess: (callback: (result: unknown) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
        ipcRenderer.on('oauth:zendesk:success', listener);
        return () => ipcRenderer.removeListener('oauth:zendesk:success', listener);
      },
      onError: (callback: (error: unknown) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, error: unknown) => callback(error);
        ipcRenderer.on('oauth:zendesk:error', listener);
        return () => ipcRenderer.removeListener('oauth:zendesk:error', listener);
      },
    },
  },

  // Auth operations
  auth: {
    setApiKey: (apiKey: string) => ipcRenderer.invoke('auth:setApiKey', apiKey),
    getApiKey: () => ipcRenderer.invoke('auth:getApiKey'),
    clearApiKey: () => ipcRenderer.invoke('auth:clearApiKey'),
    isSecureStorageAvailable: () => ipcRenderer.invoke('auth:isSecureStorageAvailable'),
    // Sandbox API key operations
    setSandboxApiKey: (apiKey: string) => ipcRenderer.invoke('auth:setSandboxApiKey', apiKey),
    getSandboxApiKey: () => ipcRenderer.invoke('auth:getSandboxApiKey'),
    clearSandboxApiKey: () => ipcRenderer.invoke('auth:clearSandboxApiKey'),
  },

  secrets: {
    getLocal: () => ipcRenderer.invoke('secrets:getLocal'),
    setLocal: (payload: string) => ipcRenderer.invoke('secrets:setLocal', payload),
    clearLocal: () => ipcRenderer.invoke('secrets:clearLocal'),
  },

  // Window operations
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // App info & updates
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    getUpdateStatus: () => ipcRenderer.invoke('app:getUpdateStatus'),
    isE2ETest: process.env.E2E_TEST === 'true' || process.env.PLAYWRIGHT_TEST === 'true',
    // Update event listeners
    onUpdateChecking: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('updater:checking', listener);
      return () => ipcRenderer.removeListener('updater:checking', listener);
    },
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:available', listener);
      return () => ipcRenderer.removeListener('updater:available', listener);
    },
    onUpdateNotAvailable: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('updater:not-available', listener);
      return () => ipcRenderer.removeListener('updater:not-available', listener);
    },
    onUpdateProgress: (callback: (progress: UpdateProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: UpdateProgress) =>
        callback(progress);
      ipcRenderer.on('updater:progress', listener);
      return () => ipcRenderer.removeListener('updater:progress', listener);
    },
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:downloaded', listener);
      return () => ipcRenderer.removeListener('updater:downloaded', listener);
    },
    onUpdateError: (callback: (error: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on('updater:error', listener);
      return () => ipcRenderer.removeListener('updater:error', listener);
    },
  },

  // Background mode operations
  background: {
    setMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke('app:setMinimizeToTray', enabled),
    getMinimizeToTray: () => ipcRenderer.invoke('app:getMinimizeToTray'),
    updateAgentStatus: (status: { running: number; total: number }) =>
      ipcRenderer.invoke('app:updateAgentStatus', status),
  },

  // Notifications
  notifications: {
    show: (options: { title: string; body: string }) =>
      ipcRenderer.invoke('app:showNotification', options),
  },
});

// Type definitions
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

// Type definitions for the exposed API
export interface ElectronAPI {
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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
