import { AsyncLocalStorage } from "node:async_hooks";
import { type Middleware, RequestError } from "@lithia-js/core/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "better-auth/types";

interface AuthMiddlewareOptions {
	error: {
		throw: boolean;
		message: string;
	};
}

export type AuthContext<T extends Auth = Auth> = {
	session: Awaited<ReturnType<T["api"]["getSession"]>>;
};

const authContext = new AsyncLocalStorage<AuthContext>();

export function authenticated(
	auth: Auth,
	options: AuthMiddlewareOptions = {
		error: {
			message: "No valid authentication session found",
			throw: true,
		},
	},
): Middleware {
	return async (req, _, next) => {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		if (!session)
			if (options.error.throw) {
				throw new RequestError(401, options.error.message);
			}

		authContext.run({ session }, async () => {
			await next();
		});
	};
}

export function getAuthContext<T extends Auth = Auth>(): AuthContext<T> {
	const context = authContext.getStore() as AuthContext<T> | undefined;
	if (!context) {
		throw new Error("No authentication context available");
	}
	return context;
}

export function useSession<T extends Auth = Auth>(): AuthContext<T>["session"] {
	const context = getAuthContext<T>();
	return context.session;
}
