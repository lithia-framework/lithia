/**
 * @fileoverview Event Convention Logic (TypeScript).
 * Defines the rules for identifying and extracting raw event paths from the file system.
 */

/**
 * Handles the logic for isolating the event path relative to the framework's 
 * standard event directory.
 */
export class EventConvention {
  /**
   * Extracts the relative path by stripping the framework's event root prefix.
   * * @example
   * "app/events/chat/message.ts" -> "chat/message.ts"
   * "events/connection.ts" -> "connection.ts"
   * * @param filePath - The full or relative file path to analyze.
   * @returns The event path relative to the events directory.
   */
  public extractEventPath(filePath: string): string {
    // 1. Normalize separators for cross-platform consistency
    const p = filePath.replace(/\\/g, "/");

    // 2. Strip the standard framework directory prefix (app/events or events)
    return p.replace(/^(app\/)?events\//, "");
  }
}