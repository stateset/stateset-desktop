import { ChatPlayground } from '../features/chat-playground';
import { usePageTitle } from '../hooks/usePageTitle';

export default function ChatPlaygroundPage() {
  usePageTitle('Chat Playground');
  return <ChatPlayground />;
}
