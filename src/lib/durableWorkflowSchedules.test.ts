import { describe, expect, it } from 'vitest';
import {
  localDateTimeInputValue,
  nextScheduledRun,
  shouldWaitForPreviousRun,
} from './durableWorkflowSchedules';

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
