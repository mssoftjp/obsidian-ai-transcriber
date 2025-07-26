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
		return mainLogger.moduleLoggers.get(moduleName)!;
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
	error(message: string, error?: Error | any): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			const formattedMsg = this.formatMessage(LogLevel.ERROR, message);
			if (error) {
				console.error(formattedMsg, error);
				// Always show stack trace for errors, regardless of debug mode
				if (error.stack) {
					console.error('Stack trace:', error.stack);
				}
			} else {
				console.error(formattedMsg);
			}
		}
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, data?: any): void {
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
	info(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.INFO)) {
			const formattedMsg = this.formatMessage(LogLevel.INFO, message);
			if (data !== undefined) {
				console.log(formattedMsg, data);
			} else {
				console.log(formattedMsg);
			}
		}
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			const formattedMsg = this.formatMessage(LogLevel.DEBUG, message);
			if (data !== undefined) {
				console.log(formattedMsg, data);
			} else {
				console.log(formattedMsg);
			}
		}
	}

	/**
	 * Log a trace message (most verbose)
	 */
	trace(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.TRACE)) {
			const formattedMsg = this.formatMessage(LogLevel.TRACE, message);
			if (data !== undefined) {
				console.log(formattedMsg, data);
			} else {
				console.log(formattedMsg);
			}
		}
	}

	/**
	 * Log method entry (for tracing execution flow)
	 */
	enter(methodName: string, params?: any): void {
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
	exit(methodName: string, result?: any): void {
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
		if (this.shouldLog(LogLevel.DEBUG)) {
			// eslint-disable-next-line no-console
			console.time(`${this.config.prefix} ${label}`);
		}
	}

	/**
	 * End performance timing
	 */
	timeEnd(label: string): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			// eslint-disable-next-line no-console
			console.timeEnd(`${this.config.prefix} ${label}`);
		}
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
}

// Export convenience functions
export const logger = Logger.getInstance();
export const getLogger = Logger.getLogger;