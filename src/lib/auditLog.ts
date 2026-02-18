export type AuditAction =
  | 'agent.created'
  | 'agent.started'
  | 'agent.stopped'
  | 'agent.deleted'
  | 'config.changed'
  | 'template.created'
  | 'template.deleted'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'brand.switched'
  | 'user.login'
  | 'user.logout'
  | 'settings.changed';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export const AUDIT_ACTION_COLORS: Record<AuditAction, string> = {
  'agent.created': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'agent.started': 'bg-green-500/20 text-green-400 border-green-500/30',
  'agent.stopped': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'agent.deleted': 'bg-red-500/20 text-red-400 border-red-500/30',
  'config.changed': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'template.created': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'template.deleted': 'bg-red-500/20 text-red-400 border-red-500/30',
  'webhook.created': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'webhook.deleted': 'bg-red-500/20 text-red-400 border-red-500/30',
  'brand.switched': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'user.login': 'bg-green-500/20 text-green-400 border-green-500/30',
  'user.logout': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'settings.changed': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'agent.created': 'Agent Created',
  'agent.started': 'Agent Started',
  'agent.stopped': 'Agent Stopped',
  'agent.deleted': 'Agent Deleted',
  'config.changed': 'Config Changed',
  'template.created': 'Template Created',
  'template.deleted': 'Template Deleted',
  'webhook.created': 'Webhook Created',
  'webhook.deleted': 'Webhook Deleted',
  'brand.switched': 'Brand Switched',
  'user.login': 'Login',
  'user.logout': 'Logout',
  'settings.changed': 'Settings Changed',
};
