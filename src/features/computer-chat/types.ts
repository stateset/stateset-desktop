import type { ChatMessage } from '../../types';
import type { DurableChatIdentity, DurableChatStatus } from './durableTypes';

export interface ComputerSession {
  id: string;
  organizationId: string;
  status: string;
  currentSandboxId?: string | null;
}

export interface ComputerAction {
  name: 'screenshot' | 'click' | 'type_text' | 'press_key' | 'execute';
  arguments: Record<string, unknown>;
}

export interface ActionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
}

export interface PolicyReceipt {
  phase: 'admission' | 'verification';
  verdict: 'allow' | 'rewrite' | 'ask_user' | 'deny';
  actionHash: string;
  evidenceIds: string[];
  reasons: string[];
  checkedAt: string;
}

export interface PendingAction {
  requestId: string;
  action: ComputerAction;
  command: string[];
  durable: boolean;
  verify: boolean;
  engineUrl?: string;
  workflowId?: string;
  runId?: string;
  admission?: PolicyReceipt;
  result?: ActionResult;
}

export interface ComputerChat {
  sandboxApiSession?: { version: 1 };
  lastOpenedAt?: string;
  draft?: string;
  pinned?: boolean;
  archived?: boolean;
  customTitle?: boolean;
  historyTruncated?: boolean;
  timeline?: DurableChatStatus['events'];
  durableSession?: DurableChatIdentity;
  serverState?: DurableChatStatus;
  pendingMessage?: { id: string; content: string };
  legacySourceId?: string;
  id: string;
  tenantId: string;
  brandId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  session?: ComputerSession;
  provisioningAttempted?: boolean;
  sandboxStartUnconfirmed?: boolean;
  sandboxStopRequested?: boolean;
  messages: ChatMessage[];
  pending?: PendingAction;
  workflows: { workflowId: string; runId: string }[];
  policy?: PolicyReceipt;
  policyHistory?: Array<PolicyReceipt & { requestId: string }>;
  screenshot?: string;
  stopped?: boolean;
  error?: string;
}

export interface ChatConnection {
  status: 'connected' | 'reconnecting' | 'attention';
  failures: number;
  lastSyncedAt?: number;
  nextRetryAt?: number;
  message?: string;
}
