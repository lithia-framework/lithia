import { createReadStream, statSync } from 'node:fs';
import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { serialize as serializeCookie } from 'cookie';
import type { LithiaResponse } from 'lithia/types';

/**
 * Enhanced HTTP response handler wrapping Node.js ServerResponse
 * @class
 * @implements {LithiaResponse}
 *
 * @property {boolean} _ended - Internal flag tracking response completion state
 * @property {ServerResponse} res - Native Node.js response object
 */
/**
 * Cookie options interface matching the cookie library's serialize options.
 */
interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  secure?: boolean;
}

export class _LithiaResponse implements LithiaResponse {
  _ended = false;
  private _cookies: Array<{
    name: string;
    value: string;
    options?: CookieOptions;
  }> = [];

  /**
   * @constructor
   * @param {ServerResponse} res - Native Node.js ServerResponse instance
   */
  constructor(private res: ServerResponse) {
    this.on = this.res.on.bind(this.res);
  }

  get statusCode(): number {
    return this.res.statusCode;
  }

  /**
   * Event listener interface for request stream events
   * @method
   * @param {'data' | 'end' | 'error'} event - Stream event type
   * @param {(chunk: unknown) => void} listener - Event handler callback
   */
  on: (
    event: 'close' | 'drain' | 'error' | 'finish' | 'pipe' | 'unpipe',
    listener: (chunk: unknown) => void,
  ) => void;

  /**
   * Validates response state before allowing modifications
   * @private
   * @throws {Error} When attempting to modify headers or status after response completion
   */
  private checkIfEnded(): void {
    if (this._ended) {
      throw new Error('Cannot modify headers or status after response is sent');
    }
  }

  /**
   * Sets HTTP status code for the response
   * @method
   * @param {number} status - Valid HTTP status code (100-599 inclusive)
   * @returns {LithiaResponse} Current instance for chaining
   * @throws {Error} When status code is outside valid range
   */
  status(status: number): LithiaResponse {
    this.checkIfEnded();

    if (status < 100 || status > 599) {
      throw new Error(`Invalid HTTP status code: ${status}. Must be 100-599`);
    }

    this.res.statusCode = status;
    return this;
  }

  /**
   * Retrieves current response headers
   * @method
   * @returns {Readonly<OutgoingHttpHeaders>} Immutable copy of current headers
   */
  headers(): Readonly<OutgoingHttpHeaders> {
    return this.res.getHeaders();
  }

  /**
   * Bulk sets multiple response headers
   * @method
   * @param {OutgoingHttpHeaders} headers - Object containing header key-value pairs
   * @returns {LithiaResponse} Current instance for chaining
   */
  setHeaders(headers: OutgoingHttpHeaders): LithiaResponse {
    this.checkIfEnded();
    Object.entries(headers).forEach(([name, value]) => {
      this.res.setHeader(name, value || '');
    });
    return this;
  }

  /**
   * Sets a single response header
   * @method
   * @param {string} name - Header name (case-insensitive)
   * @param {string|number|string[]} value - Header value(s)
   * @returns {LithiaResponse} Current instance for chaining
   */
  addHeader(name: string, value: string | number | string[]): LithiaResponse {
    this.checkIfEnded();
    this.res.setHeader(name, value);
    return this;
  }

  /**
   * Removes a previously set header
   * @method
   * @param {string} name - Header name to remove
   * @returns {LithiaResponse} Current instance for chaining
   */
  removeHeader(name: string): LithiaResponse {
    this.checkIfEnded();
    this.res.removeHeader(name);
    return this;
  }

  /**
   * Finalizes response without sending body content
   * @method
   * @throws {Error} If response already completed
   */
  end(): void {
    this.checkIfEnded();
    this.res.end();
    this._ended = true;
  }

  /**
   * Sends JSON response with proper content-type
   * @method
   * @param {object} data - Serializable JavaScript object
   * @throws {Error} If JSON serialization fails (falls back to 500 error)
   */
  json(data: object): void {
    this.checkIfEnded();

    try {
      const json = JSON.stringify(data);
      this.res.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.res.end(json);
    } catch {
      this.res.statusCode = 500;
      this.res.end('Internal Server Error');
    } finally {
      this._ended = true;
    }
  }

  /**
   * Performs HTTP redirect
   * @method
   * @param {string} url - Absolute or relative redirect URL
   * @param {number} [status=302] - HTTP redirect status code
   */
  redirect(url: string, status: number = 302): void {
    this.checkIfEnded();

    this.status(status).addHeader('Location', url).end();
  }

  // HTTP Status Code Helpers
  /**
   * Sends 200 OK response
   * @method
   * @param {unknown} [data] - Response data
   */
  ok(data?: unknown): void {
    this.status(200).send(data);
  }

  /**
   * Sends 201 Created response
   * @method
   * @param {unknown} [data] - Response data
   */
  created(data?: unknown): void {
    this.status(201).send(data);
  }

  /**
   * Sends 204 No Content response
   * @method
   */
  noContent(): void {
    this.status(204).end();
  }

  /**
   * Sends 400 Bad Request response
   * @method
   * @param {unknown} [data] - Error data
   */
  badRequest(data?: unknown): void {
    this.status(400).send(data || { error: 'Bad Request' });
  }

  /**
   * Sends 401 Unauthorized response
   * @method
   * @param {unknown} [data] - Error data
   */
  unauthorized(data?: unknown): void {
    this.status(401).send(data || { error: 'Unauthorized' });
  }

  /**
   * Sends 403 Forbidden response
   * @method
   * @param {unknown} [data] - Error data
   */
  forbidden(data?: unknown): void {
    this.status(403).send(data || { error: 'Forbidden' });
  }

  /**
   * Sends 404 Not Found response
   * @method
   * @param {unknown} [data] - Error data
   */
  notFound(data?: unknown): void {
    this.status(404).send(data || { error: 'Not Found' });
  }

  /**
   * Sends 409 Conflict response
   * @method
   * @param {unknown} [data] - Error data
   */
  conflict(data?: unknown): void {
    this.status(409).send(data || { error: 'Conflict' });
  }

  /**
   * Sends 422 Unprocessable Entity response
   * @method
   * @param {unknown} [data] - Error data
   */
  unprocessableEntity(data?: unknown): void {
    this.status(422).send(data || { error: 'Unprocessable Entity' });
  }

  /**
   * Sends 429 Too Many Requests response
   * @method
   * @param {unknown} [data] - Error data
   */
  tooManyRequests(data?: unknown): void {
    this.status(429).send(data || { error: 'Too Many Requests' });
  }

  /**
   * Sends 500 Internal Server Error response
   * @method
   * @param {unknown} [data] - Error data
   */
  internalServerError(data?: unknown): void {
    this.status(500).send(data || { error: 'Internal Server Error' });
  }

  /**
   * Sends 502 Bad Gateway response
   * @method
   * @param {unknown} [data] - Error data
   */
  badGateway(data?: unknown): void {
    this.status(502).send(data || { error: 'Bad Gateway' });
  }

  /**
   * Sends 503 Service Unavailable response
   * @method
   * @param {unknown} [data] - Error data
   */
  serviceUnavailable(data?: unknown): void {
    this.status(503).send(data || { error: 'Service Unavailable' });
  }

  // Cookie Helpers
  /**
   * Sets a cookie
   * @method
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {object} [options] - Cookie options
   * @returns {LithiaResponse} Current instance for chaining
   */
  cookie(
    name: string,
    value: string,
    options: CookieOptions = {},
  ): LithiaResponse {
    this.checkIfEnded();
    this._cookies.push({ name, value, options });
    return this;
  }

  /**
   * Clears a cookie
   * @method
   * @param {string} name - Cookie name
   * @param {object} [options] - Cookie options
   * @returns {LithiaResponse} Current instance for chaining
   */
  clearCookie(name: string, options: CookieOptions = {}): LithiaResponse {
    this.checkIfEnded();
    return this.cookie(name, '', { ...options, expires: new Date(0) });
  }

  // CORS Helpers
  /**
   * Sets CORS headers
   * @method
   * @param {object} [options] - CORS options
   * @returns {LithiaResponse} Current instance for chaining
   */
  cors(
    options: {
      origin?: string | string[];
      methods?: string[];
      headers?: string[];
      credentials?: boolean;
    } = {},
  ): LithiaResponse {
    this.checkIfEnded();

    const {
      origin = '*',
      methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers = ['Content-Type', 'Authorization'],
      credentials = false,
    } = options;

    this.addHeader(
      'Access-Control-Allow-Origin',
      Array.isArray(origin) ? origin.join(', ') : origin,
    );
    this.addHeader('Access-Control-Allow-Methods', methods.join(', '));
    this.addHeader('Access-Control-Allow-Headers', headers.join(', '));

    if (credentials) {
      this.addHeader('Access-Control-Allow-Credentials', 'true');
    }

    return this;
  }

  // Cache Helpers
  /**
   * Sets cache headers
   * @method
   * @param {object} options - Cache options
   * @returns {LithiaResponse} Current instance for chaining
   */
  cache(
    options: {
      maxAge?: number;
      sMaxAge?: number;
      private?: boolean;
      noCache?: boolean;
      noStore?: boolean;
      mustRevalidate?: boolean;
      etag?: string;
    } = {},
  ): LithiaResponse {
    this.checkIfEnded();

    const {
      maxAge,
      sMaxAge,
      private: isPrivate,
      noCache,
      noStore,
      mustRevalidate,
      etag,
    } = options;

    if (noStore) {
      this.addHeader('Cache-Control', 'no-store');
    } else if (noCache) {
      this.addHeader('Cache-Control', 'no-cache');
    } else {
      const directives: string[] = [];

      if (isPrivate) directives.push('private');
      if (maxAge !== undefined) directives.push(`max-age=${maxAge}`);
      if (sMaxAge !== undefined) directives.push(`s-maxage=${sMaxAge}`);
      if (mustRevalidate) directives.push('must-revalidate');

      if (directives.length > 0) {
        this.addHeader('Cache-Control', directives.join(', '));
      }
    }

    if (etag) {
      this.addHeader('ETag', etag);
    }

    return this;
  }

  // File Download Helpers
  /**
   * Sends a file as download
   * @method
   * @param {string} filePath - Path to file
   * @param {string} [filename] - Download filename
   * @param {object} [options] - Download options
   */
  download(
    filePath: string,
    filename?: string,
    options: {
      root?: string;
      headers?: OutgoingHttpHeaders;
    } = {},
  ): void {
    this.checkIfEnded();

    try {
      const fullPath = options.root ? join(options.root, filePath) : filePath;
      const stats = statSync(fullPath);

      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      const downloadName = filename || filePath.split('/').pop() || 'download';

      this.addHeader(
        'Content-Disposition',
        `attachment; filename="${downloadName}"`,
      );
      this.addHeader('Content-Length', stats.size.toString());

      // Set additional headers if provided
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          this.addHeader(key, value || '');
        });
      }

      // Stream the file
      const stream = createReadStream(fullPath);

      stream.pipe(this.res);

      stream.on('error', () => {
        this.status(404).send({ error: 'File not found' });
      });
    } catch {
      this.status(404).send({ error: 'File not found' });
    } finally {
      this._ended = true;
    }
  }

  /**
   * Sends a file with appropriate headers
   * @method
   * @param {string} filePath - Path to file
   * @param {object} [options] - File options
   */
  sendFile(
    filePath: string,
    options: {
      root?: string;
      headers?: OutgoingHttpHeaders;
      cache?: boolean;
    } = {},
  ): void {
    this.checkIfEnded();

    try {
      const fullPath = options.root ? join(options.root, filePath) : filePath;
      const stats = statSync(fullPath);

      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      // Set content length
      this.addHeader('Content-Length', stats.size.toString());

      // Set last modified
      this.addHeader('Last-Modified', stats.mtime.toUTCString());

      // Set cache headers if enabled
      if (options.cache !== false) {
        this.cache({ maxAge: 86400 }); // 24 hours
      }

      // Set additional headers if provided
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          this.addHeader(key, value || '');
        });
      }

      // Stream the file
      const stream = createReadStream(fullPath);

      stream.pipe(this.res);

      stream.on('error', () => {
        this.status(404).send({ error: 'File not found' });
      });
    } catch {
      this.status(404).send({ error: 'File not found' });
    } finally {
      this._ended = true;
    }
  }

  /**
   * Override send method to handle cookies
   * @method
   * @param {unknown} [data] - Response payload
   */
  send(data?: unknown): void {
    // Set cookies before sending response
    if (this._cookies.length > 0) {
      this._cookies.forEach(({ name, value, options }) => {
        const cookieString = serializeCookie(name, value, options);
        this.res.setHeader('Set-Cookie', [
          ...((this.res.getHeader('Set-Cookie') as string[]) || []),
          cookieString,
        ]);
      });
      this._cookies = [];
    }

    // Call original send method
    this.checkIfEnded();

    try {
      if (data === undefined || data === null) {
        this.end();
        return;
      }

      switch (typeof data) {
        case 'object':
          if (Buffer.isBuffer(data)) {
            if (!this.res.getHeader('Content-Type')) {
              this.addHeader('Content-Type', 'application/octet-stream');
            }
            this.res.end(data);
          } else {
            this.json(data);
          }
          break;

        case 'string':
          if (!this.res.getHeader('Content-Type')) {
            this.addHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          this.res.end(data);
          break;

        default:
          if (!this.res.getHeader('Content-Type')) {
            this.addHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          this.res.end(String(data));
      }
    } finally {
      this._ended = true;
    }
  }
}
