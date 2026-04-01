import { type RouteHandler, RouteNotFoundError } from "@lithia-js/core";
import type { Auth } from "better-auth/types";

/**
 * Creates a Lithia route handler that proxies requests to a Better Auth
 * instance.
 *
 * Use this inside a catch-all auth route such as
 * `src/app/routes/api/auth/[...all]/route.ts`.
 */
export function BetterAuth(auth: Auth): RouteHandler {
	return async (req, res) => {
		if (!["POST", "GET"].includes(req.method)) {
			res.status(405).send("Method Not Allowed");
			return;
		}

		const rawBody = await req.body();
		const hasBody = rawBody && Object.keys(rawBody).length > 0;

		const headers = new Headers();
		Object.entries(req.headers).forEach(([key, value]) => {
			if (value) {
				if (Array.isArray(value)) {
					value.forEach((v) => {
						headers.append(key, v);
					});
				} else {
					headers.append(key, String(value));
				}
			}
		});

		const authReq = new Request(`http://internal${req.pathname}`, {
			method: req.method,
			headers,
			body: hasBody ? JSON.stringify(rawBody) : undefined,
		});

		const authRes = await auth.handler(authReq);

		authRes.headers.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			if (lowerKey !== "transfer-encoding" && lowerKey !== "content-length") {
				res.setHeader(key, value);
			}
		});

		if (authRes.status === 404) {
			throw new RouteNotFoundError(`Auth route '${req.pathname}' not found.`);
		}

		const responseBody = authRes.body
			? await new Response(authRes.body).text()
			: undefined;

		res.status(authRes.status).send(responseBody);
	};
}
