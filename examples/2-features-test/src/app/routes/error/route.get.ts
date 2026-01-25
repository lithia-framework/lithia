import type { LithiaRequest, LithiaResponse } from "@lithiajs/core";

export default async function (req: LithiaRequest, res: LithiaResponse) {
	// Simulate some work
	await new Promise((resolve) => setTimeout(resolve, 50));
	
	throw new Error("This is a simulated 500 internal server error for testing logs");
}
