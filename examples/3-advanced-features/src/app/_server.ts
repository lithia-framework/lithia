import { Lithia } from "@lithiajs/core";
import { green } from "@lithiajs/utils";

export default async function server(app: Lithia) {
	console.log(green("🚀 Custom Bootstrap (_server.ts) loaded successfully!"));

	// Test global middleware
	app.use(async (req, res, next) => {
		console.log(`[Global Middleware] ${req.method} ${req.pathname}`);
		
		// Add custom header to verify it works
		res.addHeader("X-Custom-Global", "Works!");

		// Inject data into request (simulating authentication)
		(req as any).user = { 
			id: 1, 
			username: "admin", 
			role: "superuser" 
		};
		
		next();
	});
}
