import { ConsoleLogger, type LogEntry } from "lithia/core";
import type { Lithia } from "lithia/types";

/**
 * Integrates Lithia's logger with the Studio for real-time log streaming.
 *
 * This class replaces Lithia's default logger with a ConsoleLogger instance
 * that emits structured log entries to connected Studio clients.
 */
export class LoggerIntegration {
	private lithia: Lithia;
	private onLogEntry?: (entry: LogEntry) => void;

	constructor(lithia: Lithia, onLogEntry?: (entry: LogEntry) => void) {
		this.lithia = lithia;
		this.onLogEntry = onLogEntry;
	}

	/**
	 * Setup logger integration to emit logs to Studio clients.
	 */
	setup(): void {
		const lithiaConsole = {
			log: console.log.bind(console),
			error: console.error.bind(console),
			warn: console.warn.bind(console),
			info: console.info.bind(console),
			debug: console.debug.bind(console),
		} as Console;

		const studioLogger = new ConsoleLogger({
			onLogEntry: (entry: LogEntry) => {
				if (this.onLogEntry) {
					this.onLogEntry(entry);
				}
			},
			console: lithiaConsole,
		});

		// Replace the logger in the Lithia instance
		this.lithia.logger = studioLogger;

		// Test log to verify integration
		this.lithia.logger.info("Lithia Studio logger integration initialized");
	}

	/**
	 * Update the log entry callback.
	 */
	setLogEntryCallback(onLogEntry: (entry: LogEntry) => void): void {
		this.onLogEntry = onLogEntry;
	}
}
