/**
 * @fileoverview Route Path Transformer (TypeScript).
 * Performs the heavy lifting of converting file-system naming conventions
 * into URI-compatible paths and executable Regular Expressions.
 */

/**
 * Combines a base prefix with a path segment safely.
 * @param path - The target path segment.
 * @param base - The base prefix to prepend.
 * @returns The combined path without redundant slashes.
 */
const withBase = (path: string, base: string): string => {
  if (!base || base === "/") return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
};

/**
 * Ensures a path string starts with a single leading forward slash.
 * @param path - The path to sanitize.
 * @returns The path with a leading slash.
 */
const withLeadingSlash = (path: string): string => 
  path.startsWith("/") ? path : `/${path}`;

/**
 * Strips trailing slashes from a path unless it is the root.
 * @param path - The path to sanitize.
 * @returns The path without trailing slashes.
 */
const withoutTrailingSlash = (path: string): string =>
  path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;

/**
 * Specialized utility for transforming file system patterns into web-compatible 
 * routes and matching Regular Expressions.
 */
export class RoutePathTransformer {
  /** Regex to strip supported script extensions. */
  private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
  /** Regex to strip organizational groups, e.g., (auth)/. */
  private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;
  /** Regex for named catch-all parameters: [...slug]. */
  private readonly catchAllNamed = /\[\.\.\.(\w+)\]/g;
  /** Regex for unnamed catch-all parameters: [...]. */
  private readonly catchAll = /\[\.\.\.\]/g;
  /** Regex for standard dynamic parameters: [id]. */
  private readonly dynamic = /\[([^/\]]+)\]/g;
  
  /** * Detector for converted dynamic segments.
   * Matches ':' for standard params or '**' for Lithia catch-alls.
   */
  private readonly dynamicDetector = /:\w+|\*\*/;
  
  /** Pattern to match colon-prefixed parameters for regex conversion. */
  private readonly routeParam = /:(\w+)/g;

  /**
   * Converts a raw file system path into a clean route string.
   * Handles extensions, groups, catch-alls, and standard dynamic segments.
   * @example "admin/(auth)/[...slug].ts" -> "admin/**:slug"
   * @param filePath - The raw file path from the scanner.
   * @returns A cleaned route string using internal Lithia syntax.
   */
  public transformFilePath(filePath: string): string {
    let result = filePath
      .replace(/\\/g, "/")
      .replace(this.removeExt, "")
      .replace(this.removeGroups, "");

    // Convert Catch-all named: [...slug] -> **:slug
    result = result.replace(this.catchAllNamed, "**:$1");
    
    // Convert Catch-all unnamed: [...] -> **
    result = result.replace(this.catchAll, "**");
    
    // Convert Dynamic: [id] -> :id
    result = result.replace(this.dynamic, ":$1");

    return result;
  }

  /**
   * Finalizes the path by applying prefixes and cleaning slashes.
   * @param pathStr - The cleaned route path.
   * @param globalPrefix - An optional prefix to apply.
   * @returns A sanitized URI path.
   */
  public normalizePath(pathStr: string, globalPrefix: string = ""): string {
    const combined = withBase(pathStr, globalPrefix);
    const noTrailing = withoutTrailingSlash(combined);
    return withLeadingSlash(noTrailing);
  }

  /**
   * Checks if the path contains dynamic segments or catch-alls.
   * @param pathStr - The normalized route path.
   * @returns True if the path contains ':' or '**'.
   */
  public isDynamicRoute(pathStr: string): boolean {
    return this.dynamicDetector.test(pathStr);
  }

  /**
   * Generates a Regular Expression string for runtime URL matching.
   * Converts Lithia internal markers (**:slug, :id) into Regex capture groups.
   * @example "/api/auth/**:all" -> "^/api/auth/(.*)$"
   * @param pathStr - The normalized path.
   * @returns A regex string for the router.
   */
  public generateRouteRegex(pathStr: string): string {
    // Escape slashes for safe Regex literal usage
    let escaped = pathStr.replace(/\//g, "\\/");

    // 1. Handle Catch-alls first (greedy match)
    // Named: **:slug -> (.*)
    escaped = escaped.replace(/\*\*:\w+/g, "(.*)");
    // Unnamed: ** -> (.*)
    escaped = escaped.replace(/\*\*/g, "(.*)");

    // 2. Handle standard dynamic segments: :id -> ([^/]+)
    const regexBody = escaped.replace(this.routeParam, "([^\\/]+)");

    return `^${regexBody}$`;
  }
}