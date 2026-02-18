// Agent Session types
export type AgentSessionStatus =
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface AgentSessionConfig {
  agent_type?: string;
  loop_interval_ms: number;
  max_iterations: number;
  iteration_timeout_secs: number;
  pause_on_error: boolean;
  custom_instructions?: string | null;
  mcp_servers: string[] | null;
  model: string;
  temperature: number;
  sandbox_api_key?: string | null;
}

export interface AgentSessionMetrics {
  loop_count: number;
  tokens_used: number;
  tool_calls: number;
  errors: number;
  messages_sent: number;
  uptime_seconds: number;
  estimated_cost_cents?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface AgentSession {
  id: string;
  tenant_id: string;
  brand_id: string;
  agent_type: string;
  name?: string | null;
  tags?: string[] | null;
  status: AgentSessionStatus;
  config: AgentSessionConfig;
  metrics: AgentSessionMetrics;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  stopped_at?: string | null;
}

// Agent Events (SSE)
export type AgentEventType =
  | 'status_changed'
  | 'thinking'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'log'
  | 'error'
  | 'metrics'
  | 'heartbeat';

export interface StatusChangedEvent {
  type: 'status_changed';
  status: AgentSessionStatus;
  message?: string;
}

export interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

export interface MessageEvent {
  type: 'message';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: 'tool_result';
  tool_call_id: string;
  result: unknown;
  success: boolean;
  duration_ms: number;
}

export interface LogEvent {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorEvent {
  type: 'error';
  code: string;
  message: string;
  recoverable: boolean;
}

export interface MetricsEvent {
  type: 'metrics';
  loop_count: number;
  tokens_used: number;
  tool_calls: number;
  uptime_seconds: number;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
}

export type AgentEvent =
  | StatusChangedEvent
  | ThinkingEvent
  | MessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | LogEvent
  | ErrorEvent
  | MetricsEvent
  | HeartbeatEvent;

// Brand & Tenant types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: 'free' | 'pro' | 'enterprise';
  created_at: string;
}

export interface Brand {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  support_platform: string;
  ecommerce_platform: string;
  config: Record<string, unknown>;
  mcp_servers: string[];
  enabled: boolean;
  created_at: string;
}

// Platform connection types
export interface PlatformConnection {
  platform: string;
  connected: boolean;
  connected_at?: string;
  fields: string[];
}

// Agent Template types
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: 'general' | 'support' | 'commerce' | 'automation' | 'custom';
  agentType: string;
  config: Partial<AgentSessionConfig>;
  isCustom?: boolean;
  createdAt?: string;
}

// Webhook types
export type WebhookStatus = 'active' | 'paused' | 'failed';
export type WebhookDirection = 'incoming' | 'outgoing';

export interface Webhook {
  id: string;
  tenant_id: string;
  brand_id: string;
  name: string;
  url: string;
  direction: WebhookDirection;
  events: string[];
  status: WebhookStatus;
  secret?: string;
  headers?: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_triggered_at?: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status_code: number | null;
  request_body: string;
  response_body?: string;
  duration_ms: number;
  success: boolean;
  created_at: string;
}

// Chat Playground types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  durationMs?: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  agentType: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// API Response types
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
