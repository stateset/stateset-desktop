import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ChatMessageBubble } from '../chat-playground/components/ChatMessageBubble';
import { ToolActivityBubble } from '../chat-playground/components/ToolActivityBubble';
import type { ChatMessage } from '../../types';
import type { ComputerChat } from './types';

const Message = memo(function Message({ message }: { message: ChatMessage }) {
  return message.role === 'tool' ? (
    <ToolActivityBubble message={message} />
  ) : (
    <ChatMessageBubble message={message} />
  );
});

/** Keep long transcripts responsive and preserve the reader's scroll position. */
export function ConversationTranscript({
  chat,
  emptyMessage,
}: {
  chat: ComputerChat;
  emptyMessage?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const olderButton = useRef<HTMLButtonElement>(null);
  const latestButton = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(100);
  const [following, setFollowing] = useState(true);
  const followLatest = useRef(true);
  const firstVisible = useRef<string>();
  const lastRead = useRef(chat.messages[chat.messages.length - 1]?.id);
  const prependPosition = useRef<{ height: number; top: number }>();
  const restoreFocus = useRef(false);
  const updateDescription = useId();
  const defaultStart = Math.max(0, chat.messages.length - visible);
  // Keep the first displayed message mounted while the reader is away from the
  // end. A trailing slice would otherwise evict it whenever new output arrives.
  const anchor = chat.messages.findIndex((message) => message.id === firstVisible.current);
  const start = following ? defaultStart : Math.min(Math.max(0, anchor), defaultStart);
  const messages = chat.messages.slice(start);
  const readIndex = chat.messages.findIndex((message) => message.id === lastRead.current);
  const newCount = following ? 0 : chat.messages.length - readIndex - 1;
  const updateLabel = `${newCount} new ${newCount === 1 ? 'message' : 'messages'} below`;
  const status = chat.serverState?.status;
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    firstVisible.current = chat.messages[start]?.id;
    followLatest.current = following;
    if (following) lastRead.current = chat.messages[chat.messages.length - 1]?.id;
    if (prependPosition.current) {
      const previous = prependPosition.current;
      element.scrollTop = previous.top + element.scrollHeight - previous.height;
      prependPosition.current = undefined;
    } else if (following) {
      element.scrollTop = element.scrollHeight;
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      element.focus({ preventScroll: true });
    }
  }, [chat.messages, start, visible, following]);
  useLayoutEffect(() => {
    const element = container.current;
    const column = content.current;
    if (!element || !column || typeof ResizeObserver === 'undefined') return;
    // Images, expanded tool results and window resizing can change the layout
    // after the messages render. Follow only while the reader is at the end.
    const observer = new ResizeObserver(() => {
      if (followLatest.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(column);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const showOlder = () => {
    const element = container.current;
    if (element) prependPosition.current = { height: element.scrollHeight, top: element.scrollTop };
    restoreFocus.current = start <= 100 && document.activeElement === olderButton.current;
    setFollowing(false);
    setVisible(chat.messages.length - Math.max(0, start - 100));
  };
  const jumpToLatest = () => {
    restoreFocus.current = document.activeElement === latestButton.current;
    setFollowing(true);
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        className="chat-transcript flex-1 overflow-y-auto"
        role="region"
        tabIndex={0}
        aria-label="Chat transcript"
        onScroll={(e) => {
          const element = e.currentTarget;
          setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
        }}
      >
        <div ref={content} className="chat-reading-column space-y-7">
          {start > 0 && (
            <button
              ref={olderButton}
              type="button"
              onClick={showOlder}
              className="minimal-secondary-button mx-auto block text-xs"
            >
              Show older messages ({start})
            </button>
          )}
          {chat.historyTruncated && (
            <p className="text-xs text-gray-500">
              Showing the retained local history. Some older observations are unavailable.
            </p>
          )}
          {chat.archived && (
            <p className="text-xs text-amber-300">
              This chat is archived. Its computer continues until you stop it.
            </p>
          )}
          {!chat.messages.length && (
            <p className="text-sm text-gray-500">
              {emptyMessage ??
                'Describe the task and the files you want delivered. The agent will use this computer and your configured acceptance criteria.'}
            </p>
          )}
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {status && ['thinking', 'provisioning'].includes(status) && (
            <p role="status" className="text-xs text-brand-400">
              {status === 'provisioning'
                ? 'Preparing your computer…'
                : 'Agent is working in its workflow…'}
            </p>
          )}
        </div>
      </div>
      <p id={updateDescription} role="status" aria-atomic="true" className="sr-only">
        {newCount > 0 ? updateLabel : ''}
      </p>
      {!following && (
        <button
          ref={latestButton}
          type="button"
          onClick={jumpToLatest}
          aria-describedby={newCount > 0 ? updateDescription : undefined}
          title={newCount > 0 ? updateLabel : undefined}
          className="minimal-primary-button absolute bottom-3 right-4 text-xs shadow-lg"
        >
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
          Jump to latest
          {newCount > 0 && (
            <span
              aria-hidden="true"
              className="rounded-full border border-current px-1.5 text-[10px] leading-4"
            >
              {newCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
