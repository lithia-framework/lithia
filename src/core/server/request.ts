import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { parse as parseCookie } from 'cookie';
import type { Lithia, LithiaRequest, Params, Query } from 'lithia/types';

/**
 * Enhanced HTTP request handler wrapping Node.js IncomingMessage
 * @class
 * @implements {LithiaRequest}
 *
 * @property {Readonly<IncomingHttpHeaders>} headers - Immutable request headers
 * @property {Readonly<string>} method - HTTP request method in uppercase
 * @property {Readonly<Params>} params - Route parameters object
 * @property {Readonly<string>} pathname - Normalized URL path without query
 * @property {Readonly<Query>} query - Processed query parameters
 */
export class _LithiaRequest implements LithiaRequest {
  headers: Readonly<IncomingHttpHeaders>;
  method: Readonly<string>;
  params: Readonly<Params>;
  pathname: Readonly<string>;
  query: Readonly<Query>;
  private storage: Map<string, unknown>;
  private _bodyCache: unknown | null = null;
  private _cookies: Record<string, string> | null = null;

  /**
   * @constructor
   * @param {IncomingMessage} req - Native Node.js request object
   * @param {Lithia} lithia - Reference to Lithia application instance
   */
  constructor(
    private readonly req: IncomingMessage,
    private readonly lithia: Lithia,
  ) {
    // Use WHATWG URL API instead of deprecated url.parse()
    // Construct full URL from request headers and URL path
    const protocol =
      req.headers['x-forwarded-proto'] === 'https' ||
      (req.socket as any)?.encrypted === true
        ? 'https'
        : 'http';
    const host = req.headers.host || 'unknown';
    const fullUrl = `${protocol}://${host}${req.url!}`;
    const url = new URL(fullUrl);
    
    this.pathname = url.pathname;
    this.method = req.method!;
    this.headers = req.headers;
    this.query = parseQuery(url.searchParams, this.lithia);
    this.storage = new Map<string, unknown>();
    this.params = {};
    this.on = this.req.on.bind(this.req);

    this.storage.set('lithia', this.lithia);
  }

  /**
   * Event listener interface for request stream events
   * @method
   * @param {'data' | 'end' | 'error'} event - Stream event type
   * @param {(chunk: unknown) => void} listener - Event handler callback
   */
  on: (
    event: 'data' | 'end' | 'error',
    listener: (chunk: unknown) => void,
  ) => void;

  /**
   * Parses request body based on content-type with caching and validation
   * @method
   * @template T - Expected body type
   * @returns {Promise<Readonly<T>>} Parsed body content
   * @throws {Error} For invalid JSON, unsupported content-type, or stream errors
   *
   * @example
   * // JSON body
   * const data = await request.body<{ id: number }>();
   *
   * // Text body
   * const text = await request.body<string>();
   *
   * // Form data
   * const formData = await request.body<Record<string, string>>();
   */
  async body<T>(): Promise<Readonly<T>> {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(this.method)) {
      return {} as T;
    }

    // Return cached body if available
    if (this._bodyCache !== null) {
      return this._bodyCache as T;
    }

    const contentType = this.headers['content-type'] || '';
    const contentLength = parseInt(this.headers['content-length'] || '0', 10);

    // Check body size limit
    const maxBodySize =
      this.lithia.options.server.request.maxBodySize || 1024 * 1024; // 1MB default
    if (contentLength > maxBodySize) {
      throw new Error(
        `Request body too large: ${contentLength} bytes (max: ${maxBodySize})`,
      );
    }

    const body = await new Promise<T>((resolve, reject) => {
      let bodyData = '';
      let receivedLength = 0;

      this.req.on('data', (chunk) => {
        receivedLength += chunk.length;

        // Check received length against max body size
        if (receivedLength > maxBodySize) {
          reject(
            new Error(
              `Request body too large: ${receivedLength} bytes (max: ${maxBodySize})`,
            ),
          );
          return;
        }

        bodyData += chunk;
      });

      this.req.on('end', () => {
        if (bodyData.length === 0) {
          resolve({} as T);
          return;
        }

        try {
          const parsed = this.parseBodyByContentType(bodyData, contentType);
          resolve(parsed as T);
        } catch (error) {
          reject(error);
        }
      });

      this.req.on('error', (error) => {
        reject(new Error(`Request stream error: ${error.message}`));
      });
    });

    // Cache the parsed body
    this._bodyCache = body;
    this.set('body', body);

    return body;
  }

  /**
   * Parses body content based on content-type
   * @private
   * @param {string} bodyData - Raw body data
   * @param {string} contentType - Content-Type header value
   * @returns {unknown} Parsed body content
   * @throws {Error} For unsupported content-types or parsing errors
   */
  private parseBodyByContentType(
    bodyData: string,
    contentType: string,
  ): unknown {
    const [type] = contentType.split(';');

    switch (type.trim()) {
      case 'application/json':
        try {
          return JSON.parse(bodyData);
        } catch (error) {
          throw new Error(`Invalid JSON: ${error.message}`);
        }

      case 'application/x-www-form-urlencoded':
        return this.parseFormData(bodyData);

      case 'multipart/form-data':
        throw new Error('Multipart form data parsing not yet implemented');

      case 'text/plain':
      case 'text/html':
      case 'text/css':
      case 'text/javascript':
        return bodyData;

      default:
        // For unknown content types, return as string
        return bodyData;
    }
  }

  /**
   * Parses URL-encoded form data
   * @private
   * @param {string} formData - URL-encoded form data
   * @returns {Record<string, string>} Parsed form data object
   */
  private parseFormData(formData: string): Record<string, string> {
    const result: Record<string, string> = {};
    const pairs = formData.split('&');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        result[decodeURIComponent(key)] = value
          ? decodeURIComponent(value)
          : '';
      }
    }

    return result;
  }

  /**
   * Retrieves stored data from request context
   * @method
   * @template T - Expected value type
   * @param {string} key - Storage key
   * @returns {T | undefined} Stored value or undefined
   */
  get<T>(key: string): T | undefined {
    return this.storage.get(key) as T;
  }

  /**
   * Stores data in request context
   * @method
   * @param {string} key - Storage key
   * @param {unknown} value - Value to store
   */
  set(key: string, value: unknown): void {
    this.storage.set(key, value);
  }

  /**
   * Gets request cookies as a parsed object
   * @method
   * @returns {Record<string, string>} Parsed cookies object
   */
  cookies(): Record<string, string> {
    if (this._cookies === null) {
      const cookieHeader = this.headers.cookie;
      this._cookies = cookieHeader ? parseCookie(cookieHeader) : {};
    }
    return this._cookies || {};
  }

  /**
   * Gets a specific cookie value
   * @method
   * @param {string} name - Cookie name
   * @returns {string | undefined} Cookie value or undefined
   */
  cookie(name: string): string | undefined {
    return this.cookies()[name];
  }

  /**
   * Checks if request accepts a specific content type
   * @method
   * @param {string} contentType - Content type to check
   * @returns {boolean} True if content type is accepted
   */
  accepts(contentType: string): boolean {
    const acceptHeader = this.headers.accept || '';
    return acceptHeader.includes(contentType) || acceptHeader.includes('*/*');
  }

  /**
   * Checks if request is JSON
   * @method
   * @returns {boolean} True if content-type is JSON
   */
  isJson(): boolean {
    const contentType = this.headers['content-type'] || '';
    return contentType.includes('application/json');
  }

  /**
   * Checks if request is form data
   * @method
   * @returns {boolean} True if content-type is form data
   */
  isFormData(): boolean {
    const contentType = this.headers['content-type'] || '';
    return (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    );
  }

  /**
   * Checks if request is AJAX/XMLHttpRequest
   * @method
   * @returns {boolean} True if request is AJAX
   */
  isAjax(): boolean {
    return this.headers['x-requested-with'] === 'XMLHttpRequest';
  }

  /**
   * Gets client IP address
   * @method
   * @returns {string} Client IP address
   */
  ip(): string {
    return (
      (this.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (this.headers['x-real-ip'] as string) ||
      this.req.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Gets request user agent
   * @method
   * @returns {string} User agent string
   */
  userAgent(): string {
    return this.headers['user-agent'] || '';
  }

  /**
   * Checks if request is secure (HTTPS)
   * @method
   * @returns {boolean} True if request is secure
   */
  isSecure(): boolean {
    return (
      this.headers['x-forwarded-proto'] === 'https' ||
      (this.req.socket as any)?.encrypted === true
    );
  }

  /**
   * Gets request host
   * @method
   * @returns {string} Request host
   */
  host(): string {
    return this.headers.host || 'unknown';
  }

  /**
   * Gets request protocol
   * @method
   * @returns {string} Request protocol (http or https)
   */
  protocol(): string {
    return this.isSecure() ? 'https' : 'http';
  }

  /**
   * Gets full request URL
   * @method
   * @returns {string} Complete request URL
   */
  url(): string {
    return `${this.protocol()}://${this.host()}${this.pathname}`;
  }
}

/**
 * Parses URL query parameters with type conversion
 * @function
 * @param {URLSearchParams} url - Raw query parameters
 * @param {Lithia} lithia - Lithia instance for configuration
 * @returns {Query} Processed query parameters object
 *
 * @example
 * // Converts ?num=42&bool=true&arr=1,2,3 to:
 * // { num: 42, bool: true, arr: ['1', '2', '3'] }
 */
export function parseQuery(url: URLSearchParams, lithia: Lithia): Query {
  const { number, boolean, array } = lithia.options.server.request.queryParser;
  const query: Query = {};

  for (const [key, value] of url.entries()) {
    if (number.enabled && !Number.isNaN(Number(value)) && value !== '') {
      query[key] = Number(value);
      continue;
    }

    if (boolean.enabled && (value === 'true' || value === 'false')) {
      query[key] = value === 'true';
      continue;
    }

    if (array.enabled && array.delimiter && value.includes(array.delimiter)) {
      query[key] = value.split(array.delimiter);
      continue;
    }

    query[key] = value;
  }

  return query;
}
