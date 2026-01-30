/**
 * @fileoverview Better-Auth Integration Middleware for Lithia.js.
 * Provides session validation and context-based session access via hooks.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
	LithiaError,
	type RouteMiddleware,
	UnauthorizedError,
} from "@lithia-js/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "better-auth/types";

/**
 * Options to configure the behavior of the authentication middleware.
 */
interface AuthMiddlewareOptions {
	error: {
		/** Whether to throw an UnauthorizedError if the session is missing. */
		throw: boolean;
		/** Custom error message for the unauthorized response. */
		message: string;
	};
}

/**
 * The structure of the authentication data stored in AsyncLocalStorage.
 */
export type AuthContext<T extends Auth = Auth> = {
	session: Awaited<ReturnType<T["api"]["getSession"]>>;
};

/**
 * Global key for the Auth context to ensure singleton behavior.
 */
const AUTH_CONTEXT_KEY = Symbol.for("lithia.auth_context.v1");

/**
 * Retrieves the global AsyncLocalStorage instance for authentication.
 */
function getGlobalAuthStore(): AsyncLocalStorage<AuthContext> {
	const globalAny = globalThis as any;
	if (!globalAny[AUTH_CONTEXT_KEY]) {
		globalAny[AUTH_CONTEXT_KEY] = new AsyncLocalStorage<AuthContext>();
	}
	return globalAny[AUTH_CONTEXT_KEY];
}

const authContextStore = getGlobalAuthStore();

/**
 * Middleware to authenticate requests using Better-Auth.
 * It injects the session into the execution context for subsequent handlers.
 * * @param auth The Better-Auth instance.
 * @param options Configuration for error handling.
 * @returns A standard Lithia RouteMiddleware.
 */
export function authenticated(
	auth: Auth,
	options: AuthMiddlewareOptions = {
		error: {
			message: "No valid authentication session found",
			throw: true,
		},
	},
): RouteMiddleware {
	return async (req, _, next) => {
		// 1. Resolve session from incoming Node.js headers
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		// 2. Handle missing sessions
		if (!session && options.error.throw) {
			throw new UnauthorizedError(options.error.message);
		}

		// 3. Run the rest of the request within the Auth context
		await authContextStore.run({ session }, async () => {
			await next();
		});
	};
}

class NotInAuthContext extends LithiaError {
	constructor() {
		super(
			'Lithia Auth hooks must be used within an authenticated route. Did you forget to add the "authenticated" middleware?',
		);
	}
}

/**
 * Internal helper to access the raw authentication context.
 * * @template T The Auth instance type.
 * @throws {NotInAuthContext} If called outside an authenticated route.
 */
export function getAuthContext<T extends Auth = Auth>(): AuthContext<T> {
	const context = authContextStore.getStore() as AuthContext<T> | undefined;
	if (!context) {
		throw new NotInAuthContext();
	}
	return context;
}

/**
 * Hook to retrieve the current user session.
 * Must be used in a route protected by the 'authenticated' middleware.
 * * @template T The Auth instance type.
 * @returns The active user session data.
 * @example
 * const session = useSession();
 * console.log(session.user.email);
 */
export function useSession<T extends Auth = Auth>(): AuthContext<T>["session"] {
	const context = getAuthContext<T>();
	return context.session;
}
