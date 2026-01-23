import type { Lithia } from "lithia/types";

// Cache for getOutputPath results to avoid repeated string operations
const outputPathCache = new Map<string, string>();

/**
 * Converts a source file path to its corresponding output path.
 * Uses caching to avoid repeated string operations for better performance.
 *
 * @param _lithia - The Lithia instance (unused but kept for API compatibility)
 * @param filePath - The source file path to convert
 * @returns The corresponding output file path
 */
export function getOutputPath(_lithia: Lithia, filePath: string): string {
	// Check cache first
	const cached = outputPathCache.get(filePath);
	if (cached) {
		return cached;
	}

	// Compute output path
	const outputPath = filePath.replace("src", ".lithia").replace(/\.ts$/, ".js");

	// Cache the result
	outputPathCache.set(filePath, outputPath);

	return outputPath;
}
