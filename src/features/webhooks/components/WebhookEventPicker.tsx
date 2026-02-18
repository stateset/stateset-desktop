import clsx from 'clsx';

const WEBHOOK_EVENTS = [
  { id: 'agent.started', label: 'Agent Started', group: 'Agent' },
  { id: 'agent.stopped', label: 'Agent Stopped', group: 'Agent' },
  { id: 'agent.failed', label: 'Agent Failed', group: 'Agent' },
  { id: 'agent.message', label: 'Agent Message', group: 'Agent' },
  { id: 'agent.tool_call', label: 'Tool Call', group: 'Agent' },
  { id: 'session.created', label: 'Session Created', group: 'Session' },
  { id: 'session.deleted', label: 'Session Deleted', group: 'Session' },
  { id: 'order.created', label: 'Order Created', group: 'Commerce' },
  { id: 'order.updated', label: 'Order Updated', group: 'Commerce' },
  { id: 'ticket.created', label: 'Ticket Created', group: 'Support' },
  { id: 'ticket.resolved', label: 'Ticket Resolved', group: 'Support' },
];

interface WebhookEventPickerProps {
  selected: string[];
  onChange: (events: string[]) => void;
}

export function WebhookEventPicker({ selected, onChange }: WebhookEventPickerProps) {
  const groups = Array.from(new Set(WEBHOOK_EVENTS.map((e) => e.group)));

  const toggle = (eventId: string) => {
    if (selected.includes(eventId)) {
      onChange(selected.filter((e) => e !== eventId));
    } else {
      onChange([...selected, eventId]);
    }
  };

  const toggleGroup = (group: string) => {
    const groupEvents = WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => e.id);
    const allSelected = groupEvents.every((e) => selected.includes(e));
    if (allSelected) {
      onChange(selected.filter((e) => !groupEvents.includes(e)));
    } else {
      onChange([...new Set([...selected, ...groupEvents])]);
    }
  };

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const groupEvents = WEBHOOK_EVENTS.filter((e) => e.group === group);
        const allSelected = groupEvents.every((e) => selected.includes(e.id));

        return (
          <div key={group}>
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className={clsx(
                'text-xs font-semibold uppercase tracking-wider mb-1.5 cursor-pointer',
                allSelected ? 'text-brand-400' : 'text-gray-500'
              )}
            >
              {group}
            </button>
            <div className="flex flex-wrap gap-1.5">
              {groupEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => toggle(event.id)}
                  className={clsx(
                    'px-2.5 py-1 text-xs rounded-lg border transition-colors',
                    selected.includes(event.id)
                      ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  )}
                >
                  {event.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
