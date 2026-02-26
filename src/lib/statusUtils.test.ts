import { describe, it, expect } from 'vitest';
import {
  getStatusStyle,
  getStatusDotColor,
  getStatusBadgeClasses,
  getStatusTextColor,
  getStatusText,
  isActiveStatus,
  canStart,
  canStop,
} from './statusUtils';
import type { AgentSessionStatus } from '../types';

describe('status utils', () => {
  const statuses: AgentSessionStatus[] = [
    'starting',
    'running',
    'paused',
    'stopping',
    'stopped',
    'failed',
  ];

  it('returns styles for all known statuses', () => {
    statuses.forEach((status) => {
      const style = getStatusStyle(status);
      expect(style.bg).toContain('bg-');
      expect(style.text).toContain('text-');
      expect(style.dot).toContain('bg-');
      expect(style.badge.length).toBeGreaterThan(0);
    });
  });

  it('returns style-derived helpers', () => {
    expect(getStatusDotColor('running')).toBe(getStatusStyle('running').dot);
    expect(getStatusBadgeClasses('failed')).toBe(getStatusStyle('failed').badge);
    expect(getStatusTextColor('paused')).toBe(getStatusStyle('paused').text);
  });

  it('maps status text labels', () => {
    expect(getStatusText('starting')).toBe('Starting');
    expect(getStatusText('running')).toBe('Running');
    expect(getStatusText('paused')).toBe('Paused');
    expect(getStatusText('stopping')).toBe('Stopping');
    expect(getStatusText('stopped')).toBe('Stopped');
    expect(getStatusText('failed')).toBe('Failed');
  });

  it('identifies active statuses', () => {
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('paused')).toBe(true);
    expect(isActiveStatus('stopped')).toBe(false);
  });

  it('identifies startable statuses', () => {
    expect(canStart('stopped')).toBe(true);
    expect(canStart('failed')).toBe(true);
    expect(canStart('running')).toBe(false);
  });

  it('identifies stoppable statuses', () => {
    expect(canStop('running')).toBe(true);
    expect(canStop('paused')).toBe(true);
    expect(canStop('starting')).toBe(false);
    expect(canStop('stopped')).toBe(false);
  });
});
