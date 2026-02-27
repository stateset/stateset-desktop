import { AlertCircle, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

export type Severity = 'info' | 'success' | 'error' | 'warning';

export interface SeverityConfig {
  icon: typeof Info;
  color: string;
  bgClass: string;
}

/**
 * Shared severity configuration for toast and notification components.
 * Components may override individual properties (e.g. NotificationsCenter
 * uses `brand` instead of `blue` for info, and `XCircle` for error).
 */
export const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  info: {
    icon: Info,
    color: 'blue',
    bgClass: 'bg-blue-500/15',
  },
  success: {
    icon: CheckCircle,
    color: 'emerald',
    bgClass: 'bg-emerald-500/15',
  },
  error: {
    icon: AlertCircle,
    color: 'rose',
    bgClass: 'bg-rose-500/15',
  },
  warning: {
    icon: AlertTriangle,
    color: 'amber',
    bgClass: 'bg-amber-500/15',
  },
};

/** Variant used by NotificationsCenter (XCircle for error, brand for info) */
export const NOTIFICATION_SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  ...SEVERITY_CONFIG,
  info: {
    icon: Info,
    color: 'brand',
    bgClass: 'bg-brand-500/15',
  },
  error: {
    icon: XCircle,
    color: 'rose',
    bgClass: 'bg-rose-500/15',
  },
};
