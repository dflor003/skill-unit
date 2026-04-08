import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '../../src/core/logger.js';

describe('createLogger', () => {
  let writeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeSpy = vi.fn();
    createLogger.setLevel('info');
  });

  it('creates a logger with all level methods', () => {
    const log = createLogger('test');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.verbose).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.success).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('respects log level filtering', () => {
    createLogger.setLevel('warn');
    const log = createLogger('test', {
      stream: { write: writeSpy, isTTY: false } as any,
    });

    log.info('should be hidden');
    expect(writeSpy).not.toHaveBeenCalled();

    log.warn('should be visible');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('includes scope in output', () => {
    const log = createLogger('myScope', {
      stream: { write: writeSpy, isTTY: false } as any,
    });
    log.info('hello');
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('myScope');
    expect(output).toContain('hello');
  });
});

describe('setLevel', () => {
  it('updates global log level', () => {
    createLogger.setLevel('debug');
    const writeSpy = vi.fn();
    const log = createLogger('test', {
      stream: { write: writeSpy, isTTY: false } as any,
    });
    log.debug('visible');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
