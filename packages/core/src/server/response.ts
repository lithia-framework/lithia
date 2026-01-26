import { createReadStream, statSync } from "node:fs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { join } from "node:path";
import { serialize as serializeCookie } from "cookie";
import { logger } from "../logger";

/** Options used when setting cookies on the response. */
export interface CookieOptions {
	domain?: string;
	expires?: Date;
	httpOnly?: boolean;
	maxAge?: number;
	path?: string;
	sameSite?: boolean | "lax" | "strict" | "none";
	secure?: boolean;
}

/**
 * High-level response wrapper used by Lithia handlers.
 *
 * This class wraps Node's `ServerResponse` and provides convenient helper
 * methods for common response patterns used by Lithia handlers:
 * - sending JSON (`json`), text/primitive bodies (`send`) and redirects
 * - streaming static files (`sendFile`)
 * - managing headers and queued cookies (`addHeader`, `setHeaders`, `cookie`)
 *
 * It also tracks whether the response has already been sent and will throw
 * if you attempt to mutate the response after it was finalized.
 *
 * Instances are created per incoming request and are intended to be passed
 * through middleware and route handlers.
 */
export class LithiaResponse {
	_ended = false;
	private _cookies: Array<{
		name: string;
		value: string;
		options?: CookieOptions;
	}> = [];

	/** Create a new `LithiaResponse` wrapping a Node `ServerResponse`. */
	constructor(private res: ServerResponse) {
		this.on = this.res.on.bind(this.res);
	}

	/** Current HTTP status code for the response. */
	get statusCode(): number {
		return this.res.statusCode;
	}

	/** Convenience passthrough to the underlying `ServerResponse#on`. */
	on: (event: string, listener: (chunk: unknown) => void) => void;

	private checkIfEnded(): void {
		if (this._ended)
			throw new Error("Cannot modify response after it was sent");
	}

	/** Set the numeric HTTP status code. */
	status(status: number): LithiaResponse {
		this.checkIfEnded();
		if (status < 100 || status > 599)
			throw new Error("Invalid HTTP status code");
		this.res.statusCode = status;
		return this;
	}

	/** Return a copy of currently set headers. */
	headers(): Readonly<OutgoingHttpHeaders> {
		return this.res.getHeaders();
	}

	/** Replace multiple headers at once. */
	setHeaders(headers: OutgoingHttpHeaders): LithiaResponse {
		this.checkIfEnded();

		Object.entries(headers).forEach(([k, v]) => {
			this.res.setHeader(k, v as any);
		});

		return this;
	}

	/** Set a single header. */
	addHeader(name: string, value: string | number | string[]): LithiaResponse {
		this.checkIfEnded();
		this.res.setHeader(name, value as any);
		return this;
	}

	/** Remove a header if present. */
	removeHeader(name: string): LithiaResponse {
		this.checkIfEnded();
		this.res.removeHeader(name);
		return this;
	}

	/** End the response without a body. */
	end(): void {
		this.checkIfEnded();
		this.res.end();
		this._ended = true;
	}

	/** Send an object as JSON. Sets `Content-Type: application/json`. */
	json(obj: object): void {
		this.checkIfEnded();
		try {
			const body = JSON.stringify(obj);
			this.res.setHeader("Content-Type", "application/json; charset=utf-8");
			this.res.end(body);
		} catch (err) {
			logger.error("Failed to serialize JSON response:", err);
			this.res.statusCode = 500;
			this.res.end("Internal Server Error");
		} finally {
			this._ended = true;
		}
	}

	/** Send an HTTP redirect to `url`. */
	redirect(url: string, status = 302): void {
		this.checkIfEnded();
		this.status(status).addHeader("Location", url).end();
	}

	/**
	 * Send a response body.
	 * - `Buffer` bodies are sent as `application/octet-stream`.
	 * - Objects are serialized as JSON.
	 * - Primitives are sent as text/plain.
	 */
	send(data?: unknown): void {
		// Set cookies first
		if (this._cookies.length > 0) {
			const existing = (this.res.getHeader("Set-Cookie") as string[]) || [];
			const serialized = this._cookies.map((c) =>
				serializeCookie(c.name, c.value, c.options as any),
			);
			this.res.setHeader("Set-Cookie", [...existing, ...serialized]);
			this._cookies = [];
		}

		this.checkIfEnded();
		try {
			if (data === undefined || data === null) {
				this.end();
				return;
			}

			if (Buffer.isBuffer(data)) {
				if (!this.res.getHeader("Content-Type"))
					this.addHeader("Content-Type", "application/octet-stream");
				this.res.end(data);
			} else if (typeof data === "object") {
				this.json(data as object);
			} else {
				if (!this.res.getHeader("Content-Type"))
					this.addHeader("Content-Type", "text/plain; charset=utf-8");
				this.res.end(String(data));
			}
		} finally {
			this._ended = true;
		}
	}

	/** Queue a cookie to be set on the response. */
	cookie(
		name: string,
		value: string,
		options: CookieOptions = {},
	): LithiaResponse {
		this.checkIfEnded();
		this._cookies.push({ name, value, options });
		return this;
	}

	/** Clear a cookie by setting it with an expired date. */
	clearCookie(name: string, options: CookieOptions = {}): LithiaResponse {
		this.checkIfEnded();
		return this.cookie(name, "", { ...options, expires: new Date(0) });
	}

	/** Send a static file from disk. `opts.root` may be used to resolve relative paths. */
	sendFile(filePath: string, opts: { root?: string } = {}): void {
		this.checkIfEnded();
		try {
			const full = opts.root ? join(opts.root, filePath) : filePath;
			const stats = statSync(full);
			if (!stats.isFile()) throw new Error("Not a file");

			this.addHeader("Content-Length", String(stats.size));
			const stream = createReadStream(full);
			stream.pipe(this.res);
			stream.on("error", () =>
				this.status(404).send({ error: "File not found" }),
			);
		} catch {
			this.status(404).send({ error: "File not found" });
		} finally {
			this._ended = true;
		}
	}
}
