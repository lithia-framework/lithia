import { type ErrorData, HttpStatusCode } from "./types";

/**
 * Base HTTP error class with comprehensive error handling.
 */
export class HttpError extends Error {
	public readonly _isHttpError = true;
	public readonly status: HttpStatusCode;
	public readonly code?: string;
	public readonly data?: ErrorData;
	public readonly timestamp: string;
	public readonly requestId?: string;

	constructor(
		status: HttpStatusCode,
		message: string,
		data?: ErrorData,
		requestId?: string,
	) {
		super(message);
		this.name = this.constructor.name;
		this.status = status;
		this.message = message;
		this.data = data;
		this.requestId = requestId;
		this.timestamp = new Date().toISOString();

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Converts the error to a JSON-serializable object.
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			status: this.status,
			message: this.message,
			code: this.code,
			data: this.data,
			timestamp: this.timestamp,
			requestId: this.requestId,
		};
	}

	/**
	 * Checks if the error is a client error (4xx).
	 */
	isClientError(): boolean {
		return this.status >= 400 && this.status < 500;
	}

	/**
	 * Checks if the error is a server error (5xx).
	 */
	isServerError(): boolean {
		return this.status >= 500 && this.status < 600;
	}

	/**
	 * Checks if the error is retryable.
	 */
	isRetryable(): boolean {
		// 5xx errors and some 4xx errors are retryable
		return (
			this.isServerError() ||
			this.status === HttpStatusCode.TOO_MANY_REQUESTS ||
			this.status === HttpStatusCode.REQUEST_TIMEOUT ||
			this.status === HttpStatusCode.GATEWAY_TIMEOUT
		);
	}
}
