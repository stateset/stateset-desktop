/**
 * API Configuration
 * Centralized configuration for API-related settings
 */

export const API_CONFIG = {
  /** Base URL for the StateSet API */
  baseUrl: import.meta.env.VITE_API_URL || 'https://engine.stateset.cloud.stateset.app',

  /** Request timeout in milliseconds */
  timeout: 15000,

  /** Maximum number of retries for failed requests */
  maxRetries: 3,

  /** HTTP status codes that trigger automatic retry */
  retryableStatusCodes: [429, 500, 502, 503, 504] as const,

  /** Circuit breaker configuration */
  circuitBreaker: {
    /** Number of failures before opening the circuit */
    maxFailures: 5,
    /** Time in ms before attempting to close an open circuit */
    halfOpenTimeout: 30000,
    /** Time in ms before resetting failure count */
    resetTimeout: 60000,
  },

  /** Stream configuration */
  stream: {
    /** Maximum number of events to keep in memory */
    maxEvents: 500,
    /** Maximum number of messages to keep in memory */
    maxMessages: 500,
    /** Maximum reconnection attempts */
    maxReconnectAttempts: 12,
    /** Base delay for exponential backoff (ms) */
    reconnectBaseDelay: 1000,
    /** Maximum delay for exponential backoff (ms) */
    reconnectMaxDelay: 30000,
  },
} as const;

export type ApiConfig = typeof API_CONFIG;
