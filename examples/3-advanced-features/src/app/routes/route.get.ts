import type { LithiaRequest, LithiaResponse } from "@lithiajs/core";

export default async function (req: LithiaRequest, res: LithiaResponse) {
	// Access injected user from middleware
	const user = (req as any).user;

	res.json({
		message: "Hello from Advanced Features!",
		injected_middleware_data: user,
	});
}
