import { HttpError } from "./base-error";
import {
	ConflictError,
	ForbiddenError,
	MethodNotAllowedError,
	NotFoundError,
	TooManyRequestsError,
	UnauthorizedError,
	UnprocessableEntityError,
} from "./client-errors";
import type { ErrorData, HttpStatusCode } from "./types";

/**
 * Factory class for creating HTTP errors with consistent patterns.
 */
export class HttpErrorFactory {
	/**
	 * Creates a new HTTP error with the specified status code and message.
	 */
	static create(
		status: HttpStatusCode,
		message: string,
		data?: ErrorData,
		requestId?: string,
	): HttpError {
		return new HttpError(status, message, data, requestId);
	}

	/**
	 * Creates a client error (4xx).
	 */
	static clientError(
		status: HttpStatusCode,
		message: string,
		data?: ErrorData,
		requestId?: string,
	): HttpError {
		if (!HttpErrorFactory.isClientError(status)) {
			throw new Error(`Status ${status} is not a client error`);
		}
		return new HttpError(status, message, data, requestId);
	}

	/**
	 * Creates a server error (5xx).
	 */
	static serverError(
		status: HttpStatusCode,
		message: string,
		data?: ErrorData,
		requestId?: string,
	): HttpError {
		if (!HttpErrorFactory.isServerError(status)) {
			throw new Error(`Status ${status} is not a server error`);
		}
		return new HttpError(status, message, data, requestId);
	}

	/**
	 * Checks if a status code is a client error (4xx).
	 */
	private static isClientError(status: number): boolean {
		return status >= 400 && status < 500;
	}

	/**
	 * Checks if a status code is a server error (5xx).
	 */
	private static isServerError(status: number): boolean {
		return status >= 500 && status < 600;
	}
}

/**
 * Common error factory methods for specific use cases.
 */
export const ErrorFactory = {
	/**
	 * Creates a validation error with field information.
	 */
	validationError(
		message: string,
		field?: string,
		details?: unknown,
		requestId?: string,
	): UnprocessableEntityError {
		return new UnprocessableEntityError(
			message,
			{
				code: "VALIDATION_ERROR",
				field,
				details,
			},
			requestId,
		);
	},

	/**
	 * Creates an authentication error.
	 */
	authenticationError(
		message = "Authentication failed",
		requestId?: string,
	): UnauthorizedError {
		return new UnauthorizedError(
			message,
			{
				code: "AUTHENTICATION_ERROR",
			},
			requestId,
		);
	},

	/**
	 * Creates an authorization error.
	 */
	authorizationError(
		message = "Insufficient permissions",
		requestId?: string,
	): ForbiddenError {
		return new ForbiddenError(
			message,
			{
				code: "AUTHORIZATION_ERROR",
			},
			requestId,
		);
	},

	/**
	 * Creates a rate limit error.
	 */
	rateLimitError(
		message = "Rate limit exceeded",
		retryAfter?: number,
		requestId?: string,
	): TooManyRequestsError {
		return new TooManyRequestsError(
			message,
			{
				code: "RATE_LIMIT_ERROR",
				retryAfter,
			},
			requestId,
		);
	},

	/**
	 * Creates a resource not found error.
	 */
	resourceNotFoundError(
		resource: string,
		id?: string | number,
		requestId?: string,
	): NotFoundError {
		const message = id
			? `${resource} with id '${id}' not found`
			: `${resource} not found`;
		return new NotFoundError(
			message,
			{
				code: "RESOURCE_NOT_FOUND",
				resource,
				id,
			},
			requestId,
		);
	},

	/**
	 * Creates a method not allowed error.
	 */
	methodNotAllowedError(
		method: string,
		allowedMethods?: string[],
		requestId?: string,
	): MethodNotAllowedError {
		const message = `Method '${method}' not allowed`;
		return new MethodNotAllowedError(
			message,
			{
				code: "METHOD_NOT_ALLOWED",
				method,
				allowedMethods,
			},
			requestId,
		);
	},

	/**
	 * Creates a conflict error for duplicate resources.
	 */
	duplicateError(
		resource: string,
		field?: string,
		value?: unknown,
		requestId?: string,
	): ConflictError {
		const message = field
			? `${resource} with ${field} '${value}' already exists`
			: `${resource} already exists`;
		return new ConflictError(
			message,
			{
				code: "DUPLICATE_ERROR",
				resource,
				field,
				value,
			},
			requestId,
		);
	},
};
