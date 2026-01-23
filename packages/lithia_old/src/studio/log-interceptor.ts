import path from "node:path";
import type { LogEntry } from "lithia/core";

/**
 * Intercepts global console methods to capture user logs.
 *
 * This class provides functionality to intercept console.log, console.error,
 * console.warn, console.info, and console.debug calls from user code and
 * convert them into structured LogEntry objects.
 */
export class LogInterceptor {
	private originalConsole: {
		log: typeof console.log;
		error: typeof console.error;
		warn: typeof console.warn;
		info: typeof console.info;
		debug: typeof console.debug;
	};
	private onLogEntry?: (entry: LogEntry) => void;

	constructor(onLogEntry?: (entry: LogEntry) => void) {
		this.onLogEntry = onLogEntry;
		this.originalConsole = {
			log: console.log,
			error: console.error,
			warn: console.warn,
			info: console.info,
			debug: console.debug,
		};
	}

	/**
	 * Start intercepting console methods.
	 */
	start(): void {
		this.interceptConsoleMethods();
	}

	/**
	 * Stop intercepting console methods and restore original behavior.
	 */
	stop(): void {
		console.log = this.originalConsole.log;
		console.error = this.originalConsole.error;
		console.warn = this.originalConsole.warn;
		console.info = this.originalConsole.info;
		console.debug = this.originalConsole.debug;
	}

	/**
	 * Remove ANSI color codes from string.
	 */
	private stripAnsiColors(str: string): string {
		// Remove ANSI escape sequences (colors, bold, etc.)
		// Split by ESC character and join back without escape sequences
		let cleaned = str
			.split("\u001b")
			.map((part, index) => {
				if (index === 0) return part;
				// Remove the escape sequence part
				const match = part.match(/^\[[0-9;]*[a-zA-Z]/);
				if (match) {
					return part.substring(match[0].length);
				}
				return part;
			})
			.join("");

		// Remove trailing double colons and clean up any remaining artifacts
		cleaned = cleaned.replace(/::+$/, "").trim();

		return cleaned;
	}

	/**
	 * Helper function to map compiled JS path to original TS path.
	 */
	private mapToSourcePath(compiledPath: string): string {
		// Convert .lithia/routes/file.js to src/routes/file.ts
		let sourceFile = compiledPath;
		const resolvedPath = path.resolve(compiledPath);

		sourceFile = resolvedPath.replace(".js", ".ts");
		sourceFile = sourceFile.replace(".lithia", "src");
		sourceFile = path.relative(process.cwd(), sourceFile);

		return sourceFile;
	}

	/**
	 * Helper function to get caller information from stack trace.
	 */
	private getCallerInfo(): { file: string } | null {
		const stack = new Error().stack;
		if (!stack) return null;

		const lines = stack.split("\n");
		// Skip the first 3 lines: Error, getCallerInfo, and the console method
		for (let i = 3; i < lines.length; i++) {
			const line = lines[i];
			// Look for file paths that are not from node_modules or internal Node.js
			const match = line.match(/at\s+(?:.*\s+)?\(?(.+):(\d+):(\d+)\)?/);
			if (match) {
				const [, filePath] = match;

				// Skip if it's from node_modules, internal Node.js files, dist/studio, or Lithia core/cli
				if (
					!filePath.includes("node_modules") &&
					!filePath.includes("/dist/") &&
					!filePath.includes("\\dist\\") &&
					!filePath.startsWith("node:internal/") &&
					!filePath.startsWith("node:") &&
					!filePath.includes("[eval]") &&
					(filePath.includes("/") || filePath.includes("\\"))
				) {
					const mappedFile = this.mapToSourcePath(filePath);
					// Clean up any trailing double colons from the file path
					const cleanFile = mappedFile.replace(/::+$/, "").trim();
					return { file: cleanFile };
				}
			}
		}
		return null;
	}

	/**
	 * Intercept global console methods to capture user logs.
	 */
	private interceptConsoleMethods(): void {
		// Helper function to create log entry from console call
		const createLogEntry = (
			level: LogEntry["level"],
			args: unknown[],
		): LogEntry => {
			const message = args
				.map((arg) => {
					if (typeof arg === "object") {
						return JSON.stringify(arg, null, 2);
					}
					// Remove ANSI color codes from string
					return this.stripAnsiColors(String(arg));
				})
				.join(" ");

			const callerInfo = this.getCallerInfo();

			return {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				timestamp: new Date(),
				level,
				message,
				args: args.length > 0 ? args : undefined,
				source: "user",
				callerInfo: callerInfo || undefined,
			};
		};

		// Override console methods
		console.log = (...args: unknown[]) => {
			this.originalConsole.log(...args);
			if (this.onLogEntry) {
				this.onLogEntry(createLogEntry("info", args));
			}
		};

		console.error = (...args: unknown[]) => {
			this.originalConsole.error(...args);
			if (this.onLogEntry) {
				this.onLogEntry(createLogEntry("error", args));
			}
		};

		console.warn = (...args: unknown[]) => {
			this.originalConsole.warn(...args);
			if (this.onLogEntry) {
				this.onLogEntry(createLogEntry("warn", args));
			}
		};

		console.info = (...args: unknown[]) => {
			this.originalConsole.info(...args);
			if (this.onLogEntry) {
				this.onLogEntry(createLogEntry("info", args));
			}
		};

		console.debug = (...args: unknown[]) => {
			this.originalConsole.debug(...args);
			if (this.onLogEntry) {
				this.onLogEntry(createLogEntry("debug", args));
			}
		};
	}
}
