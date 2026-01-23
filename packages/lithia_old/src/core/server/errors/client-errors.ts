import { HttpError } from "./base-error";
import { type ErrorData, HttpStatusCode } from "./types";

/**
 * 4xx Client Error Classes
 */

export class BadRequestError extends HttpError {
	constructor(message = "Bad Request", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.BAD_REQUEST, message, data, requestId);
	}
}

export class UnauthorizedError extends HttpError {
	constructor(message = "Unauthorized", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.UNAUTHORIZED, message, data, requestId);
	}
}

export class PaymentRequiredError extends HttpError {
	constructor(
		message = "Payment Required",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.PAYMENT_REQUIRED, message, data, requestId);
	}
}

export class ForbiddenError extends HttpError {
	constructor(message = "Forbidden", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.FORBIDDEN, message, data, requestId);
	}
}

export class NotFoundError extends HttpError {
	constructor(message = "Not Found", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.NOT_FOUND, message, data, requestId);
	}
}

export class MethodNotAllowedError extends HttpError {
	constructor(
		message = "Method Not Allowed",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.METHOD_NOT_ALLOWED, message, data, requestId);
	}
}

export class NotAcceptableError extends HttpError {
	constructor(
		message = "Not Acceptable",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.NOT_ACCEPTABLE, message, data, requestId);
	}
}

export class ProxyAuthenticationRequiredError extends HttpError {
	constructor(
		message = "Proxy Authentication Required",
		data?: ErrorData,
		requestId?: string,
	) {
		super(
			HttpStatusCode.PROXY_AUTHENTICATION_REQUIRED,
			message,
			data,
			requestId,
		);
	}
}

export class RequestTimeoutError extends HttpError {
	constructor(
		message = "Request Timeout",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.REQUEST_TIMEOUT, message, data, requestId);
	}
}

export class ConflictError extends HttpError {
	constructor(message = "Conflict", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.CONFLICT, message, data, requestId);
	}
}

export class GoneError extends HttpError {
	constructor(message = "Gone", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.GONE, message, data, requestId);
	}
}

export class LengthRequiredError extends HttpError {
	constructor(
		message = "Length Required",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.LENGTH_REQUIRED, message, data, requestId);
	}
}

export class PreconditionFailedError extends HttpError {
	constructor(
		message = "Precondition Failed",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.PRECONDITION_FAILED, message, data, requestId);
	}
}

export class PayloadTooLargeError extends HttpError {
	constructor(
		message = "Payload Too Large",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.PAYLOAD_TOO_LARGE, message, data, requestId);
	}
}

export class UriTooLongError extends HttpError {
	constructor(message = "URI Too Long", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.URI_TOO_LONG, message, data, requestId);
	}
}

export class UnsupportedMediaTypeError extends HttpError {
	constructor(
		message = "Unsupported Media Type",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.UNSUPPORTED_MEDIA_TYPE, message, data, requestId);
	}
}

export class RangeNotSatisfiableError extends HttpError {
	constructor(
		message = "Range Not Satisfiable",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.RANGE_NOT_SATISFIABLE, message, data, requestId);
	}
}

export class ExpectationFailedError extends HttpError {
	constructor(
		message = "Expectation Failed",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.EXPECTATION_FAILED, message, data, requestId);
	}
}

export class ImATeapotError extends HttpError {
	constructor(message = "I'm a teapot", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.IM_A_TEAPOT, message, data, requestId);
	}
}

export class MisdirectedRequestError extends HttpError {
	constructor(
		message = "Misdirected Request",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.MISDIRECTED_REQUEST, message, data, requestId);
	}
}

export class UnprocessableEntityError extends HttpError {
	constructor(
		message = "Unprocessable Entity",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.UNPROCESSABLE_ENTITY, message, data, requestId);
	}
}

export class LockedError extends HttpError {
	constructor(message = "Locked", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.LOCKED, message, data, requestId);
	}
}

export class FailedDependencyError extends HttpError {
	constructor(
		message = "Failed Dependency",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.FAILED_DEPENDENCY, message, data, requestId);
	}
}

export class TooEarlyError extends HttpError {
	constructor(message = "Too Early", data?: ErrorData, requestId?: string) {
		super(HttpStatusCode.TOO_EARLY, message, data, requestId);
	}
}

export class UpgradeRequiredError extends HttpError {
	constructor(
		message = "Upgrade Required",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.UPGRADE_REQUIRED, message, data, requestId);
	}
}

export class PreconditionRequiredError extends HttpError {
	constructor(
		message = "Precondition Required",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.PRECONDITION_REQUIRED, message, data, requestId);
	}
}

export class TooManyRequestsError extends HttpError {
	constructor(
		message = "Too Many Requests",
		data?: ErrorData,
		requestId?: string,
	) {
		super(HttpStatusCode.TOO_MANY_REQUESTS, message, data, requestId);
	}
}

export class RequestHeaderFieldsTooLargeError extends HttpError {
	constructor(
		message = "Request Header Fields Too Large",
		data?: ErrorData,
		requestId?: string,
	) {
		super(
			HttpStatusCode.REQUEST_HEADER_FIELDS_TOO_LARGE,
			message,
			data,
			requestId,
		);
	}
}

export class UnavailableForLegalReasonsError extends HttpError {
	constructor(
		message = "Unavailable For Legal Reasons",
		data?: ErrorData,
		requestId?: string,
	) {
		super(
			HttpStatusCode.UNAVAILABLE_FOR_LEGAL_REASONS,
			message,
			data,
			requestId,
		);
	}
}
