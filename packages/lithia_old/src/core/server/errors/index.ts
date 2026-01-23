/**
 * HTTP Error System - Main Export File
 *
 * This module provides a comprehensive HTTP error handling system with:
 * - All standard HTTP status codes
 * - Base error class with advanced features
 * - Specific error classes for common scenarios
 * - Factory patterns for error creation
 * - Utility functions for error handling
 */

// Base Error Class
export { HttpError } from "./base-error";
// Client Error Classes (4xx)
export {
	BadRequestError,
	ConflictError,
	ExpectationFailedError,
	FailedDependencyError,
	ForbiddenError,
	GoneError,
	ImATeapotError,
	LengthRequiredError,
	LockedError,
	MethodNotAllowedError,
	MisdirectedRequestError,
	NotAcceptableError,
	NotFoundError,
	PayloadTooLargeError,
	PaymentRequiredError,
	PreconditionFailedError,
	PreconditionRequiredError,
	ProxyAuthenticationRequiredError,
	RangeNotSatisfiableError,
	RequestHeaderFieldsTooLargeError,
	RequestTimeoutError,
	TooEarlyError,
	TooManyRequestsError,
	UnauthorizedError,
	UnavailableForLegalReasonsError,
	UnprocessableEntityError,
	UnsupportedMediaTypeError,
	UpgradeRequiredError,
	UriTooLongError,
} from "./client-errors";
// Factory Classes and Methods
export { ErrorFactory, HttpErrorFactory } from "./error-factory";
// Utility Functions
export { ErrorUtils } from "./error-utils";
// Server Error Classes (5xx)
export {
	BadGatewayError,
	GatewayTimeoutError,
	HttpVersionNotSupportedError,
	InsufficientStorageError,
	InternalServerError,
	LoopDetectedError,
	NetworkAuthenticationRequiredError,
	NotExtendedError,
	NotImplementedError,
	ServiceUnavailableError,
	VariantAlsoNegotiatesError,
} from "./server-errors";
// Types and Enums
export { type ErrorData, HttpStatusCode } from "./types";
