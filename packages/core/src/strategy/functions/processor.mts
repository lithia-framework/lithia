/**
 * @fileoverview Function Processor (TypeScript).
 * Analyzes file paths to determine function triggers, identifiers, and metadata.
 * Converts physical FileInfo into logical Function metadata for the manifest.
 */

import type { FileInfo } from "../../scanner.mjs";
import { FunctionConvention, type FunctionTrigger } from "./convention.mjs";
import { FunctionPathTransformer } from "./transformer.mjs";

/**
 * Represents the processed metadata of a Lithia function.
 */
export interface FunctionCore {
	/** The unique colon-separated identifier (e.g., "billing:cleanup"). */
	id: string;
	/** The type of execution trigger (CRON or TASK). */
	trigger: FunctionTrigger;
	/** The absolute path to the handler file. */
	filePath: string;
	/** An optional cron expression (to be populated by decorators or config later). */
	schedule?: string;
}

/**
 * Orchestrates the transformation of function file entries into
 * executable function definitions.
 */
export class FunctionProcessor {
	/** Utility for identifying Lithia function patterns. */
	private convention: FunctionConvention;
	/** Utility for generating clean function identifiers. */
	private transformer: FunctionPathTransformer;

	constructor(
		convention?: FunctionConvention,
		transformer?: FunctionPathTransformer,
	) {
		this.convention = convention ?? new FunctionConvention();
		this.transformer = transformer ?? new FunctionPathTransformer();
	}

	/**
	 * Batch processes a collection of files into an array of FunctionCore objects.
	 * @param files - Array of FileInfo objects to process.
	 * @returns Array of processed functions.
	 */
	public process(files: FileInfo[]): FunctionCore[] {
		return files.map((f) => this.processFunctionFile(f));
	}

	/**
	 * Processes a single file entry into a Function domain model.
	 * * @example
	 * "functions/notifications/send.ts" -> { id: "notifications:send", trigger: "TASK" }
	 * "functions/cleanup.cron.ts" -> { id: "cleanup", trigger: "CRON" }
	 * * @param file - The FileInfo object to analyze.
	 * @returns The fully processed FunctionCore metadata.
	 */
	public processFunctionFile(file: FileInfo): FunctionCore {
		// 1. Extract trigger type and the raw name part
		const extracted = this.convention.extractFunction(file.path);

		// 2. Transform the raw name into a clean colon-separated ID
		const id = this.transformer.normalizeIdentifier(extracted.rawName);

		return {
			id,
			trigger: extracted.trigger,
			filePath: file.fullPath,
			// Defaulting schedule to undefined for now;
			// Lithia can later resolve this by inspecting the file exports.
			schedule: undefined,
		};
	}
}
