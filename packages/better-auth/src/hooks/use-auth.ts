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
 *
 * These options control whether missing sessions are tolerated or turned into
 * immediate authorization failures.
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
 *
 * The context is created by `authenticated()` and later consumed by
 * `getAuthContext()` and `useSession()`.
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
 *
 * The middleware reads the current request headers, asks Better Auth to resolve
 * the session, and then runs the remainder of the route pipeline inside an
 * `AsyncLocalStorage` scope that exposes the resolved auth context.
 *
 * @param {Auth} auth - Better Auth instance used to resolve the current
 * request session.
 * @param {AuthMiddlewareOptions} [options] - Controls how missing sessions are
 * handled.
 * @returns {RouteMiddleware} Route middleware that populates auth context for
 * the remainder of the current request pipeline.
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
 *
 * @returns {AuthContext<T>} Request-local Better Auth context.
 * @throws {NotInAuthContext} Thrown when no auth context has been established
 * for the current request.
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
 *
 * @returns {AuthContext<T>["session"]} Session resolved for the current
 * request, which may be `null` when middleware was configured not to throw on
 * missing sessions.
 * @throws {NotInAuthContext} Thrown when called outside an authenticated route
 * context.
 */
export function useSession<T extends Auth = Auth>(): AuthContext<T>["session"] {
	const context = getAuthContext<T>();
	return context.session;
}
