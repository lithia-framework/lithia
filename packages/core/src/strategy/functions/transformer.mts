/**
 * @fileoverview Function Path Transformer (TypeScript).
 * Refines raw function names into clean, colon-separated identifiers
 * and handles organizational group removal.
 */

/**
 * Specialized utility for transforming file system paths into unique
 * function identifiers.
 */
export class FunctionPathTransformer {
  /** Regex to identify and remove organizational groups like (admin)/. */
  private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

  /**
   * Normalizes a raw function name into a clean identifier.
   * Removes group folders and converts directory slashes into colons.
   * * @example
   * "billing/(worker)/cleanup" -> "billing:cleanup"
   * "notifications/send-email" -> "notifications:send-email"
   * * @param rawName - The raw function name extracted by the convention.
   * @returns A sanitized, colon-separated function identifier.
   */
  public normalizeIdentifier(rawName: string): string {
    // 1. Remove organizational groups (e.g., "(auth)/")
    const withoutGroups = rawName.replace(this.removeGroups, "");

    // 2. Unify separators and convert to colons
    // We trim slashes first to avoid leading/trailing colons
    return withoutGroups
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part.length > 0)
      .join(":");
  }

  /**
   * Formats a function name for display or logging purposes.
   * * @param identifier - The normalized function identifier.
   * @returns A formatted string.
   */
  public formatDisplayName(identifier: string): string {
    return identifier
      .split(":")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}