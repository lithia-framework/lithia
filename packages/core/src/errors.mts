export class InstanceError extends Error {
	constructor(
		message: string,
		public readonly level: "error" | "warning" | "fatal",
	) {
		super(message);
	}
}

export class EnvironmentNotSupportedError extends InstanceError {
	constructor(environment: string) {
		super(
			`The operation is not supported in the "${environment}" environment.`,
			"error",
		);
	}
}
