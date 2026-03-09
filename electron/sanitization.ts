const REDACTION_PLACEHOLDERS = {
  apiKey: '__STATESET_REDACT_1__',
  token: '__STATESET_REDACT_2__',
  github: '__STATESET_REDACT_3__',
  aws: '__STATESET_REDACT_4__',
  jwt: '__STATESET_REDACT_5__',
  email: '__STATESET_REDACT_6__',
} as const;

const FINAL_REDACTIONS: Record<
  (typeof REDACTION_PLACEHOLDERS)[keyof typeof REDACTION_PLACEHOLDERS],
  string
> = {
  __STATESET_REDACT_1__: '[REDACTED_API_KEY]',
  __STATESET_REDACT_2__: '[REDACTED_TOKEN]',
  __STATESET_REDACT_3__: '[REDACTED_GITHUB_TOKEN]',
  __STATESET_REDACT_4__: '[REDACTED_AWS_KEY]',
  __STATESET_REDACT_5__: '[REDACTED_JWT]',
  __STATESET_REDACT_6__: '[REDACTED_EMAIL]',
};

const PLACEHOLDER_PREFIX = '__STATESET_REDACT_';
const UNREDACTED_VALUE_PATTERN = `(?!${PLACEHOLDER_PREFIX})[^\\s"'&,;]+`;
const STRUCTURED_TOKEN_LABEL_PATTERN =
  '(?:api[-_]?key|api[_-]?secret|access[-_]?token|refresh[-_]?token|sandbox_api_key|engine_api_key|x-api-key|x_api_key)';
const COMPACT_TOKEN_LABEL_PATTERN =
  '(?:api[-_]?key|api[_-]?secret|access[-_]?token|refresh[-_]?token|sandbox_api_key|engine_api_key|bearer|authorization|x-api-key|x_api_key)';

const SENSITIVE_PATTERNS: Array<
  [RegExp, (typeof REDACTION_PLACEHOLDERS)[keyof typeof REDACTION_PLACEHOLDERS]]
> = [
  [/sk-[a-zA-Z0-9_-]{20,}/g, REDACTION_PLACEHOLDERS.apiKey],
  [
    new RegExp(`authorization\\s*[:=]\\s*(?:bearer|apikey)\\s+${UNREDACTED_VALUE_PATTERN}`, 'gi'),
    REDACTION_PLACEHOLDERS.token,
  ],
  [
    new RegExp(`(?:bearer|apikey)\\s+${UNREDACTED_VALUE_PATTERN}`, 'gi'),
    REDACTION_PLACEHOLDERS.token,
  ],
  [
    new RegExp(
      `${STRUCTURED_TOKEN_LABEL_PATTERN}\\s*[:=]\\s*${UNREDACTED_VALUE_PATTERN}(?:\\s+${UNREDACTED_VALUE_PATTERN})?`,
      'gi'
    ),
    REDACTION_PLACEHOLDERS.token,
  ],
  [
    new RegExp(`${COMPACT_TOKEN_LABEL_PATTERN}${UNREDACTED_VALUE_PATTERN}`, 'gi'),
    REDACTION_PLACEHOLDERS.token,
  ],
  [/gh[pousr]_[A-Za-z0-9]{10,}/g, REDACTION_PLACEHOLDERS.github],
  [/AKIA[0-9A-Z]{16}/g, REDACTION_PLACEHOLDERS.aws],
  [/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, REDACTION_PLACEHOLDERS.jwt],
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, REDACTION_PLACEHOLDERS.email],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function sanitizeSensitiveText(value: string): string {
  const redacted = SENSITIVE_PATTERNS.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, value);

  return Object.entries(FINAL_REDACTIONS).reduce((text, [placeholder, replacement]) => {
    return text.split(placeholder).join(replacement);
  }, redacted);
}

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeValue(item);
    }
    return output;
  }

  return value;
}

export function sanitizeStringRecord(value: unknown): Record<string, string> {
  const output: Record<string, string> = {};

  if (!isRecord(value)) {
    return output;
  }

  for (const [key, item] of Object.entries(value)) {
    const sanitized = sanitizeValue(item);
    output[key] =
      typeof sanitized === 'string' ? sanitizeSensitiveText(sanitized) : String(sanitized);
  }

  return output;
}

export function sanitizeQueryParams(value: unknown): string {
  if (typeof value === 'string') {
    return sanitizeSensitiveText(value);
  }

  const queryParams = sanitizeStringRecord(value);
  const normalized = new URLSearchParams(queryParams);
  return normalized.toString();
}
