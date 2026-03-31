export class LithiaError extends Error {
	public readonly isLithiaError = true;
	constructor(message?: string) {
		super(message);
		this.name = this.constructor.name;
		Object.setPrototypeOf(this, new.target.prototype); // Fixes inheritance in older environments
	}
}

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
