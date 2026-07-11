import { LogLevel, Logger } from '../../src/utils/Logger';

describe('Logger', () => {
  const originalConsoleDebug = console.debug;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    jest.resetModules();
    console.debug = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    // Reset singleton config
    Logger.getInstance({ debugMode: false, forceConsole: false, logLevel: LogLevel.INFO });
  });

	  afterEach(() => {
	    console.debug = originalConsoleDebug;
	    console.error = originalConsoleError;
	    console.warn = originalConsoleWarn;
	    delete (global as Record<string, unknown>)['window'];
	    delete process.env['AI_TRANSCRIBER_FORCE_CONSOLE'];
	  });

	  it('forces console output in Node environment even when debugMode is false', () => {
	    // Node-like environment (no window)
	    delete (global as Record<string, unknown>)['window'];

    jest.resetModules();
    const { Logger: FreshLogger } = require('../../src/utils/Logger') as typeof import('../../src/utils/Logger');
    const logger = FreshLogger.getInstance({ debugMode: false, logLevel: LogLevel.INFO });

    logger.info('node-info');
    logger.trace('node-trace');

    expect(console.debug).toHaveBeenCalledTimes(1); // info only; trace should be filtered
    expect((console.debug as jest.Mock).mock.calls[0][0]).toContain('node-info');
  });

  it('suppresses info logs when forceConsole=false and debugMode=false (browser-like)', () => {
	    (global as Record<string, unknown>)['window'] = {};
	    jest.resetModules();

    const { Logger: FreshLogger } = require('../../src/utils/Logger') as typeof import('../../src/utils/Logger');
    const logger = FreshLogger.getInstance({ debugMode: false, forceConsole: false, logLevel: LogLevel.INFO });

    logger.info('should-not-log');
    logger.warn('should-log-warn');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect((console.warn as jest.Mock).mock.calls[0][0]).toContain('should-log-warn');
  });

  it('logs debug/info via console.warn in browser-like debugMode for visibility', () => {
    (global as Record<string, unknown>)['window'] = {};
    jest.resetModules();

    const { Logger: FreshLogger } = require('../../src/utils/Logger') as typeof import('../../src/utils/Logger');
    const logger = FreshLogger.getInstance({ debugMode: true, forceConsole: false, logLevel: LogLevel.DEBUG });

    logger.info('visible-info');
    logger.debug('visible-debug');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect((console.warn as jest.Mock).mock.calls[0][0]).toContain('visible-info');
    expect((console.warn as jest.Mock).mock.calls[1][0]).toContain('visible-debug');
  });

  it('buffers warnings and errors with a bounded history for local inspection', () => {
    const browserWindow: {
      __aiTranscriberLogs?: Array<{ level: LogLevel; message: string; data?: unknown }>;
    } = {};
    (global as Record<string, unknown>)['window'] = browserWindow;
    jest.resetModules();

    const { Logger: FreshLogger } = require('../../src/utils/Logger') as typeof import('../../src/utils/Logger');
    const logger = FreshLogger.getInstance({ debugMode: false, forceConsole: false });

    logger.error('failed', new Error('provider unavailable'));
		expect(browserWindow.__aiTranscriberLogs?.[0]).toMatchObject({
			level: LogLevel.ERROR,
			message: expect.stringContaining('failed')
		});
    for (let index = 0; index < 505; index++) {
      logger.warn(`warning-${index}`);
    }

    const logs = browserWindow.__aiTranscriberLogs ?? [];
    expect(logs).toHaveLength(500);
    expect(logs.at(-1)?.message).toContain('warning-504');
    expect(logs.some(entry => entry.message.includes('warning-0'))).toBe(false);
  });
});
