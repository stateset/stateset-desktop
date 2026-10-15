import { memo, useLayoutEffect, useRef, useState } from 'react';
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
export function ConversationTranscript({ chat }: { chat: ComputerChat }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(100);
  const [following, setFollowing] = useState(true);
  const prependHeight = useRef<number>();
  const messages = chat.messages.slice(-visible);
  const status = chat.serverState?.status;
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    if (prependHeight.current !== undefined) {
      element.scrollTop += element.scrollHeight - prependHeight.current;
      prependHeight.current = undefined;
    } else if (following) {
      element.scrollTop = element.scrollHeight;
    }
  }, [chat.messages, visible, following]);
  const showOlder = () => {
    prependHeight.current = container.current?.scrollHeight;
    setFollowing(false);
    setVisible((count) => count + 100);
  };
  const jumpToLatest = () => {
    setFollowing(true);
    if (container.current) container.current.scrollTop = container.current.scrollHeight;
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        className="chat-transcript flex-1 overflow-y-auto"
        aria-label="Chat transcript"
        onScroll={(e) => {
          const element = e.currentTarget;
          setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
        }}
      >
        <div className="chat-reading-column space-y-7">
          {chat.messages.length > visible && (
            <button
              type="button"
              onClick={showOlder}
              className="minimal-secondary-button mx-auto block text-xs"
            >
              Show older messages ({chat.messages.length - visible})
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
              Describe the task and the files you want delivered. The agent will use this computer
              and your configured acceptance criteria.
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
      {!following && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="minimal-primary-button absolute bottom-3 right-4 text-xs shadow-lg"
        >
          <ArrowDown className="h-3 w-3" />
          Jump to latest
        </button>
      )}
    </div>
  );
}
