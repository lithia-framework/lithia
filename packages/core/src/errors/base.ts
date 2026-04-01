/**
 * Base error type for Lithia-specific failures.
 */
export class LithiaError extends Error {
	public readonly isLithiaError = true;
	constructor(message?: string) {
		super(message);
		this.name = this.constructor.name;
		Object.setPrototypeOf(this, new.target.prototype); // Fixes inheritance in older environments
	}
}

/**
 * HTTP-oriented application error with a status code and optional details.
 *
 * Throw this from routes when you want Lithia to return a structured client
 * error response.
 */
export class LithiaClientError extends LithiaError {
	public readonly timestamp = new Date();
	constructor(
		message: string,
		public readonly statusCode: number,
		public readonly details?: any,
	) {
		super(message);
	}
}

/**
 * Event-oriented error that captures the event name and optional details.
 *
 * Used when socket event handling needs to surface a structured failure.
 */
export class LithiaEventError extends LithiaError {
	public readonly timestamp = new Date();
	constructor(
		message: string,
		public readonly eventName: string,
		public readonly details?: any,
	) {
		super(message);
	}
}
