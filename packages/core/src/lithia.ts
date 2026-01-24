import type { Route } from "@lithiajs/native";

export type Environment = "production" | "development";

export interface LithiaCreateOptions {
	environment: Environment;
}

export class Lithia {
	private environment: Environment;
	private routes: Route[];

	constructor(options: LithiaCreateOptions) {
		this.environment = options.environment;
	}
}
