import {
	bold,
	gray,
	green,
	magenta,
	purple,
	red,
	white,
	yellow,
} from "./picocolors";

/**
 * Available log levels for the Lithia framework.
 *
 * These levels correspond to the semantic output styles exposed by `Logger`.
 */
export type LogLevel =
	| "info"
	| "warn"
	| "error"
	| "debug"
	| "success"
	| "ready"
	| "event"
	| "wait";

/**
 * Formats metadata for logging.
 * Objects are stringified, while other types are converted to strings.
 *
 * @param {any} meta - Metadata value associated with the log message.
 * @returns {string} Formatted metadata suffix, or an empty string when no
 * metadata is provided.
 */
function formatMeta(meta: any): string {
	if (meta === undefined) return "";
	try {
		if (typeof meta === "string") return meta;
		if (meta instanceof Error) return meta.stack || meta.message;
		return JSON.stringify(meta);
	} catch {
		return String(meta);
	}
}

/**
 * Standardized logging class for CLI and Framework internals.
 *
 * The logger centralizes output formatting, symbol selection, and debug gating
 * for framework and CLI messages written to the terminal.
 */
export class Logger {
	private readonly isDebugEnabled =
		process.env.DEBUG === "1" || process.env.LITHIA_DEBUG === "1";

	/**
	 * Logs a general information message.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	info = (msg: any, meta?: any) => {
		this.print("", msg, meta);
	};

	/**
	 * Logs a warning message.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	warn = (msg: any, meta?: any) => {
		this.print(yellow(bold("⚠")), msg, meta, "warn");
	};

	/**
	 * Logs an error message.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	error = (msg: any, meta?: any) => {
		this.print(red(bold("○")), msg, meta, "error");
	};

	/**
	 * Logs a successful operation.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	success = (msg: any, meta?: any) => {
		this.print(green(bold("✓")), msg, meta);
	};

	/**
	 * Logs a framework event (e.g., build started, file changed).
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	event = (msg: any, meta?: any) => {
		this.print(magenta(bold("▲")), msg, meta);
	};

	/**
	 * Logs a system ready message.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	ready = (msg: any, meta?: any) => {
		this.print(green(bold("○")), msg, meta);
	};

	/**
	 * Logs a message indicating the system is waiting for an action.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	wait = (msg: any, meta?: any) => {
		this.print(white(bold("…")), msg, meta);
	};

	/**
	 * Logs internal debug information.
	 * Only visible if DEBUG=1 or LITHIA_DEBUG=1 environment variables are set.
	 *
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 */
	debug = (msg: any, meta?: any) => {
		if (!this.isDebugEnabled) return;
		this.print(purple(bold("»")), gray(msg), meta);
	};

	/**
	 * Internal print orchestrator to maintain consistent formatting.
	 *
	 * @param {string} symbol - Colored symbol prefix for the log line.
	 * @param {any} msg - Primary log message.
	 * @param {any} [meta] - Optional metadata appended to the message.
	 * @param {"log" | "warn" | "error"} [type="log"] - Console method category
	 * used to emit the line.
	 */
	private print(
		symbol: string,
		msg: any,
		meta?: any,
		type: "log" | "warn" | "error" = "log",
	) {
		const m = formatMeta(meta);
		const content = `${symbol ? `${symbol} ` : "  "}${msg}${m ? gray(` — ${m}`) : ""}`;

		if (type === "error") console.error(content);
		else if (type === "warn") console.warn(content);
		else console.log(content);
	}
}

/**
 * Shared default logger instance used across Lithia packages.
 */
export const logger = new Logger();
