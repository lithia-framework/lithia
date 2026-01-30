/**
 * @fileoverview Response abstraction for the Lithia Framework.
 * Wraps Node.js's ServerResponse to provide a fluent API for status codes,
 * headers, cookie management, and various data transmission formats.
 */

import { createReadStream, statSync } from "node:fs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { join } from "node:path";
import { logger } from "@lithia-js/utils";
import { serialize as serializeCookie } from "cookie";

/**
 * Configuration options for setting HTTP cookies.
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
 * Interface for internal cookie storage.
 */
interface PendingCookie {
	name: string;
	value: string;
	options?: CookieOptions;
}

/**
 * Handles the outgoing HTTP response, providing utility methods for common
 * server-side tasks while ensuring the response lifecycle is respected.
 */
export class LithiaResponse {
	/**
	 * Internal flag to track if the response has been finalized.
	 */
	public _ended = false;

	private _cookies: PendingCookie[] = [];

	/**
	 * Re-binds the native 'on' event listener for response lifecycle tracking.
	 */
	public on: (event: string, listener: (chunk: unknown) => void) => void;

	constructor(private readonly res: ServerResponse) {
		this.on = this.res.on.bind(this.res);
	}

	// --- State & Status Management ---

	/**
	 * Retrieves the current HTTP status code.
	 */
	public get statusCode(): number {
		return this.res.statusCode;
	}

	/**
	 * Sets the HTTP status code for the response.
	 * @param status A valid HTTP status code (100-599).
	 * @throws {Error} If the response has already ended or the code is invalid.
	 */
	public status(status: number): this {
		this.ensureActive();
		if (status < 100 || status > 599) {
			throw new Error(`Invalid HTTP status code: ${status}`);
		}
		this.res.statusCode = status;
		return this;
	}

	// --- Header & Cookie Orchestration ---

	/**
	 * Returns a read-only copy of the current response headers.
	 */
	public headers(): Readonly<OutgoingHttpHeaders> {
		return this.res.getHeaders();
	}

	/**
	 * Sets multiple headers at once.
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
	 */
	public setHeader(name: string, value: string | number | string[]): this {
		this.ensureActive();
		this.res.setHeader(name, value as any);
		return this;
	}

	/**
	 * Removes a header from the response queue.
	 */
	public removeHeader(name: string): this {
		this.ensureActive();
		this.res.removeHeader(name);
		return this;
	}

	/**
	 * Stages a cookie to be set when the response is sent.
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
	 * Clears a cookie by setting its expiration to the past.
	 */
	public clearCookie(name: string, options: CookieOptions = {}): this {
		return this.cookie(name, "", { ...options, expires: new Date(0) });
	}

	// --- Terminal Transmission Methods ---

	/**
	 * Finalizes headers and sends the response.
	 * Handles automatic content-type detection for various data types.
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
				return; // json() handles its own end()
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
	 * Finalizes the response as a JSON object.
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
	 * Issues an HTTP redirect to the specified URL.
	 */
	public redirect(url: string, status = 302): void {
		this.status(status).setHeader("Location", url).end();
	}

	/**
	 * Finalizes the response without a body.
	 */
	public end(): void {
		this.applyPendingCookies();
		this.ensureActive();
		this.res.end();
		this._ended = true;
	}

	/**
	 * Streams a file from the disk to the client.
	 * @param filePath Path to the target file.
	 * @param opts Configuration including root directory for resolution.
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

	// --- Internal Helpers ---

	/**
	 * Serializes and injects pending cookies into the Set-Cookie header.
	 */
	private applyPendingCookies(): void {
		if (this._cookies.length === 0) return;

		const existing = (this.res.getHeader("Set-Cookie") as string[]) || [];
		const serialized = this._cookies.map((c) =>
			serializeCookie(c.name, c.value, c.options as any),
		);

		this.res.setHeader("Set-Cookie", [...existing, ...serialized]);
		this._cookies = [];
	}

	/**
	 * Validates that the response has not been finalized yet.
	 * @throws {Error} If the response has already ended.
	 */
	private ensureActive(): void {
		if (this._ended) {
			throw new Error(
				"Response Error: Cannot modify headers or body after the response has been sent to the client.",
			);
		}
	}
}
