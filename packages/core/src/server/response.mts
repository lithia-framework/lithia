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

export class LithiaResponse {
	_ended = false;
	private _cookies: Array<{
		name: string;
		value: string;
		options?: CookieOptions;
	}> = [];

	constructor(private res: ServerResponse) {
		this.on = this.res.on.bind(this.res);
	}

	get statusCode(): number {
		return this.res.statusCode;
	}

	on: (event: string, listener: (chunk: unknown) => void) => void;

	private checkIfEnded(): void {
		if (this._ended)
			throw new Error("Cannot modify response after it was sent");
	}

	status(status: number): LithiaResponse {
		this.checkIfEnded();
		if (status < 100 || status > 599)
			throw new Error("Invalid HTTP status code");
		this.res.statusCode = status;
		return this;
	}

	headers(): Readonly<OutgoingHttpHeaders> {
		return this.res.getHeaders();
	}

	setHeaders(headers: OutgoingHttpHeaders): LithiaResponse {
		this.checkIfEnded();

		Object.entries(headers).forEach(([k, v]) => {
			this.res.setHeader(k, v as any);
		});

		return this;
	}

	setHeader(name: string, value: string | number | string[]): LithiaResponse {
		this.checkIfEnded();
		this.res.setHeader(name, value as any);
		return this;
	}

	removeHeader(name: string): LithiaResponse {
		this.checkIfEnded();
		this.res.removeHeader(name);
		return this;
	}

	end(): void {
		this.checkIfEnded();
		this.res.end();
		this._ended = true;
	}

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

	redirect(url: string, status = 302): void {
		this.checkIfEnded();
		this.status(status).setHeader("Location", url).end();
	}

	send(data?: unknown): void {
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
					this.setHeader("Content-Type", "application/octet-stream");
				this.res.end(data);
			} else if (typeof data === "object") {
				this.json(data as object);
			} else {
				if (!this.res.getHeader("Content-Type"))
					this.setHeader("Content-Type", "text/plain; charset=utf-8");
				this.res.end(String(data));
			}
		} finally {
			this._ended = true;
		}
	}

	cookie(
		name: string,
		value: string,
		options: CookieOptions = {},
	): LithiaResponse {
		this.checkIfEnded();
		this._cookies.push({ name, value, options });
		return this;
	}

	clearCookie(name: string, options: CookieOptions = {}): LithiaResponse {
		this.checkIfEnded();
		return this.cookie(name, "", { ...options, expires: new Date(0) });
	}

	sendFile(filePath: string, opts: { root?: string } = {}): void {
		this.checkIfEnded();
		try {
			const full = opts.root ? join(opts.root, filePath) : filePath;
			const stats = statSync(full);
			if (!stats.isFile()) throw new Error("Not a file");

			this.setHeader("Content-Length", String(stats.size));
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
