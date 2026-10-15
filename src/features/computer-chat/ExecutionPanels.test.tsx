/** @vitest-environment happy-dom */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deliverables } from './ExecutionPanels';
import type { ComputerChat } from './types';
vi.mock('./durable', () => ({
  durableChatController: { review: vi.fn(), exportArtifact: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('evidence presentation', () => {
  it('keeps collected files observed when no acceptance checks exist', () => {
    const chat = {
      id: 'chat',
      serverState: {
        artifacts: [{ path: '/workspace/report.txt', sha256: 'a'.repeat(64), size_bytes: 10 }],
        verification: {
          outcome: 'observed_only',
          checks: [],
          manifest_sha256: 'manifest',
          evidence_ids: [],
        },
      },
    } as unknown as ComputerChat;
    render(<Deliverables chat={chat} />);
    expect(screen.getByText(/Observed.*10 bytes/)).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });
});
