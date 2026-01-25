import type { LithiaRequest, LithiaResponse } from "@lithiajs/core";

export default async function handler(req: LithiaRequest, res: LithiaResponse) {
	// Echo back the query parameters to verify array parsing
	// Example: /query?tags=a&tags=b&id=1
	res.json({
		rawUrl: req.url(),
		parsedQuery: req.query,
	});
}
