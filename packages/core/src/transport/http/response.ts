import { createReadStream, statSync } from "node:fs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { join } from "node:path";
import { logger } from "@lithia-js/utils";
import { serialize as serializeCookie } from "cookie";

/**
 * Cookie attributes accepted by `LithiaResponse.cookie()`.
 *
 * These options are forwarded to the cookie serializer when pending cookies
 * are flushed into the `Set-Cookie` header.
 */
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
 * Cookie entry queued until the response writes headers.
 */
interface PendingCookie {
	name: string;
	value: string;
	options?: CookieOptions;
}

/**
 * Lithia wrapper around Node's `ServerResponse`.
 *
 * Provides helpers for status management, JSON/text responses, redirects,
 * cookies, and file responses.
 *
 * The wrapper keeps response mutations centralized until one of the terminal
 * methods sends or streams the response. After that point, further mutations
 * are rejected to preserve a single-write HTTP lifecycle.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/project-structure
 */
export class LithiaResponse {
	public _ended = false;

	private _cookies: PendingCookie[] = [];
	public on: (event: string, listener: (chunk: unknown) => void) => void;

	/**
	 * Creates a response wrapper for the current HTTP transaction.
	 *
	 * The wrapper binds a pass-through `on()` helper to the underlying Node.js
	 * response object so route-adjacent code can subscribe to response events
	 * without holding the raw `ServerResponse`.
	 *
	 * @param {ServerResponse} res - Raw Node.js response object associated with
	 * the current request.
	 */
	constructor(private readonly res: ServerResponse) {
		this.on = this.res.on.bind(this.res);
	}

	/**
	 * Returns the current HTTP status code.
	 *
	 * @returns {number} Status code currently assigned to the underlying
	 * response.
	 */
	public get statusCode(): number {
		return this.res.statusCode;
	}

	/**
	 * Sets the HTTP status code for the response.
	 *
	 * This mutates the underlying response only while it is still active.
	 *
	 * @param {number} status - HTTP status code to assign before the response is
	 * sent.
	 * @returns {this} The current response wrapper for fluent chaining.
	 * @throws {Error} Thrown when the response has already ended or when the
	 * supplied status code falls outside the valid HTTP range.
	 */
	public status(status: number): this {
		this.ensureActive();
		if (status < 100 || status > 599) {
			throw new Error(`Invalid HTTP status code: ${status}`);
		}
		this.res.statusCode = status;
		return this;
	}

	/**
	 * Returns the currently assigned response headers.
	 *
	 * @returns {Readonly<OutgoingHttpHeaders>} Snapshot of the headers currently
	 * stored on the underlying response.
	 */
	public headers(): Readonly<OutgoingHttpHeaders> {
		return this.res.getHeaders();
	}

	/**
	 * Sets multiple response headers at once.
	 *
	 * @param {OutgoingHttpHeaders} headers - Header entries to assign to the
	 * response before it is sent.
	 * @returns {this} The current response wrapper for fluent chaining.
	 * @throws {Error} Thrown when the response has already ended.
	 */
	public setHeaders(headers: OutgoingHttpHeaders): this {
		this.ensureActive();
		Object.entries(headers).forEach(([key, value]) => {
			this.res.setHeader(key, value as any);
		});
		return this;
	}

	/**
	 * Sets a single response header.
	 *
	 * @param {string} name - Header name to create or overwrite.
	 * @param {string | number | string[]} value - Header value written to the
	 * underlying response.
	 * @returns {this} The current response wrapper for fluent chaining.
	 * @throws {Error} Thrown when the response has already ended.
	 */
	public setHeader(name: string, value: string | number | string[]): this {
		this.ensureActive();
		this.res.setHeader(name, value as any);
		return this;
	}

	/**
	 * Removes a response header.
	 *
	 * @param {string} name - Header name to remove.
	 * @returns {this} The current response wrapper for fluent chaining.
	 * @throws {Error} Thrown when the response has already ended.
	 */
	public removeHeader(name: string): this {
		this.ensureActive();
		this.res.removeHeader(name);
		return this;
	}

	/**
	 * Queues a cookie to be written when the response is sent.
	 *
	 * Cookies are accumulated in memory and serialized only when a terminal
	 * response method flushes headers.
	 *
	 * @param {string} name - Cookie name.
	 * @param {string} value - Cookie value.
	 * @param {CookieOptions} [options={}] - Cookie serialization options.
	 * @returns {this} The current response wrapper for fluent chaining.
	 * @throws {Error} Thrown when the response has already ended.
	 */
	public cookie(
		name: string,
		value: string,
		options: CookieOptions = {},
	): this {
		this.ensureActive();
		this._cookies.push({ name, value, options });
		return this;
	}

	/**
	 * Clears a cookie by expiring it immediately.
	 *
	 * @param {string} name - Cookie name to expire.
	 * @param {CookieOptions} [options={}] - Additional cookie attributes that
	 * must match the original cookie scope.
	 * @returns {this} The current response wrapper for fluent chaining.
	 */
	public clearCookie(name: string, options: CookieOptions = {}): this {
		return this.cookie(name, "", { ...options, expires: new Date(0) });
	}

	/**
	 * Sends a response body using a best-effort content type.
	 *
	 * The method flushes pending cookies before writing, chooses a default
	 * content type when none is set, and treats plain objects as JSON by
	 * delegating to `json()`. Calling `send()` is a terminal operation for the
	 * response lifecycle.
	 *
	 * @param {unknown} [data] - Response payload to send.
	 * @throws {Error} Thrown when the response has already ended.
	 */
	public send(data?: unknown): void {
		this.applyPendingCookies();
		this.ensureActive();

		try {
			if (data === undefined || data === null) {
				this.end();
				return;
			}

			if (Buffer.isBuffer(data)) {
				if (!this.res.getHeader("Content-Type")) {
					this.setHeader("Content-Type", "application/octet-stream");
				}
				this.res.end(data);
			} else if (typeof data === "object") {
				this.json(data as object);
				return;
			} else {
				if (!this.res.getHeader("Content-Type")) {
					this.setHeader("Content-Type", "text/plain; charset=utf-8");
				}
				this.res.end(String(data));
			}
		} finally {
			this._ended = true;
		}
	}

	/**
	 * Sends a JSON response.
	 *
	 * Pending cookies are flushed before serialization. If JSON serialization
	 * throws, the method logs the failure and falls back to a `500 Internal
	 * Server Error` response body.
	 *
	 * @param {object} obj - Plain object to serialize as JSON.
	 */
	public json(obj: object): void {
		this.applyPendingCookies();
		this.ensureActive();

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

	/**
	 * Sends a redirect response.
	 *
	 * This sets the status code, writes the `Location` header, and then ends the
	 * response.
	 *
	 * @param {string} url - Redirect target written to the `Location` header.
	 * @param {number} [status=302] - Redirect status code.
	 */
	public redirect(url: string, status = 302): void {
		this.status(status).setHeader("Location", url).end();
	}

	/**
	 * Ends the response without sending additional data.
	 *
	 * Pending cookies are flushed before the underlying response is closed.
	 *
	 * @throws {Error} Thrown when the response has already ended.
	 */
	public end(): void {
		this.applyPendingCookies();
		this.ensureActive();
		this.res.end();
		this._ended = true;
	}

	/**
	 * Streams a file to the client.
	 *
	 * The method resolves the final path, verifies that it points to a regular
	 * file, sets `Content-Length`, flushes pending cookies, and pipes the file
	 * stream into the underlying response. Missing files and stream failures fall
	 * back to a `404` JSON error payload.
	 *
	 * @param {string} filePath - File path to stream. When `opts.root` is set, it
	 * is resolved relative to that root.
	 * @param {{ root?: string }} [opts={}] - Optional root directory used to
	 * resolve relative file paths.
	 */
	public sendFile(filePath: string, opts: { root?: string } = {}): void {
		this.ensureActive();
		try {
			const fullPath = opts.root ? join(opts.root, filePath) : filePath;
			const stats = statSync(fullPath);

			if (!stats.isFile()) throw new Error("Target is not a file");

			this.setHeader("Content-Length", String(stats.size));
			const stream = createReadStream(fullPath);

			this.applyPendingCookies();
			stream.pipe(this.res);

			stream.on("error", () => {
				this.status(404).send({ error: "File not found" });
			});
		} catch {
			this.status(404).send({ error: "File not found" });
		} finally {
			this._ended = true;
		}
	}

	/**
	 * Serializes queued cookies into the response headers and clears the queue.
	 *
	 * Existing `Set-Cookie` headers are preserved and extended so multiple
	 * middleware and handler calls can contribute cookies before the response is
	 * finalized.
	 */
	private applyPendingCookies(): void {
		if (this._cookies.length === 0) return;

		const existing = (this.res.getHeader("Set-Cookie") as string[]) || [];
		const serialized = this._cookies.map((cookie) =>
			serializeCookie(cookie.name, cookie.value, cookie.options as any),
		);

		this.res.setHeader("Set-Cookie", [...existing, ...serialized]);
		this._cookies = [];
	}

	/**
	 * Ensures the response has not already been finalized.
	 *
	 * @throws {Error} Thrown when a terminal response method has already sent or
	 * ended the response.
	 */
	private ensureActive(): void {
		if (this._ended) {
			throw new Error("Response has already been sent.");
		}
	}
}
