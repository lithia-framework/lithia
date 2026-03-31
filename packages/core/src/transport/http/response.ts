import { createReadStream, statSync } from "node:fs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { join } from "node:path";
import { logger } from "@lithia-js/utils";
import { serialize as serializeCookie } from "cookie";

export interface CookieOptions {
	domain?: string;
	expires?: Date;
	httpOnly?: boolean;
	maxAge?: number;
	path?: string;
	sameSite?: boolean | "lax" | "strict" | "none";
	secure?: boolean;
}

interface PendingCookie {
	name: string;
	value: string;
	options?: CookieOptions;
}

export class LithiaResponse {
	public _ended = false;

	private _cookies: PendingCookie[] = [];
	public on: (event: string, listener: (chunk: unknown) => void) => void;

	constructor(private readonly res: ServerResponse) {
		this.on = this.res.on.bind(this.res);
	}

	public get statusCode(): number {
		return this.res.statusCode;
	}

	public status(status: number): this {
		this.ensureActive();
		if (status < 100 || status > 599) {
			throw new Error(`Invalid HTTP status code: ${status}`);
		}
		this.res.statusCode = status;
		return this;
	}

	public headers(): Readonly<OutgoingHttpHeaders> {
		return this.res.getHeaders();
	}

	public setHeaders(headers: OutgoingHttpHeaders): this {
		this.ensureActive();
		Object.entries(headers).forEach(([key, value]) => {
			this.res.setHeader(key, value as any);
		});
		return this;
	}

	public setHeader(name: string, value: string | number | string[]): this {
		this.ensureActive();
		this.res.setHeader(name, value as any);
		return this;
	}

	public removeHeader(name: string): this {
		this.ensureActive();
		this.res.removeHeader(name);
		return this;
	}

	public cookie(
		name: string,
		value: string,
		options: CookieOptions = {},
	): this {
		this.ensureActive();
		this._cookies.push({ name, value, options });
		return this;
	}

	public clearCookie(name: string, options: CookieOptions = {}): this {
		return this.cookie(name, "", { ...options, expires: new Date(0) });
	}

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

	public redirect(url: string, status = 302): void {
		this.status(status).setHeader("Location", url).end();
	}

	public end(): void {
		this.applyPendingCookies();
		this.ensureActive();
		this.res.end();
		this._ended = true;
	}

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

	private applyPendingCookies(): void {
		if (this._cookies.length === 0) return;

		const existing = (this.res.getHeader("Set-Cookie") as string[]) || [];
		const serialized = this._cookies.map((cookie) =>
			serializeCookie(cookie.name, cookie.value, cookie.options as any),
		);

		this.res.setHeader("Set-Cookie", [...existing, ...serialized]);
		this._cookies = [];
	}

	private ensureActive(): void {
		if (this._ended) {
			throw new Error("Response has already been sent.");
		}
	}
}
