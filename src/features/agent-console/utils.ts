/** Format a timestamp for display in the message list. */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format a duration in seconds to a human-readable string. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0s';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

// ── JSON preview helpers ──────────────────────────────────────────────

type JsonPreviewOptions = {
  maxDepth: number;
  maxKeys: number;
  maxArrayLength: number;
  maxStringLength: number;
  maxNodes: number;
};

export const TOOL_PAYLOAD_PREVIEW_OPTIONS: JsonPreviewOptions = {
  maxDepth: 6,
  maxKeys: 60,
  maxArrayLength: 60,
  maxStringLength: 8000,
  maxNodes: 4000,
};

export function buildJsonPreview(
  value: unknown,
  options: JsonPreviewOptions
): { value: unknown; truncated: boolean } {
  const state = { nodes: 0, truncated: false };
  const inProgress = new WeakSet<object>();

  const visit = (current: unknown, depth: number): unknown => {
    state.nodes += 1;
    if (state.nodes > options.maxNodes) {
      state.truncated = true;
      return '[Truncated: node limit reached]';
    }

    if (current === null) return null;
    if (current === undefined) return '[undefined]';

    if (typeof current === 'string') {
      if (current.length <= options.maxStringLength) return current;
      state.truncated = true;
      const remaining = current.length - options.maxStringLength;
      return `${current.slice(0, options.maxStringLength)}… (${remaining} more chars)`;
    }
    if (typeof current === 'number' || typeof current === 'boolean') return current;
    if (typeof current === 'bigint') return `${current.toString()}n`;
    if (typeof current === 'symbol') return current.toString();
    if (typeof current === 'function') {
      const fn = current as (...args: unknown[]) => unknown;
      return `[Function${fn.name ? ` ${fn.name}` : ''}]`;
    }

    if (current instanceof Date) return current.toISOString();
    if (current instanceof Error) {
      return { name: current.name, message: current.message, stack: current.stack };
    }

    if (Array.isArray(current)) {
      if (inProgress.has(current)) {
        state.truncated = true;
        return '[Circular]';
      }
      if (depth >= options.maxDepth) {
        state.truncated = true;
        return `[Truncated: max depth ${options.maxDepth}]`;
      }

      inProgress.add(current);
      const out = [];
      const limit = Math.min(current.length, options.maxArrayLength);
      for (let i = 0; i < limit; i += 1) {
        out.push(visit(current[i], depth + 1));
      }
      if (current.length > limit) {
        state.truncated = true;
        out.push(`[... ${current.length - limit} more items]`);
      }
      inProgress.delete(current);
      return out;
    }

    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      if (inProgress.has(obj)) {
        state.truncated = true;
        return '[Circular]';
      }
      if (depth >= options.maxDepth) {
        state.truncated = true;
        return `[Truncated: max depth ${options.maxDepth}]`;
      }

      inProgress.add(obj);
      const out: Record<string, unknown> = {};
      let count = 0;
      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (count >= options.maxKeys) {
          state.truncated = true;
          out['…'] = '[More keys truncated]';
          break;
        }
        out[key] = visit(obj[key], depth + 1);
        count += 1;
      }
      inProgress.delete(obj);
      return out;
    }

    try {
      return String(current);
    } catch {
      return '[unserializable]';
    }
  };

  return { value: visit(value, 0), truncated: state.truncated };
}

function safeJsonStringify(value: unknown, pretty: boolean): string {
  const seen = new WeakSet<object>();
  const replacer = (_key: string, current: unknown) => {
    if (typeof current === 'bigint') return `${current.toString()}n`;
    if (typeof current === 'symbol') return current.toString();
    if (typeof current === 'function') {
      const fn = current as (...args: unknown[]) => unknown;
      return `[Function${fn.name ? ` ${fn.name}` : ''}]`;
    }
    if (current && typeof current === 'object') {
      if (seen.has(current)) return '[Circular]';
      seen.add(current);
    }
    return current;
  };

  try {
    return JSON.stringify(value, replacer, pretty ? 2 : undefined) ?? '';
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

export function stringifyToolPayload(value: unknown, pretty: boolean): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return safeJsonStringify(value, pretty);
}

export function formatToolCallId(id: string): string {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}
