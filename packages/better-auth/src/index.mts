import type { RouteHandler } from "@lithia-js/core/server";
import type { Auth } from "better-auth/types";

export function handleAuth(auth: Auth): RouteHandler {
	return async (req, res) => {
		if (!["POST", "GET"].includes(req.method)) {
			res.status(405).send("Method Not Allowed");
			return;
		}

		const headers = new Headers();
		const body = await req.body();

		Object.entries(req.headers).forEach(([key, value]) => {
			if (value) headers.append(key, value.toString());
		});

		const authReq = new Request(req.url(), {
			method: req.method,
			headers,
			...(body && Object.keys(body).length > 0
				? { body: JSON.stringify(body) }
				: {}),
		});

		const authRes = await auth.handler(authReq);

		authRes.headers.forEach((value, key) => {
			res.setHeader(key, value);
		});

		res
			.status(authRes.status)
			.send(authRes.body ? await authRes.text() : undefined);
	};
}
