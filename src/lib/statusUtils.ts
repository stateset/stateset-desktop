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
  /** Whether the status dot should pulse (for active states) */
  pulseDot: boolean;
}

const STATUS_STYLES: Record<AgentSessionStatus, StatusStyle> = {
  starting: {
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    badge:
      'bg-gradient-to-r from-blue-500/15 to-blue-500/5 text-blue-300 border border-blue-500/30 backdrop-blur-sm shadow-sm',
    pulseDot: true,
  },
  running: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    badge:
      'bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-300 border border-emerald-500/30 backdrop-blur-sm shadow-sm',
    pulseDot: true,
  },
  paused: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    badge:
      'bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-300 border border-amber-500/30 backdrop-blur-sm shadow-sm',
    pulseDot: false,
  },
  stopping: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    badge:
      'bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-300 border border-amber-500/30 backdrop-blur-sm shadow-sm',
    pulseDot: true,
  },
  stopped: {
    bg: 'bg-slate-800/60',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
    badge: 'bg-slate-800/60 text-slate-300 border border-slate-700/60 backdrop-blur-sm shadow-sm',
    pulseDot: false,
  },
  failed: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    dot: 'bg-rose-400',
    badge:
      'bg-gradient-to-r from-rose-500/15 to-rose-500/5 text-rose-300 border border-rose-500/30 backdrop-blur-sm shadow-sm',
    pulseDot: false,
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
