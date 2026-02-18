/**
 * Structured Telemetry System
 *
 * Collects anonymized usage data to improve product experience.
 * All telemetry is opt-in and respects user privacy.
 */

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

async function writeTelemetryPreference(enabled: boolean): Promise<void> {
  inMemoryTelemetryEnabled = enabled;
  try {
    if (window.electronAPI?.store?.set) {
      await window.electronAPI.store.set(TELEMETRY_ENABLED_KEY, enabled);
      return;
    }
  } catch {
    // Ignore storage errors
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
      localStorage?.setItem(TELEMETRY_ENABLED_KEY, String(enabled));
    } catch {
      // Ignore storage errors
    }
  }
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
  private flushPromise: Promise<void> | null = null;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.hasExplicitEnabled = typeof config.enabled === 'boolean';
    this.enabled = this.hasExplicitEnabled ? Boolean(config.enabled) : shouldCollectTelemetry();
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

    if (!this.hasExplicitEnabled) {
      void this.syncEnabledFromStorage();
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private async collectVersion(): Promise<void> {
    try {
      if (window.electronAPI?.app?.getVersion) {
        this.version = (await window.electronAPI.app.getVersion()) as string;
      }
    } catch {
      // Ignore errors
    }
  }

  private async collectUserId(): Promise<void> {
    if (this.userId) return;
    try {
      if (window.electronAPI?.store?.get) {
        const userId = await window.electronAPI.store.get(TELEMETRY_USER_ID_KEY);
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
    const preference = await readTelemetryPreference();
    if (preference === null) return;
    if (preference && !this.enabled) {
      this.enable();
    } else if (!preference && this.enabled) {
      await this.disable();
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
    const sensitiveKeys = [
      'apiKey',
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
    if (this.events.length === 0 || this.flushPromise) {
      return;
    }

    const eventsToFlush = [...this.events];
    this.events = [];

    try {
      this.flushPromise = this.sendEvents(eventsToFlush);
      await this.flushPromise;
    } catch (error) {
      // If flush fails, add events back to the queue (up to a limit)
      const maxRetrySize = 100;
      const eventsToRetry = eventsToFlush.slice(-maxRetrySize);
      this.events = [...eventsToRetry, ...this.events];
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Send events to the telemetry endpoint
   */
  private async sendEvents(events: TelemetryEventPayload[]): Promise<void> {
    if (!this.config.endpoint) {
      // If no endpoint is configured, just log events
      if (import.meta.env.DEV) {
        console.debug('Telemetry:', events);
      }
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
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
  enable(): void {
    this.enabled = true;
    this.startFlushTimer();
    this.collectVersion();
    this.collectUserId();
    this.track('feature.used', { feature: 'telemetry.enabled' });
    void writeTelemetryPreference(true);
  }

  /**
   * Disable telemetry collection
   */
  async disable(): Promise<void> {
    await this.flush();
    this.enabled = false;
    this.stopFlushTimer();

    try {
      await writeTelemetryPreference(false);
    } catch {
      // Ignore errors
    }
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
