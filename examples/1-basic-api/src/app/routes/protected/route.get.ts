import type { LithiaMiddleware, LithiaRequest, LithiaResponse } from "@lithiajs/core";

// Middleware de autenticação simulado
const authMiddleware: LithiaMiddleware = async (req, res, next) => {
	const token = req.headers.authorization;

	if (!token || token !== "Bearer secret-token") {
		res.status(401).json({
			error: {
				message: "Unauthorized - Invalid or missing token",
				statusCode: 401,
			},
		});
		return;
	}

	// Token válido, continua para próximo middleware ou handler
	next();
};

// Middleware de logging
const logMiddleware: LithiaMiddleware = async (req, res, next) => {
	console.log(`[Protected Route] ${req.method} ${req.pathname}`);
	next();
};

export const middlewares = [authMiddleware, logMiddleware];

export default async (req: LithiaRequest, res: LithiaResponse) => {
	res.json({
		message: "Protected content accessed successfully!",
		user: "authenticated-user",
		timestamp: new Date().toISOString(),
	});
}
