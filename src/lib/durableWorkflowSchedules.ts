import type {
  DurableWorkflowSchedule,
  DurableWorkflowScheduleFrequency,
} from '../stores/durableWorkflows';
import { isDurableWorkflowTerminal } from './durableWorkflowStatus';

export function nextScheduledRun(
  currentRunAt: string,
  frequency: DurableWorkflowScheduleFrequency,
  now = new Date()
): string | null {
  if (frequency === 'once') return null;
  const next = new Date(currentRunAt);
  if (Number.isNaN(next.getTime())) throw new Error('The scheduled run time is invalid.');
  const days = frequency === 'daily' ? 1 : 7;
  do {
    next.setDate(next.getDate() + days);
  } while (next.getTime() <= now.getTime());
  return next.toISOString();
}

export function localDateTimeInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function scheduleDescription(schedule: DurableWorkflowSchedule): string {
  if (!schedule.enabled && schedule.lastRunAt && schedule.frequency === 'once') return 'Completed';
  if (!schedule.enabled) return 'Paused';
  const next = new Date(schedule.nextRunAt);
  if (Number.isNaN(next.getTime())) return 'Invalid schedule';
  const recurrence = schedule.frequency === 'once' ? 'Once' : schedule.frequency;
  return `${recurrence} · ${next.toLocaleString()}`;
}

export function shouldWaitForPreviousRun(
  schedule: DurableWorkflowSchedule,
  previousStatus?: string
): boolean {
  return Boolean(
    !schedule.allowOverlap && previousStatus && !isDurableWorkflowTerminal(previousStatus)
  );
}
