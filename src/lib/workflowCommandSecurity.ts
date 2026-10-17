const SENSITIVE_NAME =
  '(?:api[_-]?key|access[_-]?key|auth[_-]?token|token|password|passwd|secret|client[_-]?secret)';
const INLINE_SECRET_PATTERNS = [
  new RegExp(`(?:^|\\s)(?:export\\s+)?${SENSITIVE_NAME}\\s*=\\s*([^\\s;]+)`, 'i'),
  new RegExp(`--${SENSITIVE_NAME}(?:=|\\s+)('[^']*'|"[^"]*"|[^\\s;]+)`, 'i'),
];

function isSecretReference(value: string): boolean {
  const normalized = value.replace(/^['"]|['"]$/g, '');
  return (
    normalized.startsWith('$') || normalized.startsWith('{{') || normalized.startsWith('secret:')
  );
}

export function assertNoInlineSecrets(commands: string[][] | string[]): void {
  const flattened = Array.isArray(commands[0])
    ? (commands as string[][]).flat()
    : (commands as string[]);
  for (const command of flattened) {
    for (const pattern of INLINE_SECRET_PATTERNS) {
      const match = command.match(pattern);
      if (match?.[1] && !isSecretReference(match[1])) {
        throw new Error(
          'Inline credentials are not allowed. Reference a platform-managed secret or environment variable instead.'
        );
      }
    }
  }
}
