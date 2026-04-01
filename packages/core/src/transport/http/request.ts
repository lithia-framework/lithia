import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import busboy, { type FileInfo } from "busboy";
import { type Cookies, parse as parseCookie } from "cookie";
import { BadRequestError } from "../../errors/app/index";

/**
 * Route params object populated by the route matcher.
 *
 * Keys correspond to dynamic segments extracted from the matched route pattern.
 * The values are assigned by the HTTP transport before the handler runs and
 * remain mutable for the lifetime of the current request context.
 */
export type Params = Record<string, any>;

/**
 * Query object parsed from the incoming request URL.
 *
 * Each value is currently stored as the last string value observed for a given
 * query key during URL parsing.
 */
export type Query = Record<string, any>;

/**
 * Uploaded multipart file returned by `req.files()`.
 *
 * Each file entry contains the metadata reported by Busboy plus the fully
 * buffered file contents collected while the multipart stream is parsed.
 */
export interface UploadedFile extends FileInfo {
	fieldname: string;
	buffer: Buffer;
}

/**
 * Lithia wrapper around Node's `IncomingMessage`.
 *
 * Provides helpers for reading params, query, body, cookies, and multipart
 * uploads from route handlers and middleware.
 *
 * The wrapper parses URL-derived data eagerly in the constructor and reads the
 * request stream lazily only when `body()` or `files()` is called. Parsed
 * payloads are cached so route handlers and middleware can safely reuse the
 * same request wrapper without reparsing the stream.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/project-structure
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
	 * Creates a request wrapper for the current HTTP transaction.
	 *
	 * The constructor captures headers, reconstructs a best-effort absolute URL,
	 * normalizes the HTTP method to uppercase, and initializes parsed query and
	 * route-param containers for later middleware and handler use.
	 *
	 * @param {IncomingMessage} req - Raw Node.js request object received by the
	 * HTTP server.
	 * @param {{ maxBodySize?: number }} opts - Per-request parsing options used
	 * when consuming the request body stream.
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
		this.query = parseQueryToObject(url.searchParams);
		this.params = {};
	}

	/**
	 * Returns the best-effort client IP address for the current request.
	 *
	 * The lookup prefers proxy-forwarded headers before falling back to the raw
	 * socket address, which makes the result suitable for deployments behind
	 * reverse proxies that preserve `x-forwarded-for` or `x-real-ip`.
	 *
	 * @returns {string} The resolved client IP address, or `"unknown"` when no
	 * address can be derived.
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
	 * Returns the current request user-agent string.
	 *
	 * @returns {string} The raw `user-agent` header value, or an empty string
	 * when the header is missing.
	 */
	public userAgent(): string {
		return (this.headers["user-agent"] as string) || "";
	}

	/**
	 * Returns whether the current request is using HTTPS.
	 *
	 * The check prefers `x-forwarded-proto` for proxy-aware deployments and then
	 * falls back to the encrypted state of the underlying socket.
	 *
	 * @returns {boolean} `true` when the request should be treated as HTTPS.
	 */
	public isSecure(): boolean {
		return (
			(this.headers["x-forwarded-proto"] as string) === "https" ||
			(this.req.socket as any)?.encrypted === true
		);
	}

	/**
	 * Returns the request host header.
	 *
	 * @returns {string} The current host header value, or `"unknown"` when it is
	 * not available.
	 */
	public host(): string {
		return (this.headers.host as string) || "unknown";
	}

	/**
	 * Returns the absolute request URL reconstructed from the current request.
	 *
	 * This helper rebuilds the URL from the current security state, host header,
	 * and parsed pathname. It does not append the original query string.
	 *
	 * @returns {string} Absolute URL for the current request pathname.
	 */
	public url(): string {
		return `${this.isSecure() ? "https" : "http"}://${this.host()}${this.pathname}`;
	}

	/**
	 * Parses and returns the request body.
	 *
	 * JSON and plain text bodies are supported automatically. Multipart requests
	 * populate both `body()` and `files()` through a shared parsing pass. The
	 * parsed value is cached after the first read so later consumers do not touch
	 * the underlying stream again.
	 *
	 * Requests whose method is not one of `POST`, `PUT`, `PATCH`, or `DELETE`
	 * resolve to an empty object without reading the stream.
	 *
	 * @returns {Promise<T>} Parsed request body, multipart field map, raw text, or
	 * an empty object for methods that do not consume a body by default.
	 * @throws {BadRequestError} Thrown when the declared or streamed body size
	 * exceeds `maxBodySize`, or when JSON parsing fails.
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
	 * Returns uploaded files for multipart/form-data requests.
	 *
	 * `files()` shares the same multipart parsing pass used by `body()`. The
	 * first call buffers every uploaded file into memory and caches both the
	 * parsed field object and file array for later access.
	 *
	 * @returns {Promise<UploadedFile[]>} Buffered multipart files, or an empty
	 * array when the request is not multipart.
	 */
	public async files(): Promise<UploadedFile[]> {
		const contentType = (this.headers["content-type"] || "") as string;
		if (!contentType.includes("multipart/form-data")) return [];

		if (this._filesCache !== null) return this._filesCache;

		await this.parseMultipart();
		return this._filesCache || [];
	}

	/**
	 * Overrides the cached body value for the current request context.
	 *
	 * This mutates only the wrapper cache and the internal storage map. It does
	 * not modify the underlying Node.js request stream.
	 *
	 * @param {unknown} value - Replacement body value to expose through `body()`
	 * and internal request storage.
	 */
	public setBody(value: unknown): void {
		this._bodyCache = value;
		this.storage.set("body", value);
	}

	/**
	 * Returns all parsed cookies from the request.
	 *
	 * Cookies are parsed lazily on first access and cached for the remainder of
	 * the request lifecycle.
	 *
	 * @returns {Cookies} Parsed cookie map for the current request.
	 */
	public cookies(): Cookies {
		if (this._cookies === null) {
			const cookieHeader = this.headers.cookie;
			this._cookies = cookieHeader ? parseCookie(cookieHeader) : {};
		}
		return this._cookies;
	}

	/**
	 * Returns a single cookie value by name.
	 *
	 * @param {string} name - Cookie name to read from the parsed cookie map.
	 * @returns {string | undefined} The cookie value when present.
	 */
	public cookie(name: string): string | undefined {
		return this.cookies()[name];
	}

	/**
	 * Returns a value stored in the per-request internal storage map.
	 *
	 * This storage is local to the current request wrapper and can be used by
	 * middleware and handlers to exchange derived values without mutating the
	 * typed request surface.
	 *
	 * @param {string} key - Storage key associated with the requested value.
	 * @returns {T | undefined} Stored value for the key, if one exists.
	 */
	public get<T>(key: string): T | undefined {
		return this.storage.get(key) as T | undefined;
	}

	/**
	 * Stores a value in the per-request internal storage map.
	 *
	 * @param {string} key - Storage key to create or overwrite.
	 * @param {unknown} value - Arbitrary value to retain for the lifetime of the
	 * current request wrapper.
	 */
	public set(key: string, value: unknown): void {
		this.storage.set(key, value);
	}

	/**
	 * Parses a multipart/form-data request into cached fields and file buffers.
	 *
	 * The request stream is piped into Busboy exactly once. Field values are
	 * collected into a plain object, file contents are buffered fully in memory,
	 * and both results are stored in the request cache and internal storage map.
	 *
	 * @returns {Promise<void>} Resolves after Busboy finishes consuming the
	 * multipart stream and caches the parsed payload.
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

			bb.on("field", (name, value) => {
				fields[name] = value;
			});

			bb.on("finish", () => {
				this._bodyCache = fields;
				this._filesCache = files;
				this.storage.set("body", fields);
				this.storage.set("files", files);
				resolve();
			});

			bb.on("error", reject);
			this.req.pipe(bb);
		});
	}
}

/**
 * Converts URL search parameters into the mutable query object exposed by the
 * request wrapper.
 *
 * When the same key appears multiple times, the last encountered value wins.
 *
 * @param {URLSearchParams} searchParams - Parsed search parameters from the
 * request URL.
 * @returns {Query} Plain object representation of the query string.
 */
function parseQueryToObject(searchParams: URLSearchParams): Query {
	const query: Query = {};
	for (const [key, value] of searchParams.entries()) {
		query[key] = value;
	}
	return query;
}
