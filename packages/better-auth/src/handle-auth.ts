import { type RouteHandler, RouteNotFoundError } from "@lithia-js/core";
import type { Auth } from "better-auth/types";

/**
 * Creates a Lithia route handler that proxies requests to a Better Auth
 * instance.
 *
 * Use this inside a catch-all auth route such as
 * `src/app/routes/api/auth/[...all]/route.ts`.
 *
 * The returned handler accepts only `GET` and `POST`, translates the current
 * Lithia request into a Fetch `Request`, forwards it to `auth.handler()`, and
 * then maps the Better Auth response back into the active Lithia response.
 *
 * A `404` returned by Better Auth is converted into Lithia's
 * `RouteNotFoundError` so the normal request error pipeline can decide how to
 * expose that miss.
 *
 * @param {Auth} auth - Better Auth instance whose `handler()` should receive
 * the proxied auth requests.
 * @returns {RouteHandler} Lithia route handler that bridges the auth endpoint
 * into Better Auth.
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
