import type { SetupReport } from './durableTypes';

// Connection credentials are compared in memory only. Never persist this context
// with chats, include it in diagnostics payloads, or render it as evidence.
export interface SetupContext {
  tenantId: string;
  brandId: string;
  engineUrl: string;
  apiKey: string | null;
  connectionRevision?: string | null;
  configuring?: boolean;
  mcpServers: string[];
}
export interface CheckedSetup {
  context: SetupContext;
  report: SetupReport;
}
export function sameSetupConnection(a: SetupContext, b: SetupContext) {
  return (
    a.tenantId === b.tenantId &&
    a.brandId === b.brandId &&
    a.engineUrl === b.engineUrl &&
    a.apiKey === b.apiKey &&
    (a.connectionRevision ?? null) === (b.connectionRevision ?? null) &&
    (a.configuring ?? false) === (b.configuring ?? false)
  );
}
export function sameSetupContext(a: SetupContext, b: SetupContext) {
  const expected = [...b.mcpServers].sort();
  return (
    sameSetupConnection(a, b) &&
    a.mcpServers.length === b.mcpServers.length &&
    [...a.mcpServers].sort().every((server, index) => server === expected[index])
  );
}
