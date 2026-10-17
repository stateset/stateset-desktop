import { DurableComputerChat as ComputerChat } from '../features/computer-chat/DurableComputerChat';
import { usePageTitle } from '../hooks/usePageTitle';

export default function ChatPlaygroundPage() {
  usePageTitle('Computer chats');
  return <ComputerChat />;
}
