/**
 * Structured Telemetry System
 *
 * Collects anonymized usage data to improve product experience.
 * All telemetry is opt-in and respects user privacy.
 */

import { log } from './logger';

const telemetryLogger = log.child('Telemetry');

type TelemetryEvent =
  | 'app.started'
  | 'app.failed'
  | 'agent.created'
  | 'agent.started'
  | 'agent.stopped'
  | 'agent.failed'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.config.updated'
  | 'platform.connected'
  | 'platform.disconnected'
  | 'session.started'
  | 'session.ended'
  | 'feature.used'
  | 'error.encountered'
  | 'settings.changed';

interface TelemetryProperties {
  [key: string]: string | number | boolean | null | undefined | TelemetryProperties;
}

interface TelemetryEventPayload {
  event: TelemetryEvent;
  properties: TelemetryProperties;
  timestamp: number;
  sessionId: string;
  userId?: string;
  version?: string;
}

interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  batchSize: number;
  flushInterval: number;
}

const TELEMETRY_ENABLED_KEY = 'telemetryEnabled';
const TELEMETRY_USER_ID_KEY = 'telemetryUserId';
let inMemoryTelemetryEnabled: boolean | null = null;
let inMemoryTelemetryUserId: string | null = null;
let sessionConsent: boolean | null = null;
let consentWrites: Promise<void> = Promise.resolve();
type NativePreferenceStore = NonNullable<Window['electronAPI']>['store'];

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// Check if telemetry is enabled
const shouldCollectTelemetry = (): boolean => {
  // Don't collect in development unless explicitly enabled
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_ENABLE_TELEMETRY === 'true';
  }

  // Don't collect in tests
  if (import.meta.env.MODE === 'test') {
    return false;
  }

  // Opt-in only in production
  return false;
};

async function readTelemetryPreference(): Promise<boolean | null> {
  try {
    if (window.electronAPI?.store?.get) {
      const value = await window.electronAPI.store.get(TELEMETRY_ENABLED_KEY);
      return typeof value === 'boolean' ? value : null;
    }
  } catch {
    // Ignore storage errors
  }

  if (typeof window === 'undefined') {
    return inMemoryTelemetryEnabled;
  }

  try {
    const sessionStorage = getSessionStorage();
    const sessionRaw = sessionStorage?.getItem(TELEMETRY_ENABLED_KEY);
    if (sessionRaw === 'true') return true;
    if (sessionRaw === 'false') return false;

    const localStorage = getLocalStorage();
    const localRaw = localStorage?.getItem(TELEMETRY_ENABLED_KEY);
    if (localRaw === 'true') {
      if (sessionStorage) {
        try {
          sessionStorage.setItem(TELEMETRY_ENABLED_KEY, localRaw);
          localStorage?.removeItem(TELEMETRY_ENABLED_KEY);
        } catch {
          // Ignore migration failures and keep local storage as source-of-truth.
        }
      }
      inMemoryTelemetryEnabled = true;
      return true;
    }
    if (localRaw === 'false') {
      if (sessionStorage) {
        try {
          sessionStorage.setItem(TELEMETRY_ENABLED_KEY, localRaw);
          localStorage?.removeItem(TELEMETRY_ENABLED_KEY);
        } catch {
          // Ignore migration failures and keep local storage as source-of-truth.
        }
      }
      inMemoryTelemetryEnabled = false;
      return false;
    }
  } catch {
    // Ignore storage errors
  }

  if (inMemoryTelemetryEnabled !== null) {
    return inMemoryTelemetryEnabled;
  }

  return null;
}

async function persistTelemetryPreference(
  enabled: boolean,
  store?: NativePreferenceStore,
  strict = false
): Promise<void> {
  try {
    if (store?.set) {
      const acknowledged = await store.set(TELEMETRY_ENABLED_KEY, enabled);
      if (acknowledged !== true) throw new Error('Preference write was not acknowledged');
      return;
    }
  } catch (error) {
    if (strict) throw error;
  }

  if (typeof window !== 'undefined') {
    const sessionStorage = getSessionStorage();
    const localStorage = getLocalStorage();
    if (sessionStorage) {
      try {
        sessionStorage.setItem(TELEMETRY_ENABLED_KEY, String(enabled));
        localStorage?.removeItem(TELEMETRY_ENABLED_KEY);
        return;
      } catch {
        // Ignore storage errors
      }
    }
    try {
      if (localStorage) {
        localStorage.setItem(TELEMETRY_ENABLED_KEY, String(enabled));
        return;
      }
    } catch {
      // Strict settings saves report storage failure to the caller.
    }
  }
  if (strict) throw new Error('Preference storage is unavailable');
}

function queueTelemetryPreference(enabled: boolean, strict = false): Promise<void> {
  inMemoryTelemetryEnabled = enabled;
  let store: NativePreferenceStore | undefined;
  try {
    store = typeof window === 'undefined' ? undefined : window.electronAPI?.store;
  } catch {
    /* Storage may be unavailable. */
  }
  const write = consentWrites.then(() => persistTelemetryPreference(enabled, store, strict));
  consentWrites = write.catch(() => {});
  return write;
}

/** Native consent writes share ordering with the collector's compatibility API. */
export function saveTelemetryConsent(enabled: boolean): Promise<void> {
  return queueTelemetryPreference(enabled, true);
}

class TelemetryCollector {
  private enabled: boolean;
  private hasExplicitEnabled: boolean;
  private sessionId: string;
  private userId: string | null = null;
  private version: string | null = null;
  private events: TelemetryEventPayload[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private config: TelemetryConfig;
  private consentVersion = 0;
  private activeFlush: {
    version: number;
    controller: AbortController;
    promise?: Promise<void>;
  } | null = null;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.hasExplicitEnabled = typeof config.enabled === 'boolean';
    this.enabled =
      sessionConsent === false
        ? false
        : this.hasExplicitEnabled
          ? Boolean(config.enabled)
          : (sessionConsent ?? shouldCollectTelemetry());
    this.sessionId = this.generateSessionId();
    this.config = {
      enabled: this.enabled,
      batchSize: config.batchSize || 50,
      flushInterval: config.flushInterval || 60000, // 1 minute
      ...config,
    };

    if (this.enabled) {
      this.startFlushTimer();
      this.collectVersion();
      this.collectUserId();
    }

    if (!this.hasExplicitEnabled && sessionConsent === null) {
      void this.syncEnabledFromStorage();
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private async collectVersion(): Promise<void> {
    try {
      if (window.electronAPI?.app?.getVersion) {
        const version = this.consentVersion;
        const value = await window.electronAPI.app.getVersion();
        if (this.enabled && version === this.consentVersion) this.version = value as string;
      }
    } catch {
      // Ignore errors
    }
  }

  private async collectUserId(): Promise<void> {
    if (this.userId || !this.enabled) return;
    const version = this.consentVersion;
    const current = () => this.enabled && version === this.consentVersion;
    try {
      if (window.electronAPI?.store?.get) {
        const userId = await window.electronAPI.store.get(TELEMETRY_USER_ID_KEY);
        if (!current()) return;
        if (!userId) {
          const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          this.userId = newUserId;
          inMemoryTelemetryUserId = newUserId;
          await window.electronAPI.store.set(TELEMETRY_USER_ID_KEY, newUserId);
        } else {
          this.userId = userId as string;
          inMemoryTelemetryUserId = this.userId;
        }
        return;
      }
    } catch {
      // Ignore errors
    }

    if (!current()) return;
    if (inMemoryTelemetryUserId) {
      this.userId = inMemoryTelemetryUserId;
      return;
    }

    if (typeof window === 'undefined') return;
    const sessionStorage = getSessionStorage();
    const localStorage = getLocalStorage();

    try {
      const sessionRaw = sessionStorage?.getItem(TELEMETRY_USER_ID_KEY);
      if (sessionRaw) {
        this.userId = sessionRaw;
        inMemoryTelemetryUserId = sessionRaw;
        return;
      }

      const localRaw = localStorage?.getItem(TELEMETRY_USER_ID_KEY);
      if (localRaw) {
        this.userId = localRaw;
        inMemoryTelemetryUserId = localRaw;
        if (sessionStorage) {
          try {
            sessionStorage.setItem(TELEMETRY_USER_ID_KEY, localRaw);
            localStorage?.removeItem(TELEMETRY_USER_ID_KEY);
          } catch {
            // Ignore migration failures and keep local storage as source-of-truth.
          }
        }
        return;
      }
    } catch {
      // Ignore storage errors
    }

    const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.userId = newUserId;
    inMemoryTelemetryUserId = newUserId;
    try {
      if (sessionStorage) {
        sessionStorage.setItem(TELEMETRY_USER_ID_KEY, newUserId);
        return;
      }
      localStorage?.setItem(TELEMETRY_USER_ID_KEY, newUserId);
    } catch {
      // Ignore storage errors
    }
  }

  private async syncEnabledFromStorage(): Promise<void> {
    const version = this.consentVersion;
    const preference = await readTelemetryPreference();
    if (preference === null || version !== this.consentVersion) return;
    this.restoreConsent(preference);
  }

  /** Apply persisted consent without rewriting it or replacing an explicit session choice. */
  restoreConsent(enabled: boolean): boolean {
    // An observed stored revocation holds collection off until a fresh explicit opt-in.
    if (!enabled) sessionConsent = false;
    const effective = sessionConsent === false ? false : enabled;
    this.applyConsent(effective);
    return effective;
  }

  private applyConsent(enabled: boolean): void {
    if (enabled && this.enabled) return;
    this.consentVersion++;
    this.enabled = enabled;
    if (enabled) {
      this.startFlushTimer();
      void this.collectVersion();
      void this.collectUserId();
    } else {
      this.stopFlushTimer();
      this.events = [];
      this.activeFlush?.controller.abort();
      this.activeFlush = null;
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Track a telemetry event
   */
  track(event: TelemetryEvent, properties: TelemetryProperties = {}): void {
    if (!this.enabled) {
      return;
    }

    const payload: TelemetryEventPayload = {
      event,
      properties: this.sanitizeProperties(properties),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId || undefined,
      version: this.version || undefined,
    };

    this.events.push(payload);

    // Flush immediately if batch size reached
    if (this.events.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  /**
   * Sanitize properties to remove sensitive data
   */
  private sanitizeProperties(properties: TelemetryProperties): TelemetryProperties {
    // NOTE: these are matched against a lowercased key, so they must be lowercase
    // themselves — otherwise the match silently never fires (e.g. 'apiKey' vs 'apikey').
    const sensitiveKeys = [
      'apikey',
      'token',
      'password',
      'secret',
      'credential',
      'auth',
      'email',
      'phone',
      'address',
      'name',
    ];

    const sanitized: TelemetryProperties = {};

    for (const [key, value] of Object.entries(properties)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeProperties(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Flush events to the endpoint
   */
  private async flush(): Promise<void> {
    if (!this.enabled || this.events.length === 0 || this.activeFlush) return;
    const events = this.events;
    this.events = [];
    const operation = {
      version: this.consentVersion,
      controller: new AbortController(),
      promise: undefined as Promise<void> | undefined,
    };
    this.activeFlush = operation;
    try {
      operation.promise = this.sendEvents(events, operation.controller.signal);
      await operation.promise;
    } catch {
      // A revoked batch must never enter a later consent session's queue.
      if (this.enabled && operation.version === this.consentVersion) {
        this.events = [...events.slice(-100), ...this.events];
      }
    } finally {
      if (this.activeFlush === operation) this.activeFlush = null;
    }
  }

  /**
   * Send events to the telemetry endpoint
   */
  private async sendEvents(events: TelemetryEventPayload[], signal: AbortSignal): Promise<void> {
    if (!this.config.endpoint) {
      // If no endpoint is configured, just log events
      if (import.meta.env.DEV) {
        telemetryLogger.debug('Events flushed without endpoint', { count: events.length });
      }
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });

    if (!response.ok) {
      throw new Error(`Telemetry request failed: ${response.status}`);
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Enable telemetry collection
   */
  enable(options: { persist?: boolean } = {}): void {
    sessionConsent = true;
    this.applyConsent(true);
    this.track('feature.used', { feature: 'telemetry.enabled' });
    if (options.persist !== false) void queueTelemetryPreference(true);
  }

  /** Stop immediately; discard queued events and abort the current request. */
  async disable(options: { persist?: boolean } = {}): Promise<void> {
    sessionConsent = false;
    this.applyConsent(false);
    if (options.persist !== false) await queueTelemetryPreference(false);
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cleanup and flush remaining events
   */
  async cleanup(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }
}

// Global telemetry instance
let telemetryInstance: TelemetryCollector | null = null;

/** Apply an explicit user choice, including before the collector is initialized. */
export function applyTelemetryConsent(enabled: boolean, options: { persist?: boolean } = {}): void {
  sessionConsent = enabled;
  if (telemetryInstance) {
    if (enabled) telemetryInstance.enable({ persist: options.persist ?? false });
    else void telemetryInstance.disable({ persist: options.persist ?? false });
  } else if (options.persist) {
    void queueTelemetryPreference(enabled);
  }
}

/** Restore saved consent while preserving any newer explicit session choice. */
export function restoreTelemetryConsent(enabled: boolean): boolean {
  if (!enabled) sessionConsent = false;
  return telemetryInstance?.restoreConsent(enabled) ?? (sessionConsent === false ? false : enabled);
}

/**
 * Initialize the telemetry system
 */
export function initializeTelemetry(config?: Partial<TelemetryConfig>): TelemetryCollector {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryCollector(config);
    telemetryInstance.track('app.started');
  }
  return telemetryInstance;
}

/**
 * Get the telemetry instance
 */
export function getTelemetry(): TelemetryCollector | null {
  return telemetryInstance;
}

/**
 * Convenience function to track events
 */
export function track(event: TelemetryEvent, properties?: TelemetryProperties): void {
  telemetryInstance?.track(event, properties);
}

// Pre-configured trackers for common events
export const telemetry = {
  // Agent events
  agentCreated: (agentType: string, config: Partial<unknown> = {}) =>
    track('agent.created', {
      agentType,
      configKeys: Object.keys(config).join(','),
    } as TelemetryProperties),

  agentStarted: (agentId: string, agentType: string) =>
    track('agent.started', { agentId, agentType }),

  agentStopped: (agentId: string, reason?: string) => track('agent.stopped', { agentId, reason }),

  agentFailed: (agentId: string, error: string) => track('agent.failed', { agentId, error }),

  agentPaused: (agentId: string) => track('agent.paused', { agentId }),

  agentResumed: (agentId: string) => track('agent.resumed', { agentId }),

  agentConfigUpdated: (agentId: string, configKeys: string[]) =>
    track('agent.config.updated', {
      agentId,
      configKeys: configKeys.join(','),
    } as TelemetryProperties),

  // Platform events
  platformConnected: (platform: string) => track('platform.connected', { platform }),

  platformDisconnected: (platform: string) => track('platform.disconnected', { platform }),

  // Session events
  sessionStarted: (durationMs?: number) => track('session.started', { durationMs }),

  sessionEnded: (durationMs: number) => track('session.ended', { durationMs }),

  // Feature events
  featureUsed: (feature: string, details: Record<string, unknown> = {}) =>
    track('feature.used', { feature, ...details }),

  // Error events
  errorEncountered: (error: string, context: Record<string, unknown> = {}) =>
    track('error.encountered', { error, ...context }),

  // Settings events
  settingsChanged: (setting: string, oldValue?: unknown, newValue?: unknown) =>
    track('settings.changed', {
      setting,
      hasOldValue: oldValue !== undefined,
      newValueType: typeof newValue,
    }),
};

/**
 * Hook-friendly telemetry tracker
 */
export function useTelemetry() {
  return {
    track,
    telemetry,
    sessionId: telemetryInstance?.getSessionId(),
    enabled: telemetryInstance?.isEnabled() ?? false,
    enable: () => telemetryInstance?.enable(),
    disable: () => telemetryInstance?.disable(),
  };
}
