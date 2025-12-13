/**
 * Centralized logging utility for debug output
 * Provides consistent formatting and conditional output based on debugMode
 */

export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3,
	TRACE = 4
}

export interface LoggerConfig {
	debugMode: boolean;
	logLevel?: LogLevel;
	prefix?: string;
}

export class Logger {
	private static instance: Logger | null = null;
	private config: LoggerConfig = {
		debugMode: false,
		logLevel: LogLevel.INFO,
		prefix: '[AI Transcriber]'
	};
	private moduleLoggers: Map<string, Logger> = new Map();
	private timers: Map<string, number> = new Map();
	private static readonly MAX_MODULE_LOGGERS = 100; // Prevent unbounded growth

	private constructor(config?: Partial<LoggerConfig>) {
		if (config) {
			this.updateConfig(config);
		}
	}

	/**
	 * Get or create the singleton logger instance
	 */
	static getInstance(config?: Partial<LoggerConfig>): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger(config);
		} else if (config) {
			Logger.instance.updateConfig(config);
		}
		return Logger.instance;
	}

	/**
	 * Create a logger for a specific module/component
	 */
	static getLogger(moduleName: string): Logger {
		const mainLogger = Logger.getInstance();
		if (!mainLogger.moduleLoggers.has(moduleName)) {
			// Check size limit to prevent memory leaks
			if (mainLogger.moduleLoggers.size >= Logger.MAX_MODULE_LOGGERS) {
				// Clear oldest entries (first 10) when limit is reached
				const entries = Array.from(mainLogger.moduleLoggers.entries());
				entries.slice(0, 10).forEach(([key]) => {
					mainLogger.moduleLoggers.delete(key);
				});
			}

			const moduleLogger = new Logger({
				debugMode: mainLogger.config.debugMode,
				logLevel: mainLogger.config.logLevel,
				prefix: `${mainLogger.config.prefix} [${moduleName}]`
			});
			mainLogger.moduleLoggers.set(moduleName, moduleLogger);
		}
		return mainLogger.moduleLoggers.get(moduleName);
	}

	/**
	 * Update logger configuration
	 */
	updateConfig(config: Partial<LoggerConfig>): void {
		this.config = { ...this.config, ...config };
		// Update all module loggers, preserving their prefixes
		this.moduleLoggers.forEach(logger => {
			logger.updateConfig({
				debugMode: this.config.debugMode,
				logLevel: this.config.logLevel
				// Note: prefix is intentionally not updated to preserve module-specific prefixes
			});
		});
	}

	/**
	 * Check if logging is enabled for a given level
	 */
	private shouldLog(level: LogLevel): boolean {
		if (!this.config.debugMode) {
			// In production mode, only show errors and warnings
			return level <= LogLevel.WARN;
		}
		return level <= (this.config.logLevel ?? LogLevel.INFO);
	}

	/**
	 * Format the log message with timestamp and prefix
	 */
	private formatMessage(level: LogLevel, message: string): string {
		const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
		return `${timestamp} ${LogLevel[level].padEnd(5)} ${this.config.prefix} ${message}`;
	}

	/**
	 * Log an error message
	 */
	error(message: string, error?: unknown): void {
		if (!this.shouldLog(LogLevel.ERROR)) {
			return;
		}
		const formattedMsg = this.formatMessage(LogLevel.ERROR, message);
		if (error instanceof Error) {
			console.error(formattedMsg, error);
			if (error.stack) {
				console.error('Stack trace:', error.stack);
			}
			return;
		}
		if (error !== undefined) {
			console.error(formattedMsg, error);
			return;
		}
		console.error(formattedMsg);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, data?: unknown): void {
		if (this.shouldLog(LogLevel.WARN)) {
			const formattedMsg = this.formatMessage(LogLevel.WARN, message);
			if (data !== undefined) {
				console.warn(formattedMsg, data);
			} else {
				console.warn(formattedMsg);
			}
		}
	}

	/**
	 * Log an info message
	 */
	info(message: string, data?: unknown): void {
		if (!this.shouldLog(LogLevel.INFO)) {
			return;
		}
		const formattedMsg = this.formatMessage(LogLevel.INFO, message);
		this.recordLog(LogLevel.INFO, formattedMsg, data);
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, data?: unknown): void {
		if (!this.shouldLog(LogLevel.DEBUG)) {
			return;
		}
		const formattedMsg = this.formatMessage(LogLevel.DEBUG, message);
		this.recordLog(LogLevel.DEBUG, formattedMsg, data);
	}

	/**
	 * Log a trace message (most verbose)
	 */
	trace(message: string, data?: unknown): void {
		if (!this.shouldLog(LogLevel.TRACE)) {
			return;
		}
		const formattedMsg = this.formatMessage(LogLevel.TRACE, message);
		this.recordLog(LogLevel.TRACE, formattedMsg, data);
	}

	/**
	 * Log method entry (for tracing execution flow)
	 */
	enter(methodName: string, params?: unknown): void {
		if (this.shouldLog(LogLevel.TRACE)) {
			const message = `→ ${methodName}`;
			if (params !== undefined) {
				this.trace(message, params);
			} else {
				this.trace(message);
			}
		}
	}

	/**
	 * Log method exit (for tracing execution flow)
	 */
	exit(methodName: string, result?: unknown): void {
		if (this.shouldLog(LogLevel.TRACE)) {
			const message = `← ${methodName}`;
			if (result !== undefined) {
				this.trace(message, result);
			} else {
				this.trace(message);
			}
		}
	}

	/**
	 * Log performance timing
	 */
	time(label: string): void {
		if (!this.shouldLog(LogLevel.DEBUG)) {
			return;
		}
		const timerKey = `${this.config.prefix} ${label}`;
		this.timers.set(timerKey, this.getTimestamp());
	}

	/**
	 * End performance timing
	 */
	timeEnd(label: string): void {
		if (!this.shouldLog(LogLevel.DEBUG)) {
			return;
		}
		const timerKey = `${this.config.prefix} ${label}`;
		const start = this.timers.get(timerKey);
		if (start === undefined) {
			return;
		}
		const duration = this.getTimestamp() - start;
		this.debug(`${label} completed in ${duration.toFixed(2)}ms`);
		this.timers.delete(timerKey);
	}

	/**
	 * Create a scoped logger for a specific operation
	 */
	scope(scopeName: string): Logger {
		return new Logger({
			debugMode: this.config.debugMode,
			logLevel: this.config.logLevel,
			prefix: `${this.config.prefix} [${scopeName}]`
		});
	}

	private recordLog(level: LogLevel, message: string, data?: unknown): void {
		// Keep lightweight in production; only mirror to console when debugMode is on
		if (this.config.debugMode) {
			const logFn =
				level === LogLevel.TRACE || level === LogLevel.DEBUG
					? console.debug
					: level === LogLevel.INFO
						? console.info
						: console.log;
			if (data !== undefined) {
				logFn(message, data);
			} else {
				logFn(message);
			}
		}

		// Always buffer logs for in-app inspection
		if (typeof window !== 'undefined') {
			const globalObj = window as Window & { __aiTranscriberLogs?: Array<{ level: LogLevel; message: string; data?: unknown }> };
			if (!globalObj.__aiTranscriberLogs) {
				globalObj.__aiTranscriberLogs = [];
			}
			globalObj.__aiTranscriberLogs.push({ level, message, data });
		}
	}

	private getTimestamp(): number {
		if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
			return performance.now();
		}
		return Date.now();
	}
}

// Export convenience functions
export const logger = Logger.getInstance();
export const getLogger = (moduleName: string): Logger => Logger.getLogger(moduleName);
