import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { describeChatIssue } from './chatIssue';
import type { ComputerChat } from './types';

export function ChatIssueNotice({
  chat,
  busy,
  onSettings,
  onReviewFile,
}: {
  chat: ComputerChat;
  busy: boolean;
  onSettings: () => void;
  onReviewFile: () => void;
}) {
  const titleId = useId();
  if (!chat.error) return null;
  const issue = describeChatIssue(chat.errorCode);
  const canAct = !busy && !chat.stopped && !chat.sandboxStopRequested;
  return (
    <section role="alert" aria-labelledby={titleId} className="chat-issue-notice">
      <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <h3 id={titleId} className="chat-issue-title">
          {issue.title}
        </h3>
        <p>{issue.guidance}</p>
        {canAct && issue.action === 'connection' && (
          <button type="button" className="minimal-secondary-button" onClick={onSettings}>
            Connection settings
          </button>
        )}
        {canAct && !chat.pending && issue.action === 'file' && (
          <button type="button" className="minimal-secondary-button" onClick={onReviewFile}>
            Review file check
          </button>
        )}
        <details className="chat-issue-details">
          <summary>Technical details</summary>
          <pre tabIndex={0}>{chat.error.slice(0, 2000)}</pre>
          {chat.error.length > 2000 && <p>Details shortened.</p>}
        </details>
      </div>
    </section>
  );
}
