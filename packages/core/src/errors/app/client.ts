import { LithiaClientError } from "../base";

/**
 * Indicates that the client sent an invalid request.
 */
export class BadRequestError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 400, d);
	}
}
/**
 * Indicates that authentication is required or invalid.
 */
export class UnauthorizedError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 401, d);
	}
}
/**
 * Indicates that the authenticated client is not allowed to perform the action.
 */
export class ForbiddenError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 403, d);
	}
}
/**
 * Indicates that no matching route was found for the current request.
 */
export class RouteNotFoundError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 404, d);
	}
}
/**
 * Indicates that a requested resource does not exist.
 */
export class NotFoundError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 404, d);
	}
}
/**
 * Indicates that the request conflicts with the current server state.
 */
export class ConflictError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 409, d);
	}
}
