import { describe, it, expect } from 'vitest';
import { getGreeting, formatUptime, formatCompactNumber } from './format';

describe('getGreeting', () => {
  const at = (hour: number) => new Date(2026, 5, 10, hour, 0, 0);

  it('returns good morning between 5am and noon', () => {
    expect(getGreeting(at(5))).toBe('Good morning');
    expect(getGreeting(at(11))).toBe('Good morning');
  });

  it('returns good afternoon between noon and 5pm', () => {
    expect(getGreeting(at(12))).toBe('Good afternoon');
    expect(getGreeting(at(16))).toBe('Good afternoon');
  });

  it('returns good evening from 5pm onward and overnight', () => {
    expect(getGreeting(at(17))).toBe('Good evening');
    expect(getGreeting(at(20))).toBe('Good evening');
    expect(getGreeting(at(23))).toBe('Good evening');
    expect(getGreeting(at(2))).toBe('Good evening');
  });
});

describe('formatUptime', () => {
  it('formats seconds', () => {
    expect(formatUptime(45)).toBe('45s');
  });

  it('formats minutes', () => {
    expect(formatUptime(120)).toBe('2m');
    expect(formatUptime(3599)).toBe('59m');
  });

  it('formats hours and minutes', () => {
    expect(formatUptime(3600)).toBe('1h 0m');
    expect(formatUptime(7320)).toBe('2h 2m');
  });

  it('formats days and hours', () => {
    expect(formatUptime(86400)).toBe('1d 0h');
    expect(formatUptime(90000)).toBe('1d 1h');
  });
});

describe('formatCompactNumber', () => {
  it('keeps small numbers as-is', () => {
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('formats thousands', () => {
    expect(formatCompactNumber(4000)).toBe('4.0K');
    expect(formatCompactNumber(1500)).toBe('1.5K');
  });

  it('formats millions', () => {
    expect(formatCompactNumber(2_500_000)).toBe('2.5M');
  });
});
