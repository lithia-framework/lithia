import { isAsyncFunction } from "node:util/types";
import type { Route, RouteModule } from "lithia/types";

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
}

export interface RouteValidator {
	validateRoute(route: Route): ValidationResult;
	validateModule(module: RouteModule): ValidationResult;
}

export class DefaultRouteValidator implements RouteValidator {
	validateRoute(route: Route): ValidationResult {
		const errors: string[] = [];

		if (!route.path) {
			errors.push("Route path is required");
		}

		if (!route.filePath) {
			errors.push("Route filePath is required");
		}

		if (!route.regex) {
			errors.push("Route regex is required");
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	}

	validateModule(module: RouteModule): ValidationResult {
		const errors: string[] = [];

		if (typeof module?.default !== "function") {
			errors.push("Route module must export a default function");
		} else if (!isAsyncFunction(module.default)) {
			errors.push("Route handler must be an async function");
		}

		if (module.middlewares) {
			for (let i = 0; i < module.middlewares.length; i++) {
				const middleware = module.middlewares[i];
				if (typeof middleware !== "function") {
					errors.push(`Middleware at index ${i} must be a function`);
				} else if (!isAsyncFunction(middleware)) {
					errors.push(`Middleware at index ${i} must be an async function`);
				}
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	}
}
