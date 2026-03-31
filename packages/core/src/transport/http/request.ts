/**
 * @fileoverview Request abstraction for the Lithia Framework.
 * Wraps Node.js's native IncomingMessage to provide high-level APIs for
 * body parsing, file uploads, cookie management, and metadata extraction.
 */

import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import busboy, { type FileInfo } from "busboy";
import { type Cookies, parse as parseCookie } from "cookie";
import { BadRequestError } from "../../errors/app/index";

export type Params = Record<string, any>;
export type Query = Record<string, any>;

export interface UploadedFile extends FileInfo {
	fieldname: string;
	buffer: Buffer;
}

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

	public ip(): string {
		return (
			(this.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
			(this.headers["x-real-ip"] as string) ||
			(this.req.socket as any)?.remoteAddress ||
			"unknown"
		);
	}

	public userAgent(): string {
		return (this.headers["user-agent"] as string) || "";
	}

	public isSecure(): boolean {
		return (
			(this.headers["x-forwarded-proto"] as string) === "https" ||
			(this.req.socket as any)?.encrypted === true
		);
	}

	public host(): string {
		return (this.headers.host as string) || "unknown";
	}

	public url(): string {
		return `${this.isSecure() ? "https" : "http"}://${this.host()}${this.pathname}`;
	}

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

	public async files(): Promise<UploadedFile[]> {
		const contentType = (this.headers["content-type"] || "") as string;
		if (!contentType.includes("multipart/form-data")) return [];

		if (this._filesCache !== null) return this._filesCache;

		await this.parseMultipart();
		return this._filesCache || [];
	}

	public setBody(value: unknown): void {
		this._bodyCache = value;
		this.storage.set("body", value);
	}

	public cookies(): Cookies {
		if (this._cookies === null) {
			const cookieHeader = this.headers.cookie;
			this._cookies = cookieHeader ? parseCookie(cookieHeader) : {};
		}
		return this._cookies;
	}

	public cookie(name: string): string | undefined {
		return this.cookies()[name];
	}

	public get<T>(key: string): T | undefined {
		return this.storage.get(key) as T | undefined;
	}

	public set(key: string, value: unknown): void {
		this.storage.set(key, value);
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

function parseQueryToObject(searchParams: URLSearchParams): Query {
	const query: Query = {};
	for (const [key, value] of searchParams.entries()) {
		query[key] = value;
	}
	return query;
}
