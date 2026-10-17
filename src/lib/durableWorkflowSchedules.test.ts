import { describe, expect, it } from 'vitest';
import {
  localDateTimeInputValue,
  nextScheduledRun,
  scheduleDescription,
  shouldWaitForPreviousRun,
} from './durableWorkflowSchedules';
import type { DurableWorkflowSchedule } from '../stores/durableWorkflows';

const schedule: DurableWorkflowSchedule = {
  id: 'schedule-one',
  name: 'Inventory',
  tenantId: 'tenant-1',
  brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
  goal: 'Inventory',
  definition: {
    steps: [['run']],
    activeWindowSeconds: 3600,
    maxFailures: 3,
    perCommandTimeoutSeconds: 300,
  },
  frequency: 'once',
  nextRunAt: '2026-09-01T09:00:00.000Z',
  enabled: false,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  lastRunAt: '2026-09-01T09:00:01.000Z',
};

const pendingOccurrence = {
  requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
  dueAt: schedule.nextRunAt,
  engineUrl: 'https://api.workstream.stateset.com',
  tenantId: schedule.tenantId,
  brandId: schedule.brandId,
  goal: schedule.goal,
  definition: schedule.definition,
  claimedAt: schedule.lastRunAt!,
  workflowId:
    'active-horizon-agent-29324d3095714f50bbc217b214b74ec7-0aa616a812414b8aa3ae2f79fa72b1e7',
  submitted: true,
};

describe('durable workflow schedules', () => {
  it('advances missed recurring schedules to the first future occurrence', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    expect(nextScheduledRun('2026-09-01T13:00:00.000Z', 'daily', now)).toBe(
      '2026-09-04T13:00:00.000Z'
    );
    expect(nextScheduledRun('2026-08-25T13:00:00.000Z', 'weekly', now)).toBe(
      '2026-09-08T13:00:00.000Z'
    );
    expect(nextScheduledRun('2026-09-01T13:00:00.000Z', 'once', now)).toBeNull();
  });

  it('formats dates for a local datetime input without changing wall-clock fields', () => {
    const date = new Date(2026, 8, 1, 9, 30);
    expect(localDateTimeInputValue(date)).toBe('2026-09-01T09:30');
  });

  it('keeps unconfirmed launches distinct from a paused or successfully launched run', () => {
    expect(scheduleDescription({ ...schedule, pendingOccurrence })).toBe(
      'Launch confirmation pending'
    );
    expect(
      scheduleDescription({
        ...schedule,
        pendingOccurrence: { ...pendingOccurrence, needsAttention: true },
      })
    ).toBe('Launch confirmation needs attention');
    expect(
      scheduleDescription({
        ...schedule,
        pendingOccurrence: { ...pendingOccurrence, submitted: false },
      })
    ).toBe('Preparing scheduled run');
    expect(
      scheduleDescription({
        ...schedule,
        pendingOccurrence: { ...pendingOccurrence, submitted: false, needsAttention: true },
      })
    ).toBe('Scheduled run needs attention');
    expect(scheduleDescription(schedule)).toBe('Launch not confirmed');
    expect(scheduleDescription({ ...schedule, lastWorkflowId: pendingOccurrence.workflowId })).toBe(
      'Run launched'
    );
    expect(scheduleDescription({ ...schedule, lastRunAt: undefined })).toBe('Paused');
  });

  it('waits for an active prior run unless overlap is explicitly allowed', () => {
    const schedule = {
      id: 'schedule-one',
      name: 'Sequential schedule',
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      goal: 'Do work',
      definition: {
        steps: [['run']],
        activeWindowSeconds: 3600,
        maxFailures: 3,
        perCommandTimeoutSeconds: 300,
      },
      frequency: 'daily' as const,
      nextRunAt: '2026-09-01T09:00:00.000Z',
      enabled: true,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
    };

    expect(shouldWaitForPreviousRun(schedule, 'running')).toBe(true);
    expect(shouldWaitForPreviousRun({ ...schedule, allowOverlap: true }, 'running')).toBe(false);
    expect(shouldWaitForPreviousRun(schedule, 'terminated')).toBe(false);
  });
});
