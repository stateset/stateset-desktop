import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  log,
  initializeLogger,
  getSessionId,
  getLogBuffer,
  clearLogBuffer,
  exportLogsAsJson,
  LogEntry,
} from './logger';

describe('logger', () => {
  beforeEach(() => {
    clearLogBuffer();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeLogger', () => {
    it('should generate a session ID', () => {
      initializeLogger();
      const sessionId = getSessionId();
      expect(sessionId).toBeTruthy();
      expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should clear the log buffer on init', () => {
      log.info('test message');
      expect(getLogBuffer().length).toBeGreaterThan(0);

      initializeLogger();
      // Buffer should only have the init message
      const buffer = getLogBuffer();
      expect(buffer.length).toBe(1);
      expect(buffer[0].message).toBe('Logger initialized');
    });
  });

  describe('log levels', () => {
    it('should log debug messages', () => {
      const entry = log.debug('debug message', { key: 'value' });
      expect(entry.level).toBe('debug');
      expect(entry.message).toBe('debug message');
      expect(entry.metadata?.key).toBe('value');
    });

    it('should log info messages', () => {
      const entry = log.info('info message');
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('info message');
    });

    it('should log warn messages', () => {
      const entry = log.warn('warning message');
      expect(entry.level).toBe('warn');
      expect(entry.message).toBe('warning message');
    });

    it('should log error messages with error object', () => {
      const error = new Error('test error');
      const entry = log.error('error message', error);
      expect(entry.level).toBe('error');
      expect(entry.message).toBe('error message');
      expect(entry.error?.name).toBe('Error');
      expect(entry.error?.message).toBe('test error');
      expect(entry.error?.stack).toBeTruthy();
    });

    it('should handle non-Error objects in error logging', () => {
      const entry = log.error('error message', 'string error');
      expect(entry.error?.name).toBe('UnknownError');
      expect(entry.error?.message).toBe('string error');
    });
  });

  describe('child loggers', () => {
    it('should create child logger with context', () => {
      const childLogger = log.child('TestContext');
      const entry = childLogger.info('child message');
      expect(entry.context).toBe('TestContext');
      expect(entry.message).toBe('child message');
    });

    it('should include default metadata in child logger', () => {
      const childLogger = log.child('TestContext', { component: 'test' });
      const entry = childLogger.info('message', { extra: 'data' });
      expect(entry.metadata?.component).toBe('test');
      expect(entry.metadata?.extra).toBe('data');
    });

    it('should support all log levels in child logger', () => {
      const childLogger = log.child('TestContext');

      expect(childLogger.debug('debug').level).toBe('debug');
      expect(childLogger.info('info').level).toBe('info');
      expect(childLogger.warn('warn').level).toBe('warn');
      expect(childLogger.error('error', new Error('test')).level).toBe('error');
    });
  });

  describe('timing operations', () => {
    it('should time async operations', async () => {
      const result = await log.time('test operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'result';
      });

      expect(result).toBe('result');
      const buffer = getLogBuffer();
      const timingEntry = buffer.find((e) => e.message.includes('test operation'));
      expect(timingEntry).toBeTruthy();
      expect(timingEntry?.duration_ms).toBeGreaterThanOrEqual(40);
    });

    it('should log errors in timed operations', async () => {
      const error = new Error('operation failed');

      await expect(
        log.time('failing operation', async () => {
          throw error;
        })
      ).rejects.toThrow('operation failed');

      const buffer = getLogBuffer();
      const errorEntry = buffer.find(
        (e) => e.level === 'error' && e.message.includes('failing operation')
      );
      expect(errorEntry).toBeTruthy();
      expect(errorEntry?.error?.message).toBe('operation failed');
    });

    it('should time operations in child logger', async () => {
      const childLogger = log.child('TestContext');
      const result = await childLogger.time('child operation', async () => 'done');

      expect(result).toBe('done');
      const buffer = getLogBuffer();
      const entry = buffer.find((e) => e.message.includes('child operation'));
      expect(entry?.context).toBe('TestContext');
    });
  });

  describe('log buffer', () => {
    it('should add entries to buffer', () => {
      log.info('message 1');
      log.info('message 2');
      log.info('message 3');

      const buffer = getLogBuffer();
      expect(buffer.length).toBe(3);
    });

    it('should respect max buffer size', () => {
      // Add more than max entries
      for (let i = 0; i < 1100; i++) {
        log.debug(`message ${i}`);
      }

      const buffer = getLogBuffer();
      expect(buffer.length).toBeLessThanOrEqual(1000);
    });

    it('should clear buffer', () => {
      log.info('message');
      expect(getLogBuffer().length).toBe(1);

      clearLogBuffer();
      expect(getLogBuffer().length).toBe(0);
    });

    it('should return a copy of the buffer', () => {
      log.info('message');
      const buffer1 = getLogBuffer();
      const buffer2 = getLogBuffer();

      expect(buffer1).not.toBe(buffer2);
      expect(buffer1).toEqual(buffer2);
    });
  });

  describe('export', () => {
    it('should export logs as JSON', () => {
      log.info('test message', { key: 'value' });

      const json = exportLogsAsJson();
      const parsed = JSON.parse(json) as LogEntry[];

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].message).toBe('test message');
      expect(parsed[0].metadata?.key).toBe('value');
    });

    it('should include all entry fields in export', () => {
      const error = new Error('test');
      log.error('error message', error, { extra: 'data' });

      const json = exportLogsAsJson();
      const parsed = JSON.parse(json) as LogEntry[];

      const entry = parsed[0];
      expect(entry.timestamp).toBeTruthy();
      expect(entry.level).toBe('error');
      expect(entry.message).toBe('error message');
      expect(entry.error).toBeTruthy();
      expect(entry.metadata?.extra).toBe('data');
    });
  });

  describe('timestamp format', () => {
    it('should use ISO 8601 timestamps', () => {
      const entry = log.info('message');
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });
});
