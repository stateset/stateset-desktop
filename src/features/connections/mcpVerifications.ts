import type { McpProbeResult } from '../../vite-env';

/** What a successful MCP handshake told us about a server, kept between sessions. */
export interface McpVerification {
  serverName: string;
  serverVersion: string;
  toolCount: number;
  /** Tool names the server reported, capped for storage. */
  tools: string[];
  /** ISO timestamp of the handshake. */
  verifiedAt: string;
}

const MAX_STORED_TOOLS = 25;

export type McpVerificationMap = Record<string, McpVerification>;

/** Verifications belong to a brand, since credentials do. */
export function verificationKey(brandId: string, platformId: string): string {
  return `${brandId}:${platformId}`;
}

export function toVerification(
  result: Extract<McpProbeResult, { ok: true }>,
  now: number = Date.now()
): McpVerification {
  return {
    serverName: result.serverName,
    serverVersion: result.serverVersion,
    toolCount: result.toolCount,
    tools: result.tools.slice(0, MAX_STORED_TOOLS),
    verifiedAt: new Date(now).toISOString(),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short relative age, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function formatVerifiedAgo(verifiedAt: string, now: number = Date.now()): string {
  const timestamp = Date.parse(verifiedAt);
  if (Number.isNaN(timestamp)) return 'unknown';

  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}

const STALE_AFTER = 7 * DAY;

/** A check older than a week says little about whether the server still answers. */
export function isVerificationStale(verifiedAt: string, now: number = Date.now()): boolean {
  const timestamp = Date.parse(verifiedAt);
  if (Number.isNaN(timestamp)) return true;
  return now - timestamp > STALE_AFTER;
}

function isVerification(value: unknown): value is McpVerification {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.serverName === 'string' &&
    typeof candidate.serverVersion === 'string' &&
    typeof candidate.toolCount === 'number' &&
    typeof candidate.verifiedAt === 'string'
  );
}

/** Reads the persisted map defensively — stored data may be old or hand-edited. */
export function parseVerificationMap(raw: unknown): McpVerificationMap {
  if (typeof raw !== 'object' || raw === null) return {};

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => isVerification(value))
      .map(([key, value]) => {
        const entry = value as McpVerification & { tools?: unknown };
        // Records written before tool names were kept have no `tools`.
        const tools = Array.isArray(entry.tools)
          ? entry.tools.filter((tool): tool is string => typeof tool === 'string')
          : [];
        return [key, { ...entry, tools }];
      })
  ) as McpVerificationMap;
}
