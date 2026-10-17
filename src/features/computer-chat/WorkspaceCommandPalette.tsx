import { useMemo, type ComponentProps } from 'react';
import { CommandPalette } from '../../components/CommandPalette';
import { useAuthStore } from '../../stores/auth';
import { useComputerChatsStore } from './store';
import { conversationStatus } from './presentation';
import { selectChats } from './library';
import type { ChatConnection, ComputerChat } from './types';

const EMPTY_CHATS: ComputerChat[] = [];
const EMPTY_CONNECTIONS: Record<string, ChatConnection> = {};

/** Keep private conversation summaries scoped, and subscribe only while searching. */
export function WorkspaceCommandPalette(
  props: Omit<ComponentProps<typeof CommandPalette>, 'chats'>
) {
  const tenantId = useAuthStore((state) => state.tenant?.id);
  const brandId = useAuthStore((state) => state.currentBrand?.id);
  const chats = useComputerChatsStore((state) => (props.isOpen ? state.chats : EMPTY_CHATS));
  const connections = useComputerChatsStore((state) =>
    props.isOpen ? state.connections : EMPTY_CONNECTIONS
  );
  const options = useMemo(
    () =>
      [
        ...selectChats(chats, tenantId, brandId),
        ...selectChats(chats, tenantId, brandId, '', 'archived'),
      ].map((chat) => ({
        id: chat.id,
        title: chat.title,
        archived: chat.archived,
        status: conversationStatus(chat, connections[chat.id]).label,
      })),
    [chats, tenantId, brandId, connections]
  );
  return <CommandPalette {...props} chats={options} />;
}
