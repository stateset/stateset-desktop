import type { AgentSessionStatus } from '../types';

/**
 * Status display utilities for consistent styling across the app
 */

export type StatusColor = 'green' | 'amber' | 'red' | 'gray';

export interface StatusStyle {
  bg: string;
  text: string;
  dot: string;
  badge: string;
}

const STATUS_STYLES: Record<AgentSessionStatus, StatusStyle> = {
  starting: {
    bg: 'bg-blue-900/50',
    text: 'text-blue-400',
    dot: 'bg-blue-500',
    badge: 'bg-blue-900/50 text-blue-400',
  },
  running: {
    bg: 'bg-green-900/50',
    text: 'text-green-400',
    dot: 'bg-green-500',
    badge: 'bg-green-900/50 text-green-400',
  },
  paused: {
    bg: 'bg-amber-900/50',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
    badge: 'bg-amber-900/50 text-amber-400',
  },
  stopping: {
    bg: 'bg-amber-900/50',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
    badge: 'bg-amber-900/50 text-amber-400',
  },
  stopped: {
    bg: 'bg-gray-800',
    text: 'text-gray-400',
    dot: 'bg-gray-500',
    badge: 'bg-gray-800 text-gray-400',
  },
  failed: {
    bg: 'bg-red-900/50',
    text: 'text-red-400',
    dot: 'bg-red-500',
    badge: 'bg-red-900/50 text-red-400',
  },
};

const STATUS_TEXT: Record<AgentSessionStatus, string> = {
  starting: 'Starting',
  running: 'Running',
  paused: 'Paused',
  stopping: 'Stopping',
  stopped: 'Stopped',
  failed: 'Failed',
};

/**
 * Get the status style object for a given status
 */
export function getStatusStyle(status: AgentSessionStatus): StatusStyle {
  return STATUS_STYLES[status] || STATUS_STYLES.stopped;
}

/**
 * Get just the dot/indicator color class for a status
 */
export function getStatusDotColor(status: AgentSessionStatus): string {
  return getStatusStyle(status).dot;
}

/**
 * Get the badge classes for a status
 */
export function getStatusBadgeClasses(status: AgentSessionStatus): string {
  return getStatusStyle(status).badge;
}

/**
 * Get the text color class for a status
 */
export function getStatusTextColor(status: AgentSessionStatus): string {
  return getStatusStyle(status).text;
}

/**
 * Get the human-readable text for a status
 */
export function getStatusText(status: AgentSessionStatus): string {
  return STATUS_TEXT[status] || 'Unknown';
}

/**
 * Check if an agent is in an active (running or paused) state
 */
export function isActiveStatus(status: AgentSessionStatus): boolean {
  return status === 'running' || status === 'paused';
}

/**
 * Check if an agent can be started (stopped or failed)
 */
export function canStart(status: AgentSessionStatus): boolean {
  return status === 'stopped' || status === 'failed';
}

/**
 * Check if an agent can be stopped (running or paused)
 */
export function canStop(status: AgentSessionStatus): boolean {
  return status === 'running' || status === 'paused';
}
