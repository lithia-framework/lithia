import type { Server } from "node:http";
import path from "node:path";
import serveStatic from "serve-static";

/**
 * Manages static file serving for the Lithia Studio UI.
 *
 * This class handles serving the built Studio files and provides
 * fallback routing for Single Page Application (SPA) behavior.
 */
export class StaticServer {
	private httpServer: Server;
	private serve: ReturnType<typeof serveStatic>;

	constructor(httpServer: Server) {
		this.httpServer = httpServer;
		this.setupStaticFileServing();
	}

	/**
	 * Setup static file serving for the Studio UI.
	 */
	setupStaticFileServing(): void {
		// Serve the built Studio files from dist/studio/app/
		const studioPath = path.join(__dirname, "app");
		this.serve = serveStatic(studioPath, { index: ["index.html"] });

		this.httpServer.on("request", (req, res) => {
			this.serve(req, res, () => {
				// Fallback for SPA routing (e.g., /routes should serve index.html)
				if (!req.url?.startsWith("/_next") && !req.url?.includes(".")) {
					req.url = "/index.html";
					this.serve(req, res, () => {
						res.statusCode = 404;
						res.end("Not Found");
					});
				}
			});
		});
	}

	/**
	 * Get the serve-static middleware instance.
	 */
	getServeMiddleware(): ReturnType<typeof serveStatic> {
		return this.serve;
	}
}
