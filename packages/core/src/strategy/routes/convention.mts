/**
 * @fileoverview Route Convention Logic (TypeScript).
 * Focuses on identifying Lithia file patterns and extracting HTTP methods.
 */

export type MatchedMethodSuffix =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT";

export interface ExtractedMethod {
  /** The extracted HTTP verb or null if no method suffix was found. */
  method: MatchedMethodSuffix | null;
  /** The path string after removing the route filename and extension, keeping brackets intact. */
  updatedPath: string;
}

/**
 * Implementation of the Lithia routing convention.
 */
export class RouteConvention {
  /** * Regex to identify 'route' files and extract optional methods.
   * Optimized to match exactly the filename part.
   */
  private readonly routeRegex =
    /[\\/]route(\.(delete|get|head|options|patch|post|put))?\.(mts|mjs|ts|js)$/i;

  /**
   * Identifies the HTTP method embedded in the filename.
   * Does NOT transform brackets, as that is the Transformer's responsibility.
   * * @example
   * "api/auth/[...all]/route.ts" -> { method: null, updatedPath: "api/auth/[...all]" }
   * "users/[id]/route.post.ts" -> { method: "POST", updatedPath: "users/[id]" }
   */
  public extractMethod(filePath: string): ExtractedMethod {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const match = normalizedPath.match(this.routeRegex);

    const methodStr = match?.[2]?.toUpperCase() as
      | MatchedMethodSuffix
      | undefined;

    // Remove apenas a parte do arquivo (ex: /route.get.ts)
    // Mantendo os colchetes para o Transformer processar depois.
    const rawPath = normalizedPath.replace(this.routeRegex, "");

    return {
      method: methodStr || null,
      updatedPath: rawPath,
    };
  }
}