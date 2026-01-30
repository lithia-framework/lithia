import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta.mjs";
import { RouteProcessor } from "./processor.mjs";

export interface Route {
	method?: string;
	path: string;
	dynamic: boolean;
	filePath: string;
	regex: string;
}

export interface RoutesManifest {
	version: string;
	routes: Route[];
}

export class RouteManifestGenerator {
	private processor: RouteProcessor;

	constructor() {
		this.processor = new RouteProcessor();
	}

	public async generateManifest(
		outRoot: string,
		scannedFiles: { path: string; fullPath: string }[],
	): Promise<RoutesManifest> {
		const routeFiles = scannedFiles.filter((file) => {
			const p = file.path.split(path.sep).join("/");
			return p.includes("routes/") || p.includes("app/routes/");
		});

		const routes = routeFiles.map((file) =>
			this.processor.processRouteFile(file),
		);

		const manifest: RoutesManifest = {
			version,
			routes,
		};

		const manifestPath = path.join(outRoot, "routes.json");

		try {
			await fs.mkdir(outRoot, { recursive: true });
			await fs.writeFile(
				manifestPath,
				JSON.stringify(manifest, null, 2),
				"utf-8",
			);
		} catch (error) {
			throw new Error(`Failed to write routes manifest: ${error}`);
		}

		return manifest;
	}
}
