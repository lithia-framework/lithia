import { AsyncLocalStorage } from "node:async_hooks";
import {
	LithiaError,
	type RouteMiddleware,
	UnauthorizedError,
} from "@lithia-js/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "better-auth/types";

/**
 * Options used to configure the authentication middleware behavior.
 */
interface AuthMiddlewareOptions {
	error: {
		/**
		 * Whether to throw an UnauthorizedError when the session is missing.
		 */
		throw: boolean;
		/**
		 * Custom error message used when authentication fails.
		 */
		message: string;
	};
}

/**
 * Authentication context stored for the current request lifecycle.
 */
export type AuthContext<T extends Auth = Auth> = {
	session: Awaited<ReturnType<T["api"]["getSession"]>>;
};

const AUTH_CONTEXT_KEY = Symbol.for("lithia.auth_context.v1");

function getGlobalAuthStore(): AsyncLocalStorage<AuthContext> {
	const globalAny = globalThis as any;
	if (!globalAny[AUTH_CONTEXT_KEY]) {
		globalAny[AUTH_CONTEXT_KEY] = new AsyncLocalStorage<AuthContext>();
	}
	return globalAny[AUTH_CONTEXT_KEY];
}

const authContextStore = getGlobalAuthStore();

/**
 * Creates a Lithia route middleware that resolves the current Better Auth
 * session and stores it in request-local context.
 *
 * When `options.error.throw` is enabled, missing sessions are converted into an
 * `UnauthorizedError`.
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
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		if (!session && options.error.throw) {
			throw new UnauthorizedError(options.error.message);
		}

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
 * Returns the raw Better Auth context for the current request.
 *
 * Throws when called outside a route protected by `authenticated()`.
 */
export function getAuthContext<T extends Auth = Auth>(): AuthContext<T> {
	const context = authContextStore.getStore() as AuthContext<T> | undefined;
	if (!context) {
		throw new NotInAuthContext();
	}
	return context;
}

/**
 * Returns the current Better Auth session from request-local context.
 *
 * This hook must be used inside a route protected by the `authenticated()`
 * middleware.
 */
export function useSession<T extends Auth = Auth>(): AuthContext<T>["session"] {
	const context = getAuthContext<T>();
	return context.session;
}
