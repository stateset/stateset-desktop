/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatIssueNotice } from './ChatIssueNotice';
import type { ComputerChat } from './types';

afterEach(cleanup);
const chat = { id: 'chat', error: 'Technical failure details' } as ComputerChat;
it('gives provider credits a useful next step without offering to replace a Sandbox key', () => {
  render(
    <ChatIssueNotice
      chat={{ ...chat, errorCode: 'provider-credit' }}
      busy={false}
      onSettings={vi.fn()}
      onReviewFile={vi.fn()}
    />
  );
  expect(screen.getByRole('alert')).toHaveAccessibleName('Model credits need attention');
  expect(screen.getByRole('alert')).toHaveTextContent('Sandbox organization administrator');
  expect(screen.queryByRole('button', { name: 'Connection settings' })).toBeNull();
  expect(screen.getByText('Technical failure details')).not.toBeVisible();
});
it('routes missing policy credentials to connection settings', () => {
  const open = vi.fn();
  render(
    <ChatIssueNotice
      chat={{ ...chat, errorCode: 'policy-key' }}
      busy={false}
      onSettings={open}
      onReviewFile={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connection settings' }));
  expect(open).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert')).toHaveTextContent('Keep policy checks enabled');
});
it('routes proof failures to file review without starting a new check', () => {
  const review = vi.fn();
  render(
    <ChatIssueNotice
      chat={{ ...chat, errorCode: 'policy-proof' }}
      busy={false}
      onSettings={vi.fn()}
      onReviewFile={review}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review file check' }));
  expect(review).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Connection settings' })).toBeNull();
});
it.each([{ busy: true }, { stopped: true }, { sandboxStopRequested: true }, { pending: {} }])(
  'leaves pending and shutdown recovery controls in charge %j',
  (state) => {
    render(
      <ChatIssueNotice
        chat={{ ...chat, errorCode: 'policy-proof', ...state } as ComputerChat}
        busy={Boolean(state.busy)}
        onSettings={vi.fn()}
        onReviewFile={vi.fn()}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  }
);
it('handles legacy errors conservatively and bounds technical previews', () => {
  render(
    <ChatIssueNotice
      chat={{ ...chat, error: 'x'.repeat(5000) }}
      busy={false}
      onSettings={vi.fn()}
      onReviewFile={vi.fn()}
    />
  );
  expect(screen.getByRole('alert')).toHaveAccessibleName('This conversation needs attention');
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('Details shortened.')).toBeInTheDocument();
  expect(screen.getByText('x'.repeat(2000))).not.toBeVisible();
});
