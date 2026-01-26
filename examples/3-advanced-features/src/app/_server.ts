import { Lithia } from "@lithiajs/core";
import { green } from "@lithiajs/utils";

export default async function server(app: Lithia) {
	// Test global middleware
	app.use(async (req, res, next) => {
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
