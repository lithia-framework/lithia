/**
 * @fileoverview Function Convention Logic (TypeScript).
 * Defines the rules for identifying Lithia functions and extracting their 
 * execution triggers (e.g., Cron vs On-Demand) based on file naming.
 */

/**
 * Supported execution triggers for Lithia functions.
 */
export type FunctionTrigger = "CRON" | "TASK";

/**
 * Metadata extracted from a function's filename.
 */
export interface ExtractedFunction {
  /** The type of trigger identified (CRON or TASK). */
  trigger: FunctionTrigger;
  /** The raw name/path of the function before final normalization. */
  rawName: string;
}

/**
 * Implementation of the Lithia function naming convention.
 * Recognizes patterns like "cleanup.cron.ts" or "process-image.ts".
 */
export class FunctionConvention {
  /** * Regex to identify function files and extract their trigger type.
   * Group 1: The function name/path.
   * Group 2: The optional '.cron' suffix.
   * Group 3: The file extension.
   */
  private readonly functionRegex = 
    /^(.*?)(?:\.(cron))?\.(mts|mjs|ts|js)$/i;

  /**
   * Analyzes a file path to determine if it's a specialized function.
   * @example
   * "app/functions/backup.cron.ts" -> { trigger: "CRON", rawName: "backup" }
   * "app/functions/media/resize.ts" -> { trigger: "TASK", rawName: "media/resize" }
   * @param filePath - The raw file path from the scanner.
   * @returns The extracted trigger and name metadata.
   */
  public extractFunction(filePath: string): ExtractedFunction {
    // 1. Normalize separators and strip the framework's function root prefix
    const cleanPath = filePath
      .replace(/\\/g, "/")
      .replace(/^(app\/)?functions\//, "");

    // 2. Match against the clean path to avoid prefix issues
    const match = cleanPath.match(this.functionRegex);
    
    const isCron = match?.[2]?.toLowerCase() === "cron";
    const rawName = match?.[1] || cleanPath;

    return {
      trigger: isCron ? "CRON" : "TASK",
      rawName,
    };
  }
}