/**
 * @fileoverview Better-Auth Handler Bridge for Lithia.js.
 * This handler proxies incoming HTTP requests to the Better-Auth engine,
 * handling the translation between Lithia/Node.js types and Web Standard Fetch types.
 */

import { type RouteHandler, RouteNotFoundError } from "@lithia-js/core";
import type { Auth } from "better-auth/types";

/**
 * Creates a Lithia RouteHandler to serve Better-Auth API routes.
 * It translates headers, body, and methods to a Web Standard Request.
 * * @param auth The Better-Auth instance.
 * @returns A RouteHandler compatible with Lithia's routing system.
 */
export function handleAuth(auth: Auth): RouteHandler {
	return async (req, res) => {
		// 1. Better-Auth typically only handles GET and POST
		if (!["POST", "GET"].includes(req.method)) {
			res.status(405).send("Method Not Allowed");
			return;
		}

		const rawBody = await req.body();
		const hasBody = rawBody && Object.keys(rawBody).length > 0;

		// 2. Map Node.js headers to Web Standard Headers
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

		// 3. Construct the Web Standard Request for Better-Auth
		const authReq = new Request(`http://internal${req.pathname}`, {
			method: req.method,
			headers,
			body: hasBody ? JSON.stringify(rawBody) : undefined,
		});

		// 4. Execute Better-Auth logic
		const authRes = await auth.handler(authReq);

		// 5. Proxy back the response headers
		// We skip hop-by-hop headers that Node.js/Lithia manages automatically
		authRes.headers.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			if (lowerKey !== "transfer-encoding" && lowerKey !== "content-length") {
				res.setHeader(key, value);
			}
		});

		// 6. Handle specific status cases
		if (authRes.status === 404) {
			throw new RouteNotFoundError(`Auth route '${req.pathname}' not found.`);
		}

		// 7. Stream the body back to the client
		const responseBody = authRes.body
			? await new Response(authRes.body).text()
			: undefined;

		res.status(authRes.status).send(responseBody);
	};
}
