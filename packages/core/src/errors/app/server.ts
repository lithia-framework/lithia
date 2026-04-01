import { LithiaClientError } from "../base";

/**
 * Indicates that the server hit an unexpected internal failure.
 */
export class InternalServerError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 500, d);
	}
}
/**
 * Indicates that the service is temporarily unavailable.
 */
export class ServiceUnavailableError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 503, d);
	}
}
/**
 * Indicates that an upstream operation timed out.
 */
export class GatewayTimeoutError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 504, d);
	}
}
