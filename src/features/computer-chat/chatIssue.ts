export const chatIssueCodes = [
  'sandbox-key',
  'policy-key',
  'provider-credit',
  'provider-auth',
  'provider-limit',
  'provider-unavailable',
  'policy-unavailable',
  'policy-proof',
  'connection-changed',
] as const;

export type ChatIssueCode = (typeof chatIssueCodes)[number];

/** Keep the service that failed explicit; a provider failure must not reset Sandbox access. */
export class ChatIssueError extends Error {
  constructor(
    readonly code: ChatIssueCode,
    message: string
  ) {
    super(message);
    this.name = 'ChatIssueError';
  }
}

export interface ChatIssueDescription {
  title: string;
  guidance: string;
  action?: 'connection' | 'file';
}

const descriptions: Record<ChatIssueCode, ChatIssueDescription> = {
  'sandbox-key': {
    title: 'Connect your computer',
    guidance: 'Save a Sandbox API key in connection settings. Your chat and draft are retained.',
    action: 'connection',
  },
  'policy-key': {
    title: 'Check your policy connection',
    guidance:
      'Save an NSR policy API key for this organization and brand in connection settings. Keep policy checks enabled while you resolve access.',
    action: 'connection',
  },
  'provider-credit': {
    title: 'Model credits need attention',
    guidance:
      'Ask your Sandbox organization administrator to check the model provider’s balance. Your computer is retained; you can stop it while access is restored. No task is retried automatically.',
  },
  'provider-auth': {
    title: 'Model access was rejected',
    guidance:
      'Ask your Sandbox organization administrator to check model provider access. This response does not establish that your Sandbox API key is invalid. No task is retried automatically.',
  },
  'provider-limit': {
    title: 'The model is temporarily busy',
    guidance:
      'Wait before sending a follow-up. Your conversation is saved, and no task is retried automatically.',
  },
  'provider-unavailable': {
    title: 'The model request did not finish',
    guidance:
      'Your conversation is saved. Check model availability with your Sandbox organization administrator before sending a follow-up. No task is retried automatically.',
  },
  'policy-unavailable': {
    title: 'Policy verification is unavailable',
    guidance:
      'Keep policy checks enabled. Review any pending action or file check after the NSR service recovers; no verification has been accepted from this response.',
  },
  'policy-proof': {
    title: 'Verification could not be confirmed',
    guidance:
      'NSR did not provide a matching verified receipt. Review the pending action or collect the file again before accepting its output.',
    action: 'file',
  },
  'connection-changed': {
    title: 'Check the saved connection',
    guidance:
      'The connection changed during this request. Confirm the original organization, brand and saved connection before continuing. Existing work is not replayed.',
    action: 'connection',
  },
};

export function describeChatIssue(code?: ChatIssueCode): ChatIssueDescription {
  return code
    ? descriptions[code]
    : {
        title: 'This conversation needs attention',
        guidance:
          'Your chat is retained. Review the details and any pending action before continuing. Nothing is retried automatically.',
      };
}
