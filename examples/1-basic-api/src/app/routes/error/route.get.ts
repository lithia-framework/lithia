import type { LithiaRequest, LithiaResponse } from "@lithiajs/core";

export default async (req: LithiaRequest, res: LithiaResponse) => {
	// Simula um erro interno
	throw new Error("Database connection failed!");
};
