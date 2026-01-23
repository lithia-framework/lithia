import { HttpError } from "./base-error";
import { type ErrorData, HttpStatusCode } from "./types";

/**
 * 5xx Server Error Classes
 */

export class InternalServerError extends HttpError {
	constructor(
		message = "Internal Server Error",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.INTERNAL_SERVER_ERROR, message, data, requestId);
	}
}

export class NotImplementedError extends HttpError {
	constructor(
		message = "Not Implemented",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.NOT_IMPLEMENTED, message, data, requestId);
	}
}

export class BadGatewayError extends HttpError {
	constructor(message = "Bad Gateway", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.BAD_GATEWAY, message, data, requestId);
	}
}

export class ServiceUnavailableError extends HttpError {
	constructor(
		message = "Service Unavailable",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.SERVICE_UNAVAILABLE, message, data, requestId);
	}
}

export class GatewayTimeoutError extends HttpError {
	constructor(
		message = "Gateway Timeout",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.GATEWAY_TIMEOUT, message, data, requestId);
	}
}

export class HttpVersionNotSupportedError extends HttpError {
	constructor(
		message = "HTTP Version Not Supported",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.HTTP_VERSION_NOT_SUPPORTED, message, data, requestId);
	}
}

export class VariantAlsoNegotiatesError extends HttpError {
	constructor(
		message = "Variant Also Negotiates",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.VARIANT_ALSO_NEGOTIATES, message, data, requestId);
	}
}

export class InsufficientStorageError extends HttpError {
	constructor(
		message = "Insufficient Storage",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.INSUFFICIENT_STORAGE, message, data, requestId);
	}
}

export class LoopDetectedError extends HttpError {
	constructor(message = "Loop Detected", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.LOOP_DETECTED, message, data, requestId);
	}
}

export class NotExtendedError extends HttpError {
	constructor(message = "Not Extended", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.NOT_EXTENDED, message, data, requestId);
	}
}

export class NetworkAuthenticationRequiredError extends HttpError {
	constructor(
		message = "Network Authentication Required",
		data?: ErrorData,
		requestId?: string,
	) {
		super(
			HttpStatusCode.NETWORK_AUTHENTICATION_REQUIRED,
			message,
			data,
			requestId,
		);
	}
}
