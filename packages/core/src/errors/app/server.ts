import { LithiaClientError } from "../base";

export class InternalServerError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 500, d);
	}
}
export class ServiceUnavailableError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 503, d);
	}
}
export class GatewayTimeoutError extends LithiaClientError {
	constructor(m: string, d?: any) {
		super(m, 504, d);
	}
}
