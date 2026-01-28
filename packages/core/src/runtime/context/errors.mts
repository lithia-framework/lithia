import { RuntimeError } from "../errors.mjs";

export class NotInRequestHandlerError extends RuntimeError {
	constructor() {
		super(
			"This operation can only be performed within a request handler.",
			"fatal",
		);
	}
}

export class NotInEventHandlerError extends RuntimeError {
	constructor() {
		super(
			"This operation can only be performed within an event handler.",
			"fatal",
		);
	}
}
