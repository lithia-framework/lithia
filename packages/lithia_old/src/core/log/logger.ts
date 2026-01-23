import { bold, green, magenta, red, white, yellow } from "./picocolors";

export interface LogEntry {
	id: string;
	timestamp: Date;
	level:
		| "info"
		| "warn"
		| "error"
		| "debug"
		| "success"
		| "ready"
		| "wait"
		| "event"
		| "trace";
	message: string;
	args?: unknown[];
	source?: string;
	callerInfo?: {
		file: string;
	};
}

export interface Logger {
	info(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	debug(message: string, ...args: unknown[]): void;
	success(message: string, ...args: unknown[]): void;
	ready(message: string, ...args: unknown[]): void;
	wait(message: string, ...args: unknown[]): void;
	event(message: string, ...args: unknown[]): void;
	trace(message: string, ...args: unknown[]): void;
	bootstrap(...message: string[]): void;
	warnOnce(message: string): void;
}

export class ConsoleLogger implements Logger {
	private colors: boolean;
	private debugMode: boolean;
	private onLogEntry?: (entry: LogEntry) => void;
	private console: Console;

	private prefixes = {
		wait: white(bold("○")),
		error: red(bold("⨯")),
		warn: yellow(bold("⚠")),
		ready: "▲",
		info: white(bold(" ")),
		event: green(bold("✓")),
		trace: magenta(bold("»")),
	};

	constructor(options?: {
		debug?: boolean;
		onLogEntry?: (entry: LogEntry) => void;
		console?: Console;
	}) {
		this.colors = true; // Always enabled by default
		this.debugMode = options?.debug || false;
		this.onLogEntry = options?.onLogEntry;
		this.console = options?.console || console;
	}

	private formatMessage(prefix: string, message: string): string {
		const coloredPrefix = this.colors
			? prefix
			: prefix.replace(/\[[0-9;]*m/g, "");
		return ` ${coloredPrefix} ${message}`;
	}

	private shouldLog(level: string): boolean {
		// All levels are allowed except debug/trace when not in debug mode
		if (level === "debug" || level === "trace") {
			return this.debugMode;
		}
		return true;
	}

	private emitLogEntry(
		level: LogEntry["level"],
		message: string,
		args: unknown[],
	): void {
		if (this.onLogEntry) {
			const entry: LogEntry = {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				timestamp: new Date(),
				level,
				message,
				args: args.length > 0 ? args : undefined,
				source: "lithia",
			};
			this.onLogEntry(entry);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("info")) return;
		const formatted = this.formatMessage(this.prefixes.info, message);
		this.console.log(formatted, ...args);
		this.emitLogEntry("info", message, args);
	}

	error(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("error")) return;
		const formatted = this.formatMessage(this.prefixes.error, message);
		this.console.error(formatted, ...args);
		this.emitLogEntry("error", message, args);
	}

	warn(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("warn")) return;
		const formatted = this.formatMessage(this.prefixes.warn, message);
		this.console.warn(formatted, ...args);
		this.emitLogEntry("warn", message, args);
	}

	debug(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("debug")) return;
		const formatted = this.formatMessage(this.prefixes.info, message);
		this.console.debug(formatted, ...args);
		this.emitLogEntry("debug", message, args);
	}

	success(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("info")) return;
		const formatted = this.formatMessage(this.prefixes.event, message);
		this.console.log(formatted, ...args);
		this.emitLogEntry("success", message, args);
	}

	ready(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("info")) return;
		const formatted = this.formatMessage(this.prefixes.ready, message);
		this.console.log(formatted, ...args);
		this.emitLogEntry("ready", message, args);
	}

	wait(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("info")) return;
		const formatted = this.formatMessage(this.prefixes.wait, message);
		this.console.log(formatted, ...args);
		this.emitLogEntry("wait", message, args);
	}

	event(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("info")) return;
		const formatted = this.formatMessage(this.prefixes.event, message);
		this.console.log(formatted, ...args);
		this.emitLogEntry("event", message, args);
	}

	trace(message: string, ...args: unknown[]): void {
		if (!this.shouldLog("debug")) return;
		const formatted = this.formatMessage(this.prefixes.trace, message);
		this.console.debug(formatted, ...args);
		this.emitLogEntry("trace", message, args);
	}

	bootstrap(...message: string[]): void {
		if (!this.shouldLog("info")) return;
		this.console.log(`   ${message.join(" ")}`);
	}

	warnOnce(message: string): void {
		const key = Symbol.for(message);
		if (!(key in globalThis)) {
			(globalThis as Record<symbol, boolean>)[key] = true;
			this.warn(message);
		}
	}
}
