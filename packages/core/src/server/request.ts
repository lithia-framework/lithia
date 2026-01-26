import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import busboy, { type FileInfo } from "busboy";
import { type Cookies, parse as parseCookie } from "cookie";
import type { Lithia } from "../lithia";

/** Route parameters extracted from the route matcher. */
export type Params = Record<string, any>;

/** Parsed query parameters. Values may be a string or an array for repeated keys. */
export type Query = Record<string, any>;

/** Represents an uploaded file. */
export interface UploadedFile extends FileInfo {
	/** Field name in the form. */
	fieldname: string;
	/** File buffer. */
	buffer: Buffer;
}

/** Request wrapper passed to route handlers.
 *
 * Provides convenient accessors for headers, params, query, body and helpers
 * such as `ip()` and `isSecure()`. The wrapper also exposes a simple
 * per-request storage via `get()`/`set()` and cookie parsing helpers.
 */
export class LithiaRequest {
	headers: Readonly<IncomingHttpHeaders>;
	method: Readonly<string>;
	params: Params;
	pathname: Readonly<string>;
	query: Query;

	private storage = new Map<string, unknown>();
	private _bodyCache: unknown | null = null;
	private _filesCache: UploadedFile[] | null = null;
	private _cookies: Cookies | null = null;

	/**
	 * Wrap a Node `IncomingMessage` into a `LithiaRequest`.
	 *
	 * `lithia` is the runtime instance and is stored in request-local
	 * storage under the `lithia` key for handlers that need access.
	 */
	constructor(
		private readonly req: IncomingMessage,
		private readonly lithia: Lithia,
	) {
		const protocol =
			(req.headers["x-forwarded-proto"] as string) === "https" ||
			(req.socket as any)?.encrypted === true
				? "https"
				: "http";
		const host = req.headers.host || "unknown";
		const fullUrl = `${protocol}://${host}${req.url || "/"}`;
		const url = new URL(fullUrl);

		this.pathname = url.pathname;
		this.method = (req.method || "GET").toUpperCase();
		this.headers = req.headers;
		this.query = parseQueryToObject(url.searchParams);
		this.params = {};

		this.storage.set("lithia", this.lithia);
	}

	/**
	 * Read and parse the request body. For JSON content-type this returns the
	 * parsed object; for other content types it returns the raw string. The
	 * result is cached and subsequent calls return the cached value.
	 */
	async body<T>(): Promise<T> {
		if (!["POST", "PUT", "PATCH", "DELETE"].includes(this.method)) {
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
		const maxBodySize = this.lithia.options.http.maxBodySize || 1024 * 1024;

		if (contentLength > maxBodySize) {
			throw new Error("Request body too large");
		}

		const body = await new Promise<T>((resolve, reject) => {
			let bodyData = "";
			this.req.on("data", (chunk) => {
				bodyData += chunk;
				if (bodyData.length > maxBodySize) {
					reject(new Error("Request body too large"));
				}
			});

			this.req.on("end", () => {
				if (!bodyData) return resolve({} as T);
				try {
					if (contentType.includes("application/json")) {
						resolve(JSON.parse(bodyData) as T);
					} else {
						resolve(bodyData as unknown as T);
					}
				} catch (err) {
					reject(err);
				}
			});

			this.req.on("error", (err) => reject(err));
		});

		this._bodyCache = body;
		this.storage.set("body", body);
		return body;
	}

	/**
	 * Get uploaded files from a multipart/form-data request.
	 */
	async files(): Promise<UploadedFile[]> {
		const contentType = (this.headers["content-type"] || "") as string;
		if (!contentType.includes("multipart/form-data")) return [];

		if (this._filesCache !== null) return this._filesCache;

		await this.parseMultipart();
		return this._filesCache!;
	}

	/** Set the request body manually (e.g. after validation/sanitization). */
	setBody(value: unknown) {
		this._bodyCache = value;
		this.storage.set("body", value);
	}

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

	/** Retrieve a value from per-request storage. */
	get<T>(key: string): T | undefined {
		return this.storage.get(key) as T | undefined;
	}

	/** Store a value in per-request storage. */
	set(key: string, value: unknown): void {
		this.storage.set(key, value);
	}

	/** Parse cookies from the `Cookie` header. */
	cookies(): Cookies {
		if (this._cookies === null) {
			const cookieHeader = this.headers.cookie;
			const parsedCookies = cookieHeader ? parseCookie(cookieHeader) : {};
			this._cookies = parsedCookies;
		}
		return this._cookies || {};
	}

	/** Return a single cookie value by name. */
	cookie(name: string): string | undefined {
		return this.cookies()[name];
	}

	/** Client IP address (considers `X-Forwarded-For` and `X-Real-IP`). */
	ip(): string {
		return (
			(this.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
			(this.headers["x-real-ip"] as string) ||
			(this.req.socket as any)?.remoteAddress ||
			"unknown"
		);
	}

	/** `User-Agent` header value or empty string. */
	userAgent(): string {
		return (this.headers["user-agent"] as string) || "";
	}

	/** Return true when the request was made over TLS. */
	isSecure(): boolean {
		return (
			(this.headers["x-forwarded-proto"] as string) === "https" ||
			(this.req.socket as any)?.encrypted === true
		);
	}

	/** Host header or `unknown` when missing. */
	host(): string {
		return (this.headers.host as string) || "unknown";
	}

	/** Full URL constructed from host and pathname. */
	url(): string {
		return `${this.isSecure() ? "https" : "http"}://${this.host()}${this.pathname}`;
	}
}

export function parseQueryToObject(raw: URLSearchParams) {
	const obj: Query = {};
	for (const [k, v] of raw.entries()) {
		if (obj[k] === undefined) obj[k] = v;
		else if (Array.isArray(obj[k])) (obj[k] as string[]).push(v);
		else obj[k] = [obj[k] as string, v];
	}
	return obj;
}
