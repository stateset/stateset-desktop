/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test-utils';
import { durableWorkflowApi } from '../lib/durableWorkflows';
import { DurableWorkflowActivity } from './DurableWorkflowActivity';

vi.mock('../lib/durableWorkflows', () => ({
  durableWorkflowApi: { streamEvents: vi.fn() },
}));

describe('DurableWorkflowActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders live history events and closes after terminal completion', async () => {
    vi.mocked(durableWorkflowApi.streamEvents).mockImplementation(
      async (_tenant, _workflow, options) => {
        options.onEvent({
          event_id: 3,
          kind: 'activity_completed',
          ts: '2026-09-01T12:00:00Z',
          activity: 'run_sandbox',
          preview: 'report.json created',
        });
        options.onEvent({
          event_id: 4,
          kind: 'workflow_completed',
          ts: '2026-09-01T12:00:01Z',
        });
      }
    );

    renderWithProviders(<DurableWorkflowActivity tenantId="tenant-1" workflowId="workflow-1" />);

    await waitFor(() => expect(screen.getByText('Complete')).toBeInTheDocument());
    expect(screen.getByText('activity completed · run_sandbox')).toBeInTheDocument();
    expect(screen.getByText('report.json created')).toBeInTheDocument();
    expect(durableWorkflowApi.streamEvents).toHaveBeenCalledWith(
      'tenant-1',
      'workflow-1',
      expect.objectContaining({ lastEventId: 0 })
    );
  });
});
