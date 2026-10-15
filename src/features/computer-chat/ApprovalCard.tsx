import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { durableChatController } from './durable';
import { useComputerChatsStore } from './store';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import {
  APPROVAL_DURATION_MS,
  approvalUnavailable,
  approvalVersion,
  supportedReplacement,
} from './approvals';
import type { ComputerChat } from './types';

interface ApprovalCardProps {
  chat: ComputerChat;
  busy: boolean;
  onRestoreFocus?: () => void;
}

export function ApprovalCard({ chat, busy, onRestoreFocus }: ApprovalCardProps) {
  if (!chat.serverState?.pending_action || chat.serverState.status !== 'awaiting_approval')
    return null;
  return (
    <ActionReview
      key={approvalVersion(chat)}
      chat={chat}
      busy={busy}
      onRestoreFocus={onRestoreFocus}
    />
  );
}

function ActionReview({ chat, busy, onRestoreFocus }: ApprovalCardProps) {
  const [acceptRewrite, setAcceptRewrite] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [task, setTask] = useState<'review' | 'refresh'>();
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const alive = useRef(true);
  const region = useRef<HTMLElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const ownedFocus = useRef(false);
  const connection = useComputerChatsStore((state) => state.connections[chat.id]?.status);
  const engineUrl = useDurableWorkflowsStore((state) => state.engineUrl);
  const mismatch = chat.durableSession?.engineUrl !== engineUrl;
  const action = chat.serverState!.pending_action!;
  const policy = action.admission;
  const version = approvalVersion(chat);
  const rewrite = policy?.final_verdict === 'rewrite';
  const unavailable = approvalUnavailable(chat, now);
  const disconnected = !online || connection !== 'connected';
  const reason =
    unavailable ??
    (mismatch
      ? 'Restore this conversation’s workflow connection before reviewing.'
      : disconnected
        ? 'Reconnect and refresh before reviewing this action.'
        : undefined);
  const unsupported = rewrite && !supportedReplacement(chat);
  const seconds = Math.max(
    0,
    Math.ceil((action.review_started_ms + APPROVAL_DURATION_MS - now) / 1000)
  );

  useLayoutEffect(() => {
    const element = region.current;
    if (!element) return;
    const focused = (event: FocusEvent) => {
      ownedFocus.current = event.target instanceof Node && element.contains(event.target);
    };
    const pointed = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target))
        ownedFocus.current = false;
    };
    document.addEventListener('focusin', focused);
    document.addEventListener('pointerdown', pointed);
    return () => {
      document.removeEventListener('focusin', focused);
      document.removeEventListener('pointerdown', pointed);
      const restore =
        element.contains(document.activeElement) || (ownedFocus.current && inFlight.current);
      if (restore && onRestoreFocus)
        queueMicrotask(() => {
          if (document.activeElement === document.body || !document.activeElement?.isConnected)
            onRestoreFocus();
        });
    };
  }, [onRestoreFocus]);

  useLayoutEffect(() => {
    if (!reason || !ownedFocus.current) return;
    const focused = document.activeElement;
    if (
      focused === document.body ||
      !focused?.isConnected ||
      (region.current?.contains(focused) && focused.matches(':disabled'))
    ) {
      const target = refreshButton.current;
      (target && !target.disabled ? target : notice.current)?.focus({ preventScroll: true });
    }
  }, [reason]);

  useEffect(() => {
    alive.current = true;
    const update = () => {
      setNow(Date.now());
      setOnline(navigator.onLine !== false);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      alive.current = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    if (unavailable) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [unavailable]);

  const perform = async (kind: 'review' | 'refresh', operation: () => Promise<void>) => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setTask(kind);
    setError(undefined);
    try {
      await operation();
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      if (alive.current) setTask(undefined);
    }
  };
  const submit = (approved: boolean) => {
    if (reason) return;
    return perform('review', () =>
      durableChatController.review(chat.id, version, approved, approved && acceptRewrite)
    );
  };
  const working = busy || Boolean(task);
  return (
    <section
      ref={region}
      id={`chat-approval-${chat.id}`}
      aria-label="Action approval"
      className="chat-approval"
    >
      <div className="chat-approval-heading">
        <h2 tabIndex={-1}>
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Review action
        </h2>
        {!unavailable && (
          <>
            <span
              aria-hidden="true"
              title={new Date(action.review_started_ms + APPROVAL_DURATION_MS).toLocaleString()}
            >
              Expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
            <time
              className="sr-only"
              dateTime={new Date(action.review_started_ms + APPROVAL_DURATION_MS).toISOString()}
            >
              Approval deadline:{' '}
              {new Date(action.review_started_ms + APPROVAL_DURATION_MS).toLocaleString()}
            </time>
          </>
        )}
      </div>
      <p className="chat-approval-muted">
        {action.name.replace(/_/g, ' ')} · Your decision applies only to this action.
      </p>
      <pre aria-label="Requested action" tabIndex={0}>
        {JSON.stringify(action.command ?? action.arguments)}
      </pre>
      {policy?.evaluation.triggered_rules.map((rule, index) => (
        <p key={index}>{rule.reason}</p>
      ))}
      {rewrite && (
        <>
          <h3>Proposed replacement</h3>
          <pre aria-label="Proposed replacement" tabIndex={0}>
            {JSON.stringify(policy?.evaluation.rewritten_action)}
          </pre>
          <p className="chat-approval-muted">
            Accepting sends this replacement through policy evaluation again.
          </p>
          <label className="chat-approval-consent">
            <input
              type="checkbox"
              checked={acceptRewrite}
              disabled={working || Boolean(reason) || unsupported}
              onChange={(event) => setAcceptRewrite(event.target.checked)}
            />
            I accept this exact replacement for evaluation
          </label>
        </>
      )}
      <p
        ref={notice}
        tabIndex={-1}
        role="status"
        aria-atomic="true"
        className="chat-approval-notice"
      >
        {reason ??
          (unsupported
            ? 'This replacement cannot be accepted. Reject the action or refresh its status.'
            : 'Approval expires ten minutes after the workflow requests review.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="minimal-primary-button"
          disabled={working || Boolean(reason) || (rewrite && (!acceptRewrite || unsupported))}
          onClick={() => void submit(true)}
        >
          {rewrite ? 'Accept replacement' : 'Approve action'}
        </button>
        <button
          type="button"
          className="minimal-secondary-button"
          disabled={working || Boolean(reason)}
          onClick={() => void submit(false)}
        >
          Reject action
        </button>
        {reason && (
          <button
            ref={refreshButton}
            type="button"
            className="minimal-secondary-button"
            disabled={working || !online || mismatch}
            onClick={() => void perform('refresh', () => durableChatController.refresh(chat.id))}
          >
            {task === 'refresh' ? 'Checking status…' : 'Refresh status'}
          </button>
        )}
      </div>
      {task === 'review' && <p role="status">Submitting review…</p>}
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      <details className="chat-approval-muted">
        <summary>Policy evidence</summary>
        <p className="break-all">
          Action hash: {policy?.evaluation.canonical_action_hash || 'Unavailable'}
        </p>
        {policy?.evidence_ids.map((id) => (
          <p className="break-all" key={id}>
            {id}
          </p>
        ))}
      </details>
    </section>
  );
}
