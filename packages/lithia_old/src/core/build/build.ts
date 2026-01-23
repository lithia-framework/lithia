import { readFileSync } from "node:fs";
import CliTable3 from "cli-table3";
import type { Lithia, Route } from "lithia/types";
import { buildLithia } from "./builder";

/**
 * Legacy build function for backward compatibility.
 *
 * This function maintains compatibility with the old build system while
 * internally using the new build manager. It will be deprecated in favor
 * of the new buildLithia function.
 *
 * @deprecated Use buildLithia instead
 * @param lithia - The Lithia instance to build
 * @returns Promise that resolves to boolean indicating success
 */
export async function build(lithia: Lithia): Promise<boolean> {
	try {
		const result = await buildLithia(lithia);
		return result.success;
	} catch (error) {
		lithia.logger.error(
			`Build failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

/**
 * New build function using the modern build system.
 *
 * This function uses the new build manager and strategies to provide
 * a more flexible and extensible build system.
 *
 * @param lithia - The Lithia instance to build
 * @returns Promise that resolves to build result with detailed information
 */
export async function buildModern(lithia: Lithia) {
	return await buildLithia(lithia);
}

/**
 * Prints a formatted overview of built routes.
 *
 * Creates a CLI table showing route information including HTTP method,
 * path, environment, and file size for each built route.
 *
 * @param routes - Array of routes to display
 *
 * @example
 * ```typescript
 * const routes = await scanServerRoutes(lithia);
 * printRoutesOverview(routes);
 * ```
 */
export function printRoutesOverview(routes: Route[]): void {
	if (routes.length === 0) {
		console.log("No routes found.");
		return;
	}

	const table = new CliTable3({
		head: ["Method", "Path", "Environment", "Size"],
		style: {
			head: ["green"],
		},
	});

	routes.forEach((route) => {
		try {
			const fileSize = readFileSync(route.filePath).length;
			table.push([
				route.method || "ALL",
				route.path,
				route.env || "all",
				`${fileSize} bytes`,
			]);
		} catch {
			table.push([
				route.method || "ALL",
				route.path,
				route.env || "all",
				"N/A",
			]);
		}
	});

	console.log(table.toString());
}
