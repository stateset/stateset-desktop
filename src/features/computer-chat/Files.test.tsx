/** @vitest-environment happy-dom */
import { fireEvent, render, screen, cleanup, waitFor, within, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deliverables } from './Deliverables';
import { WorkspaceBrowser } from './WorkspaceBrowser';
import { durableChatController } from './durable';
import type { ComputerChat } from './types';
import type { ArtifactContent } from './artifacts';
vi.mock('./durable', () => ({
  durableChatController: { readArtifact: vi.fn(), exportArtifact: vi.fn(), workspace: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function fixture(): ComputerChat {
  return {
    id: 'chat',
    durableSession: { configuration: { criteria: [] } },
    serverState: {
      status: 'idle',
      artifacts: [
        {
          path: '/workspace/report.html',
          sha256: 'a'.repeat(64),
          size_bytes: 26,
          media_type: 'text/html',
        },
      ],
      verification: null,
      workspace: {
        path: '/workspace/reports',
        entries: [
          {
            name: 'report.txt',
            path: '/workspace/reports/report.txt',
            type: 'file',
            size_bytes: 20,
          },
          { name: 'drafts', path: '/workspace/reports/drafts', type: 'directory', size_bytes: 0 },
        ],
      },
    },
  } as unknown as ComputerChat;
}
function content(): ArtifactContent {
  return {
    ...fixture().serverState!.artifacts[0],
    bytes: new TextEncoder().encode('<img src=x onerror="bad()">'),
    contentBase64: '',
  };
}
describe('deliverable interactions', () => {
  it('renders HTML as escaped text and pins requests to the displayed version', async () => {
    vi.mocked(durableChatController.readArtifact).mockResolvedValue(content());
    const chat = fixture();
    render(<Deliverables chat={chat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview report.html' }));
    const preview = await screen.findByRole('region', { name: 'Preview of report.html' });
    expect(preview).toHaveTextContent('<img src=x onerror="bad()">');
    expect(preview.querySelector('img')).toBeNull();
    expect(durableChatController.readArtifact).toHaveBeenCalledWith(
      'chat',
      '/workspace/report.html',
      chat.serverState!.artifacts[0]
    );
    screen.getByRole('button', { name: 'Close file preview' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close file preview' }));
    expect(screen.getByRole('button', { name: 'Preview report.html' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Preview of report.html' })).toBeNull();
  });
  it('reports cancellation accurately and permits retry after a local error', async () => {
    vi.mocked(durableChatController.exportArtifact)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('Disk full'))
      .mockResolvedValueOnce(true);
    render(<Deliverables chat={fixture()} />);
    const save = screen.getByRole('button', { name: 'Save report.html' });
    fireEvent.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('Save canceled.');
    expect(screen.queryByText(/Saved to/)).toBeNull();
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent('canceled'));
  });
  it('disables duplicate file operations and discards late previews after a version change', async () => {
    let release!: (value: ArtifactContent) => void;
    vi.mocked(durableChatController.readArtifact).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const chat = fixture();
    const { rerender } = render(<Deliverables chat={chat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview report.html' }));
    expect(screen.getByRole('button', { name: 'Save report.html' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save report.html' }));
    expect(durableChatController.exportArtifact).not.toHaveBeenCalled();
    rerender(
      <Deliverables
        chat={{
          ...chat,
          serverState: {
            ...chat.serverState!,
            artifacts: [{ ...chat.serverState!.artifacts[0], sha256: 'b'.repeat(64) }],
          },
        }}
      />
    );
    await act(async () => release(content()));
    expect(screen.queryByRole('region', { name: 'Preview of report.html' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save report.html' })).toBeEnabled();
  });
  it('shows outdated verification for a previously verified file', () => {
    const chat = fixture();
    chat.durableSession!.configuration.criteria = [
      { path: '/workspace/report.html', kind: 'contains', expected: 'proof' },
    ];
    chat.serverState!.verification = {
      verified: true,
      outcome: 'verified',
      manifest_sha256: 'manifest',
      evidence_ids: [],
      checks: [
        {
          path: '/workspace/report.html',
          kind: 'contains',
          passed: true,
          detail: 'Found',
          sha256: 'b'.repeat(64),
        },
      ],
    };
    render(<Deliverables chat={chat} />);
    expect(screen.getByText(/Checks outdated/)).toBeVisible();
    expect(screen.queryByText('All configured acceptance checks passed.')).toBeNull();
  });
});
describe('workspace navigation', () => {
  it.each([
    ['/workspace/' + '漢'.repeat(338), '1,024 UTF-8 bytes'],
    ['/workspace/a\u0085b', 'under /workspace'],
  ])('keeps the rejected %s address editable with an associated error', async (path, message) => {
    render(<WorkspaceBrowser chat={fixture()} busy={false} />);
    const input = screen.getByRole('textbox', { name: 'Workspace directory' });
    fireEvent.change(input, { target: { value: path } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveValue(path);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(screen.getByRole('alert').textContent!);
    expect(durableChatController.workspace).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '/workspace/客户' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.submit(input.closest('form')!);
    expect(durableChatController.workspace).toHaveBeenCalledWith('chat', 'list', '/workspace/客户');
  });
  it('updates the address when a new folder observation arrives', () => {
    const chat = fixture();
    const { rerender } = render(<WorkspaceBrowser chat={chat} busy={false} />);
    rerender(
      <WorkspaceBrowser
        chat={{
          ...chat,
          serverState: { ...chat.serverState!, workspace: { path: '/workspace/new', entries: [] } },
        }}
        busy={false}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Workspace directory' })).toHaveValue(
      '/workspace/new'
    );
  });
  it('preserves a typed address when a folder observation arrives', () => {
    const chat = fixture();
    const { rerender } = render(<WorkspaceBrowser chat={chat} busy={false} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace directory' }), {
      target: { value: '/workspace/my-next-folder' },
    });
    rerender(
      <WorkspaceBrowser
        chat={{
          ...chat,
          serverState: { ...chat.serverState!, workspace: { path: '/workspace/new', entries: [] } },
        }}
        busy={false}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Workspace directory' })).toHaveValue(
      '/workspace/my-next-folder'
    );
  });
  it.each([false, true])(
    'returns focus after opening a folder without stealing it (moved: %s)',
    (moved) => {
      const chat = fixture();
      const { rerender } = render(<WorkspaceBrowser chat={chat} busy={false} />);
      const folder = screen.getByRole('button', { name: 'drafts' });
      folder.focus();
      fireEvent.click(folder);
      const browse = screen.getByRole('button', { name: 'Browse' });
      if (moved) browse.focus();
      rerender(
        <WorkspaceBrowser
          chat={{
            ...chat,
            serverState: {
              ...chat.serverState!,
              workspace: { path: '/workspace/reports/drafts', entries: [] },
            },
          }}
          busy={false}
        />
      );
      expect(
        moved ? browse : screen.getByRole('textbox', { name: 'Workspace directory' })
      ).toHaveFocus();
    }
  );
  it('clears a file search with Escape before bubbling a second Escape to the panel', () => {
    const chat = fixture();
    chat.serverState!.workspace!.entries = Array.from({ length: 6 }, (_, i) => ({
      name: `report-${i}.txt`,
      path: `/workspace/reports/report-${i}.txt`,
      type: 'file',
      size_bytes: 1,
    }));
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <WorkspaceBrowser chat={chat} busy={false} />
      </div>
    );
    const search = screen.getByRole('searchbox', { name: 'Filter workspace files' });
    search.focus();
    fireEvent.change(search, { target: { value: 'missing' } });
    fireEvent.keyDown(search, { key: 'Escape', isComposing: true });
    expect(search).toHaveValue('missing');
    onKeyDown.mockClear();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('list', { name: 'Workspace files' })).getAllByRole('button')
    ).toHaveLength(6);
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
  it('clears the previous folder search only when the observed folder changes', () => {
    const chat = fixture();
    chat.serverState!.workspace!.entries = Array.from({ length: 6 }, (_, i) => ({
      name: `report-${i}.txt`,
      path: `/workspace/reports/report-${i}.txt`,
      type: 'file',
      size_bytes: 1,
    }));
    const { rerender } = render(<WorkspaceBrowser chat={chat} busy={false} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter workspace files' }), {
      target: { value: 'report-2' },
    });
    rerender(<WorkspaceBrowser chat={{ ...chat }} busy={false} />);
    expect(screen.getByRole('searchbox', { name: 'Filter workspace files' })).toHaveValue(
      'report-2'
    );
    rerender(
      <WorkspaceBrowser
        chat={{
          ...chat,
          serverState: {
            ...chat.serverState!,
            workspace: { path: '/workspace/new', entries: chat.serverState!.workspace!.entries },
          },
        }}
        busy={false}
      />
    );
    expect(screen.getByRole('searchbox', { name: 'Filter workspace files' })).toHaveValue('');
  });
  it('submits a directory with Enter and rejects traversal before sending', async () => {
    render(<WorkspaceBrowser chat={fixture()} busy={false} />);
    const input = screen.getByRole('textbox', { name: 'Workspace directory' });
    fireEvent.change(input, { target: { value: '/workspace/../etc' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('under /workspace');
    expect(durableChatController.workspace).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: ' /workspace//new/ ' } });
    fireEvent.submit(input.closest('form')!);
    expect(durableChatController.workspace).toHaveBeenCalledWith('chat', 'list', '/workspace/new');
    expect(screen.getByRole('navigation', { name: 'Workspace folders' })).toHaveTextContent(
      'reports'
    );
  });
  it('sorts folders first, navigates to parents and collects files', () => {
    render(<WorkspaceBrowser chat={fixture()} busy={false} />);
    const list = screen.getByRole('list', { name: 'Workspace files' });
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('drafts');
    fireEvent.click(screen.getByRole('button', { name: 'drafts' }));
    expect(durableChatController.workspace).toHaveBeenLastCalledWith(
      'chat',
      'list',
      '/workspace/reports/drafts'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Parent directory' }));
    expect(durableChatController.workspace).toHaveBeenLastCalledWith('chat', 'list', '/workspace');
    fireEvent.click(screen.getByRole('button', { name: 'report.txt' }));
    expect(durableChatController.workspace).toHaveBeenLastCalledWith(
      'chat',
      'read',
      '/workspace/reports/report.txt'
    );
  });
  it('preserves meaningful spaces in observed filenames', () => {
    const chat = fixture();
    chat.serverState!.workspace!.entries = [
      { name: 'report.txt ', path: '/workspace/reports/report.txt ', type: 'file', size_bytes: 20 },
    ];
    render(<WorkspaceBrowser chat={chat} busy={false} />);
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Workspace files' })).getByRole('button')
    );
    expect(durableChatController.workspace).toHaveBeenCalledWith(
      'chat',
      'read',
      '/workspace/reports/report.txt '
    );
  });
  it('filters large folders and disables cached navigation after cleanup', () => {
    const chat = fixture();
    chat.serverState!.workspace!.entries = Array.from({ length: 6 }, (_, i) => ({
      name: `report-${i}.txt`,
      path: `/workspace/report-${i}.txt`,
      type: 'file',
      size_bytes: 1,
    }));
    const { rerender } = render(<WorkspaceBrowser chat={chat} busy={false} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter workspace files' }), {
      target: { value: 'report-2' },
    });
    expect(
      within(screen.getByRole('list', { name: 'Workspace files' })).getAllByRole('button')
    ).toHaveLength(1);
    rerender(
      <WorkspaceBrowser
        chat={{ ...chat, serverState: { ...chat.serverState!, cleanup_verified: true } }}
        busy={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Browse' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'report-2.txt' })).toBeDisabled();
  });
});
