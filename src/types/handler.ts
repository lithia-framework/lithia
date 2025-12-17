import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { Metadata, Params, Query } from './route';

/**
 * Represents an incoming HTTP request with enhanced capabilities
 * @interface
 */
export interface LithiaRequest {
  /** Immutable URL path component */
  pathname: Readonly<string>;
  /** Uppercase HTTP method (GET/POST/PUT etc) */
  method: Readonly<string>;
  /** Immutable map of request headers */
  headers: Readonly<IncomingHttpHeaders>;
  /** Processed query parameters with type conversion */
  query: Readonly<Query>;
  /** Route parameters from dynamic path segments */
  params: Readonly<Params>;

  /**
   * Parses and returns request body
   * @template T - Expected body type
   * @returns {Promise<Readonly<T>>} Parsed body content
   */
  body: <T = unknown>() => Promise<Readonly<T>>;

  /**
   * Retrieves context value by key
   * @template T - Expected value type
   * @param {string} key - Storage key
   * @returns {T | undefined} Stored value or undefined
   */
  get: <T>(key: string) => T | undefined;

  /**
   * Stores value in request context
   * @param {string} key - Storage key
   * @param {unknown} value - Value to store
   */
  set: (key: string, value: unknown) => void;

  /**
   * Handles request stream events
   * @param {'data' | 'end' | 'error'} event - Event type
   * @param {(chunk: unknown) => void} listener - Event handler
   */
  on: (
    event: 'data' | 'end' | 'error',
    listener: (chunk: unknown) => void,
  ) => void;

  // Enhanced helper methods
  /** Gets request cookies as parsed object */
  cookies: () => Record<string, string>;
  /** Gets specific cookie value */
  cookie: (name: string) => string | undefined;
  /** Checks if request accepts content type */
  accepts: (contentType: string) => boolean;
  /** Checks if request is JSON */
  isJson: () => boolean;
  /** Checks if request is form data */
  isFormData: () => boolean;
  /** Checks if request is AJAX */
  isAjax: () => boolean;
  /** Gets client IP address */
  ip: () => string;
  /** Gets request user agent */
  userAgent: () => string;
  /** Checks if request is secure (HTTPS) */
  isSecure: () => boolean;
  /** Gets request host */
  host: () => string;
  /** Gets request protocol */
  protocol: () => string;
  /** Gets full request URL */
  url: () => string;
}

/**
 * Represents the HTTP response interface with chainable methods
 */
export interface LithiaResponse {
  /** Current HTTP status code */
  statusCode: number;

  /**
   * Sets HTTP status code
   * @param {number} status - Valid HTTP status code
   * @returns {LithiaResponse} Instance for chaining
   */
  status: (status: number) => LithiaResponse;

  /**
   * Retrieves current response headers
   * @returns {Readonly<OutgoingHttpHeaders>} Immutable headers copy
   */
  headers: () => Readonly<OutgoingHttpHeaders>;

  /**
   * Adds/updates a response header
   * @param {string} name - Header name
   * @param {string} value - Header value
   * @returns {LithiaResponse} Instance for chaining
   */
  addHeader: (
    name: string,
    value: string | number | string[],
  ) => LithiaResponse;

  /**
   * Removes a response header
   * @param {string} name - Header name to remove
   * @returns {LithiaResponse} Instance for chaining
   */
  removeHeader: (name: string) => LithiaResponse;

  /**
   * Sets multiple headers at once
   * @param {OutgoingHttpHeaders} headers - Headers object
   * @returns {LithiaResponse} Instance for chaining
   */
  setHeaders: (headers: OutgoingHttpHeaders) => LithiaResponse;

  /**
   * Sends response with automatic content handling
   * @param {unknown} [data] - Response payload (string/object/buffer)
   */
  send: (data?: unknown) => void;

  /** Finalizes response without body */
  end: () => void;

  /**
   * Sends JSON response with proper headers
   * @param {object} data - JSON-serializable object
   */
  json: (data: object) => void;

  /**
   * Performs HTTP redirect
   * @param {string} url - Redirect URL
   * @param {number} [status=302] - Redirect status code
   */
  redirect: (url: string, status?: number) => void;

  /**
   * Handles response stream events
   * @param {'data' | 'end' | 'error'} event - Event type
   * @param {(chunk: unknown) => void} listener - Event handler
   */
  on: (
    event: 'close' | 'drain' | 'error' | 'finish' | 'pipe' | 'unpipe',
    listener: (chunk: unknown) => void,
  ) => void;

  // HTTP Status Code Helpers
  /** Sends 200 OK response */
  ok: (data?: unknown) => void;
  /** Sends 201 Created response */
  created: (data?: unknown) => void;
  /** Sends 204 No Content response */
  noContent: () => void;
  /** Sends 400 Bad Request response */
  badRequest: (data?: unknown) => void;
  /** Sends 401 Unauthorized response */
  unauthorized: (data?: unknown) => void;
  /** Sends 403 Forbidden response */
  forbidden: (data?: unknown) => void;
  /** Sends 404 Not Found response */
  notFound: (data?: unknown) => void;
  /** Sends 409 Conflict response */
  conflict: (data?: unknown) => void;
  /** Sends 422 Unprocessable Entity response */
  unprocessableEntity: (data?: unknown) => void;
  /** Sends 429 Too Many Requests response */
  tooManyRequests: (data?: unknown) => void;
  /** Sends 500 Internal Server Error response */
  internalServerError: (data?: unknown) => void;
  /** Sends 502 Bad Gateway response */
  badGateway: (data?: unknown) => void;
  /** Sends 503 Service Unavailable response */
  serviceUnavailable: (data?: unknown) => void;

  // Cookie Helpers
  /** Sets a cookie */
  cookie: (
    name: string,
    value: string,
    options?: {
      domain?: string;
      expires?: Date;
      httpOnly?: boolean;
      maxAge?: number;
      path?: string;
      sameSite?: boolean | 'lax' | 'strict' | 'none';
      secure?: boolean;
    },
  ) => LithiaResponse;
  /** Clears a cookie */
  clearCookie: (
    name: string,
    options?: {
      domain?: string;
      expires?: Date;
      httpOnly?: boolean;
      maxAge?: number;
      path?: string;
      sameSite?: boolean | 'lax' | 'strict' | 'none';
      secure?: boolean;
    },
  ) => LithiaResponse;

  // CORS Helpers
  /** Sets CORS headers */
  cors: (options?: {
    origin?: string | string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
  }) => LithiaResponse;

  // Cache Helpers
  /** Sets cache headers */
  cache: (options?: {
    maxAge?: number;
    sMaxAge?: number;
    private?: boolean;
    noCache?: boolean;
    noStore?: boolean;
    mustRevalidate?: boolean;
    etag?: string;
  }) => LithiaResponse;

  // File Helpers
  /** Sends file as download */
  download: (
    filePath: string,
    filename?: string,
    options?: {
      root?: string;
      headers?: OutgoingHttpHeaders;
    },
  ) => void;
  /** Sends file with appropriate headers */
  sendFile: (
    filePath: string,
    options?: {
      root?: string;
      headers?: OutgoingHttpHeaders;
      cache?: boolean;
    },
  ) => void;
}

/**
 * Core request handler type for route processing
 * @async
 * @callback LithiaHandler
 * @param {LithiaRequest} req - Request object
 * @param {LithiaResponse} res - Response object
 * @returns {Promise<void>}
 */
export type LithiaHandler = (
  req: LithiaRequest,
  res: LithiaResponse,
) => Promise<void>;

/**
 * Middleware handler type for pre/post processing
 * @async
 * @callback LithiaMiddleware
 * @param {LithiaRequest} req - Request object
 * @param {LithiaResponse} res - Response object
 * @param {Function} next - Proceeds to next middleware/handler
 * @returns {Promise<void>}
 */
export type LithiaMiddleware = (
  req: LithiaRequest,
  res: LithiaResponse,
  next: () => void,
) => Promise<void>;

/**
 * Route module definition structure
 * @typedef {Object} RouteModule
 * @property {LithiaHandler} default - Primary route handler
 * @property {LithiaMiddleware[]} [middlewares] - Array of middleware functions
 * @property {unknown} [metadata] - Additional route metadata
 */
export type RouteModule = {
  /** Required main route handler */
  default?: LithiaHandler;
  /** Optional middleware chain */
  middlewares?: LithiaMiddleware[];
  /** Custom route metadata */
  metadata?: Metadata;
};
