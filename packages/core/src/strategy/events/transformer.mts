/**
 * @fileoverview Event Path Transformer (TypeScript).
 * Handles string manipulation for event names, including extension stripping,
 * route group removal, and path prefixing.
 */

/**
 * Utility to combine base and path segments while avoiding double slashes.
 * * @param path - The target path segment.
 * @param base - The base prefix to prepend.
 * @returns The combined and sanitized path string.
 */
const withBase = (path: string, base: string): string => {
  if (!base || base === "/") return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
};

/**
 * Provides specialized string transformation logic for event identifiers.
 */
export class EventPathTransformer {
  /** Regex to identify and strip TypeScript/JavaScript extensions. */
  private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
  
  /** Regex to identify and remove organizational groups like (auth)/ or (api)/. */
  private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

  /**
   * Normalizes a file path into a clean event identifier.
   * Removes extensions, strips organizational groups, and unifies separators.
   * * @example
   * "(api)/v1/user.ts" -> "v1/user"
   * * @param pathStr - The raw file path to normalize.
   * @returns A sanitized event identifier string.
   */
  public normalize(pathStr: string): string {
    const s = pathStr
      .replace(/\\/g, "/")
      .replace(this.removeExt, "")
      .replace(this.removeGroups, "");

    return s.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  }

  /**
   * Finalizes a path by applying a global prefix and ensuring consistent slashes.
   * * @param pathStr - The cleaned path segment.
   * @param globalPrefix - An optional prefix to apply to the path.
   * @returns A normalized path starting with a single forward slash.
   */
  public normalizePath(pathStr: string, globalPrefix: string = ""): string {
    const combined = withBase(pathStr, globalPrefix);

    const noTrailing =
      combined.endsWith("/") && combined.length > 1
        ? combined.slice(0, -1)
        : combined;

    return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
  }
}