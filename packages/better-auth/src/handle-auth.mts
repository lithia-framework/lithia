import type { RouteHandler } from "@lithia-js/core";
import { RouteNotFoundError } from "@lithia-js/core/_";
import type { Auth } from "better-auth/types";

export function handleAuth(auth: Auth): RouteHandler {
	return async (req, res) => {
		if (!["POST", "GET"].includes(req.method)) {
			res.status(405).send("Method Not Allowed");
			return;
		}

		const body = await req.body();

		const headers = new Headers();
		Object.entries(req.headers).forEach(([key, value]) => {
			if (value) headers.append(key, value.toString());
		});

		if (body && Object.keys(body).length > 0) {
			headers.set("Content-Type", "application/json");
		}

		const authReq = new Request(`http://internal${req.pathname}`, {
			method: req.method,
			headers,
			body:
				body && Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
		});

		const authRes = await auth.handler(authReq);

		authRes.headers.forEach((value, key) => {
			if (
				!["transfer-encoding", "content-length"].includes(key.toLowerCase())
			) {
				res.setHeader(key, value);
			}
		});

		if (authRes.status === 404) {
			throw new RouteNotFoundError(req.pathname);
		}

		const text = authRes.body
			? await new Response(authRes.body).text()
			: undefined;

		res.status(authRes.status).send(text);
	};
}
