import type { AgentSession } from '../types';

export type ExportFormat = 'json' | 'csv';

interface ExportOptions {
  filename?: string;
  format: ExportFormat;
}

/**
 * Convert agent sessions to CSV format
 */
function sessionsToCSV(sessions: AgentSession[]): string {
  const headers = [
    'ID',
    'Type',
    'Status',
    'Created At',
    'Started At',
    'Loop Count',
    'Tokens Used',
    'Tool Calls',
    'Errors',
    'Messages Sent',
    'Uptime (seconds)',
  ];

  const rows = sessions.map((session) => [
    session.id,
    session.agent_type,
    session.status,
    session.created_at,
    session.started_at || '',
    session.metrics.loop_count,
    session.metrics.tokens_used,
    session.metrics.tool_calls,
    session.metrics.errors,
    session.metrics.messages_sent,
    session.metrics.uptime_seconds,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          // Escape quotes and wrap in quotes if contains comma or newline
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    ),
  ].join('\n');

  return csvContent;
}

/**
 * Convert agent sessions to JSON format
 */
function sessionsToJSON(sessions: AgentSession[]): string {
  return JSON.stringify(sessions, null, 2);
}

/**
 * Download data as a file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Export agent sessions to file
 */
export function exportSessions(sessions: AgentSession[], options: ExportOptions): void {
  const timestamp = new Date().toISOString().split('T')[0];
  const defaultFilename = `agents-export-${timestamp}`;

  if (options.format === 'csv') {
    const content = sessionsToCSV(sessions);
    const filename = options.filename || `${defaultFilename}.csv`;
    downloadFile(content, filename, 'text/csv');
  } else {
    const content = sessionsToJSON(sessions);
    const filename = options.filename || `${defaultFilename}.json`;
    downloadFile(content, filename, 'application/json');
  }
}

/**
 * Export metrics summary
 */
export function exportMetricsSummary(sessions: AgentSession[]): void {
  const summary = {
    exportedAt: new Date().toISOString(),
    totalAgents: sessions.length,
    byStatus: {
      running: sessions.filter((s) => s.status === 'running').length,
      paused: sessions.filter((s) => s.status === 'paused').length,
      stopped: sessions.filter((s) => s.status === 'stopped').length,
      failed: sessions.filter((s) => s.status === 'failed').length,
    },
    totalMetrics: {
      loopCount: sessions.reduce((acc, s) => acc + s.metrics.loop_count, 0),
      tokensUsed: sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0),
      toolCalls: sessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0),
      errors: sessions.reduce((acc, s) => acc + s.metrics.errors, 0),
      messagesSent: sessions.reduce((acc, s) => acc + s.metrics.messages_sent, 0),
      uptimeSeconds: sessions.reduce((acc, s) => acc + s.metrics.uptime_seconds, 0),
    },
    agents: sessions.map((s) => ({
      id: s.id,
      type: s.agent_type,
      status: s.status,
      metrics: s.metrics,
    })),
  };

  const content = JSON.stringify(summary, null, 2);
  const timestamp = new Date().toISOString().split('T')[0];
  downloadFile(content, `metrics-summary-${timestamp}.json`, 'application/json');
}

/**
 * Copy data to clipboard
 */
export async function copyToClipboard(data: unknown): Promise<boolean> {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type RunSummaryFormat = 'json' | 'md';

export function exportRunSummary(
  session: AgentSession,
  options: { format?: RunSummaryFormat } = {}
): void {
  const format = options.format || 'json';
  const summary = {
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      tenantId: session.tenant_id,
      brandId: session.brand_id,
      agentType: session.agent_type,
      status: session.status,
    },
    timings: {
      createdAt: session.created_at,
      startedAt: session.started_at ?? null,
      stoppedAt: session.stopped_at ?? null,
      updatedAt: session.updated_at,
      durationSeconds: session.metrics.uptime_seconds,
    },
    metrics: session.metrics,
    config: session.config,
  };

  const timestamp = new Date().toISOString().split('T')[0];
  const shortId = session.id.slice(0, 8);

  if (format === 'md') {
    const lines = [
      '# Agent Run Summary',
      '',
      `Exported: ${summary.exportedAt}`,
      '',
      '## Session',
      `- ID: ${summary.session.id}`,
      `- Tenant ID: ${summary.session.tenantId}`,
      `- Brand ID: ${summary.session.brandId}`,
      `- Agent Type: ${summary.session.agentType}`,
      `- Status: ${summary.session.status}`,
      '',
      '## Timings',
      `- Created: ${summary.timings.createdAt}`,
      `- Started: ${summary.timings.startedAt ?? '—'}`,
      `- Stopped: ${summary.timings.stoppedAt ?? '—'}`,
      `- Updated: ${summary.timings.updatedAt}`,
      `- Duration (seconds): ${summary.timings.durationSeconds}`,
      '',
      '## Metrics',
      `- Loop Count: ${summary.metrics.loop_count}`,
      `- Tokens Used: ${summary.metrics.tokens_used}`,
      `- Tool Calls: ${summary.metrics.tool_calls}`,
      `- Errors: ${summary.metrics.errors}`,
      `- Messages Sent: ${summary.metrics.messages_sent}`,
      `- Uptime (seconds): ${summary.metrics.uptime_seconds}`,
      '',
      '## Config',
      `- Model: ${summary.config.model}`,
      `- Temperature: ${summary.config.temperature}`,
      `- Loop Interval (ms): ${summary.config.loop_interval_ms}`,
      `- Max Iterations: ${summary.config.max_iterations}`,
      `- Iteration Timeout (secs): ${summary.config.iteration_timeout_secs}`,
      `- Pause on Error: ${summary.config.pause_on_error}`,
      `- MCP Servers: ${summary.config.mcp_servers?.join(', ') || '—'}`,
      `- Custom Instructions: ${summary.config.custom_instructions || '—'}`,
      '',
    ];
    downloadFile(lines.join('\n'), `run-summary-${shortId}-${timestamp}.md`, 'text/markdown');
    return;
  }

  const content = JSON.stringify(summary, null, 2);
  downloadFile(content, `run-summary-${shortId}-${timestamp}.json`, 'application/json');
}
