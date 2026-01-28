import { RuntimeError } from "../errors.mjs";

export class RequestError extends RuntimeError {
	public readonly timestamp: Date;

	constructor(
		public readonly statusCode: number,
		message: string,
		cause?: any,
	) {
		super(message, "error", cause);
		this.timestamp = new Date();
	}

	serialize(): {
		code: string;
		message: string;
		level: "info" | "warning" | "error" | "fatal";
		cause: any;
	} {
		return {
			code: `HTTP_${this.statusCode}`,
			message: this.message,
			level: this.level,
			cause: this.cause,
		};
	}
}

export class RouteNotFoundError extends RequestError {
	constructor(path: string) {
		super(404, `No matched route found for path: ${path}`);
	}
}

export class RequestValidationError extends RequestError {
	constructor(
		message: string,
		public issues: any[],
	) {
		super(400, message);
	}
}
