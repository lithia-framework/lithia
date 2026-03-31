/**
 * @fileoverview Request abstraction for the Lithia Framework.
 * Wraps Node.js's native IncomingMessage to provide high-level APIs for
 * body parsing, file uploads, cookie management, and metadata extraction.
 */

import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import busboy, { type FileInfo } from "busboy";
import { type Cookies, parse as parseCookie } from "cookie";
import { BadRequestError } from "../errors/app/index";

/**
 * Represents dynamic URL parameters parsed from the route pattern.
 */
export type Params = Record<string, any>;

/**
 * Represents the parsed query string object.
 */
export type Query = Record<string, any>;

/**
 * Represents a file uploaded via multipart/form-data.
 */
export interface UploadedFile extends FileInfo {
	fieldname: string;
	buffer: Buffer;
}

/**
 * The core Request object used across Lithia handlers and middlewares.
 */
export class LithiaRequest {
	public readonly headers: Readonly<IncomingHttpHeaders>;
	public readonly method: Readonly<string>;
	public readonly pathname: Readonly<string>;
	public query: Query;
	public params: Params;

	private readonly storage = new Map<string, unknown>();
	private _bodyCache: unknown | null = null;
	private _filesCache: UploadedFile[] | null = null;
	private _cookies: Cookies | null = null;

	/**
	 * Initializes a new LithiaRequest instance.
	 * @param req The native Node.js IncomingMessage.
	 * @param opts Configuration options for request processing.
	 */
	constructor(
		private readonly req: IncomingMessage,
		private readonly opts: { maxBodySize?: number },
	) {
		this.headers = req.headers;
		const isSecure = this.isSecure();
		const host = this.headers.host || req.headers.host || "unknown";
		const fullUrl = `${isSecure ? "https" : "http"}://${host}${req.url || "/"}`;
		const url = new URL(fullUrl);

		this.pathname = url.pathname;
		this.method = (req.method || "GET").toUpperCase();
		this.headers = req.headers;
		this.query = parseQueryToObject(url.searchParams);
		this.params = {};
	}

	// --- Identity & Metadata ---

	/**
	 * Retrieves the client's IP address, accounting for proxies and load balancers.
	 */
	public ip(): string {
		return (
			(this.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
			(this.headers["x-real-ip"] as string) ||
			(this.req.socket as any)?.remoteAddress ||
			"unknown"
		);
	}

	/**
	 * Returns the User-Agent string from headers.
	 */
	public userAgent(): string {
		return (this.headers["user-agent"] as string) || "";
	}

	/**
	 * Determines if the request was made over a secure (HTTPS) connection.
	 */
	public isSecure(): boolean {
		return (
			(this.headers["x-forwarded-proto"] as string) === "https" ||
			(this.req.socket as any)?.encrypted === true
		);
	}

	/**
	 * Retrieves the Host header.
	 */
	public host(): string {
		return (this.headers.host as string) || "unknown";
	}

	/**
	 * Returns the reconstructed full URL of the request.
	 */
	public url(): string {
		return `${this.isSecure() ? "https" : "http"}://${this.host()}${this.pathname}`;
	}

	// --- Data Parsing (Async) ---

	/**
	 * Parses and returns the request body. Supports JSON, text, and Multipart.
	 * Results are cached for subsequent calls.
	 * @template T The expected structure of the body.
	 */
	public async body<T>(): Promise<T> {
		const methodsWithBody = ["POST", "PUT", "PATCH", "DELETE"];
		if (!methodsWithBody.includes(this.method)) {
			return {} as T;
		}

		if (this._bodyCache !== null) return this._bodyCache as T;

		const contentType = (this.headers["content-type"] || "") as string;

		if (contentType.includes("multipart/form-data")) {
			await this.parseMultipart();
			return this._bodyCache as T;
		}

		const contentLength = parseInt(
			(this.headers["content-length"] as string) || "0",
			10,
		);
		const maxBodySize = this.opts.maxBodySize || 1024 * 1024;

		if (contentLength > maxBodySize) {
			throw new BadRequestError("Request body too large.");
		}

		const body = await new Promise<T>((resolve, reject) => {
			const chunks: Buffer[] = [];
			let currentSize = 0;

			this.req.on("data", (chunk: Buffer) => {
				currentSize += chunk.length;
				if (currentSize > maxBodySize) {
					reject(new BadRequestError("Request body too large."));
				}
				chunks.push(chunk);
			});

			this.req.on("end", () => {
				if (chunks.length === 0) return resolve({} as T);

				const rawBody = Buffer.concat(chunks).toString("utf-8");
				try {
					if (contentType.includes("application/json")) {
						resolve(JSON.parse(rawBody) as T);
					} else {
						resolve(rawBody as unknown as T);
					}
				} catch {
					reject(new BadRequestError("Invalid request body format."));
				}
			});

			this.req.on("error", (err) => reject(err));
		});

		this._bodyCache = body;
		this.storage.set("body", body);
		return body;
	}

	/**
	 * Parses and returns files uploaded via multipart/form-data.
	 */
	public async files(): Promise<UploadedFile[]> {
		const contentType = (this.headers["content-type"] || "") as string;
		if (!contentType.includes("multipart/form-data")) return [];

		if (this._filesCache !== null) return this._filesCache;

		await this.parseMultipart();
		return this._filesCache || [];
	}

	/**
	 * Manually overrides the body cache. Useful for specialized middlewares.
	 */
	public setBody(value: unknown): void {
		this._bodyCache = value;
		this.storage.set("body", value);
	}

	// --- Cookies ---

	/**
	 * Retrieves all cookies sent with the request.
	 */
	public cookies(): Cookies {
		if (this._cookies === null) {
			const cookieHeader = this.headers.cookie;
			this._cookies = cookieHeader ? parseCookie(cookieHeader) : {};
		}
		return this._cookies;
	}

	/**
	 * Retrieves a specific cookie by name.
	 */
	public cookie(name: string): string | undefined {
		return this.cookies()[name];
	}

	// --- Custom Storage ---

	/**
	 * Retrieves a value from the request's internal storage.
	 */
	public get<T>(key: string): T | undefined {
		return this.storage.get(key) as T | undefined;
	}

	/**
	 * Sets a value in the request's internal storage for cross-middleware communication.
	 */
	public set(key: string, value: unknown): void {
		this.storage.set(key, value);
	}

	// --- Internals ---

	/**
	 * Internal logic for handling multipart/form-data via Busboy.
	 */
	private async parseMultipart(): Promise<void> {
		if (this._bodyCache !== null && this._filesCache !== null) return;

		return new Promise((resolve, reject) => {
			const bb = busboy({ headers: this.headers });
			const fields: Record<string, any> = {};
			const files: UploadedFile[] = [];

			bb.on("file", (name, file, info) => {
				const chunks: Buffer[] = [];
				file.on("data", (data) => chunks.push(data));
				file.on("end", () => {
					files.push({
						fieldname: name,
						buffer: Buffer.concat(chunks),
						...info,
					});
				});
			});

			bb.on("field", (name, val) => {
				fields[name] = val;
			});

			bb.on("close", () => {
				this._bodyCache = fields;
				this._filesCache = files;
				resolve();
			});

			bb.on("error", (err) => reject(err));

			this.req.pipe(bb);
		});
	}
}

/**
 * Utility to convert URLSearchParams into a structured Query object.
 * Handles multiple values for the same key by converting them into arrays.
 */
export function parseQueryToObject(raw: URLSearchParams): Query {
	const obj: Query = {};
	for (const [k, v] of raw.entries()) {
		if (obj[k] === undefined) {
			obj[k] = v;
		} else if (Array.isArray(obj[k])) {
			(obj[k] as string[]).push(v);
		} else {
			obj[k] = [obj[k] as string, v];
		}
	}
	return obj;
}
