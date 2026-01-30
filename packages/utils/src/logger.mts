/**
 * @fileoverview Logger utility for Lithia.js.
 * Provides consistent, color-coded terminal output for different log levels.
 */

import {
	bold,
	gray,
	green,
	magenta,
	purple,
	red,
	white,
	yellow,
} from "./picocolors.mjs";

/**
 * Available log levels for the Lithia framework.
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
 */
export class Logger {
	private readonly isDebugEnabled =
		process.env.DEBUG === "1" || process.env.LITHIA_DEBUG === "1";

	/**
	 * Logs a general information message.
	 */
	info = (msg: any, meta?: any) => {
		this.print("", msg, meta);
	};

	/**
	 * Logs a warning message.
	 */
	warn = (msg: any, meta?: any) => {
		this.print(yellow(bold("⚠")), msg, meta, "warn");
	};

	/**
	 * Logs an error message.
	 */
	error = (msg: any, meta?: any) => {
		this.print(red(bold("✖")), msg, meta, "error");
	};

	/**
	 * Logs a successful operation.
	 */
	success = (msg: any, meta?: any) => {
		this.print(green(bold("✓")), msg, meta);
	};

	/**
	 * Logs a framework event (e.g., build started, file changed).
	 */
	event = (msg: any, meta?: any) => {
		this.print(magenta(bold("▲")), msg, meta);
	};

	/**
	 * Logs a system ready message.
	 */
	ready = (msg: any, meta?: any) => {
		this.print(green(bold("○")), msg, meta);
	};

	/**
	 * Logs a message indicating the system is waiting for an action.
	 */
	wait = (msg: any, meta?: any) => {
		this.print(white(bold("…")), msg, meta);
	};

	/**
	 * Logs internal debug information.
	 * Only visible if DEBUG=1 or LITHIA_DEBUG=1 environment variables are set.
	 */
	debug = (msg: any, meta?: any) => {
		if (!this.isDebugEnabled) return;
		this.print(purple(bold("»")), gray(msg), meta);
	};

	/**
	 * Internal print orchestrator to maintain consistent formatting.
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

export const logger = new Logger();
