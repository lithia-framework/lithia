import type { MatchedMethodSuffix } from 'lithia/types';

/**
 * Interface for route convention implementations.
 *
 * Implementations of this interface define how file names and paths are
 * interpreted to extract HTTP methods and transform
 * file system paths into route paths.
 *
 * @interface
 */
export interface RouteConvention {
  /**
   * Extracts HTTP method from a filename.
   *
   * @param filename - The filename to analyze
   * @returns The HTTP method found in the filename, or undefined if none
   */
  getMethodFromFilename(filename: string): MatchedMethodSuffix | undefined;

  /**
   * Transforms a file path into a route path.
   *
   * @param path - The file path to transform
   * @returns The transformed route path
   */
  transformPath(path: string): string;

  /**
   * Extracts method information from a path.
   *
   * @param path - The path to analyze
   * @returns Object containing method and cleaned path
   */
  extractMethod(path: string): {
    method: MatchedMethodSuffix | undefined;
    updatedPath: string;
  };
}

/**
 * Standardized route convention that uses fixed `route.ts` naming.
 *
 * This convention enforces:
 * - All routes must be named `route.ts` (e.g., `/hello/route.ts`, `/users/[id]/route.ts`)
 * - HTTP method suffixes (e.g., `route.get.ts`, `route.post.ts`)
 * - Environment suffixes (e.g., `route.dev.ts`, `route.prod.ts`)
 * - Dynamic segments with brackets (e.g., `[id]/route.ts`)
 * - Catch-all routes (e.g., `[...slug]/route.ts`)
 * - Optional route groups (e.g., `(auth)/profile/route.ts`)
 *
 * Benefits:
 * - Eliminates file naming conflicts
 * - Clear and predictable structure
 * - Prevents ambiguity between `hello.ts` and `hello/index.ts`
 *
 * @class
 * @implements {RouteConvention}
 */
export class DefaultRouteConvention implements RouteConvention {
  private readonly suffixRegex =
    /(\.(?<method>connect|delete|get|head|options|patch|post|put|trace))?$/;

  /**
   * Extracts HTTP method from a filename using suffix patterns.
   *
   * Supports standard HTTP methods as filename suffixes:
   * - `.get.ts`, `.post.ts`, `.put.ts`, etc.
   *
   * @param filename - The filename to analyze
   * @returns The HTTP method in uppercase, or undefined if not found
   */
  getMethodFromFilename(filename: string): MatchedMethodSuffix | undefined {
    const match = filename.match(this.suffixRegex);
    return match?.groups?.method?.toUpperCase() as
      | MatchedMethodSuffix
      | undefined;
  }

  /**
   * Extracts environment suffix from a filename.
   *
   * Supports environment-specific files:
   * - `.dev.ts` for development-only routes
   * - `.prod.ts` for production-only routes
   *
   * @param filename - The filename to analyze
   * @returns The environment suffix, or undefined if not found
   */

  /**
   * Transforms a file path into a route path following conventions.
   *
   * Applies the following transformations:
   * - Removes file extensions
   * - Removes optional route groups (parentheses)
   * - Converts dynamic segments ([param] -> :param)
   * - Converts catch-all segments ([...param] -> **:param)
   * - Normalizes path separators
   *
   * @param path - The file path to transform
   * @returns The transformed route path
   */
  transformPath(path: string): string {
    return path
      .replace(/\.[A-Za-z]+$/, '')
      .replace(/\(([^(/\\]+)\)[/\\]/g, '')
      .replace(/\[\.{3}]/g, '**')
      .replace(/\[\.{3}(\w+)]/g, '**:$1')
      .replace(/\[([^/\]]+)]/g, ':$1')
      .replace(/\\/g, '/');
  }

  /**
   * Extracts method information from a path.
   *
   * Analyzes the path for HTTP method suffixes, removes them from the path,
   * and returns the extracted information along with the cleaned path.
   *
   * @param path - The path to analyze
   * @returns Object containing:
   *   - method: The HTTP method found in the path
   *   - updatedPath: The path with suffixes removed
   */
  extractMethod(path: string): {
    method: MatchedMethodSuffix | undefined;
    updatedPath: string;
  } {
    const suffixMatch = path.match(this.suffixRegex);
    let method: MatchedMethodSuffix | undefined;

    if (suffixMatch?.index && suffixMatch?.index >= 0) {
      path = path.slice(0, suffixMatch.index);
      method = suffixMatch.groups?.method?.toUpperCase() as
        | MatchedMethodSuffix
        | undefined;
    }

    return { method, updatedPath: path };
  }
}

/**
 * Standardized route convention that uses fixed `route.ts` naming.
 *
 * This convention enforces:
 * - All routes must be named `route.ts` (e.g., `/hello/route.ts`, `/users/[id]/route.ts`)
 * - HTTP method suffixes (e.g., `route.get.ts`, `route.post.ts`)
 * - Environment suffixes (e.g., `route.dev.ts`, `route.prod.ts`)
 * - Dynamic segments with brackets (e.g., `[id]/route.ts`)
 * - Catch-all routes (e.g., `[...slug]/route.ts`)
 * - Optional route groups (e.g., `(auth)/profile/route.ts`)
 *
 * Benefits:
 * - Eliminates file naming conflicts
 * - Clear and predictable structure
 * - Prevents ambiguity between `hello.ts` and `hello/index.ts`
 *
 * @class
 * @implements {RouteConvention}
 */
export class StandardizedRouteConvention implements RouteConvention {
  private readonly suffixRegex =
    /(\.(?<method>connect|delete|get|head|options|patch|post|put|trace))?$/;

  /**
   * Extracts HTTP method from a filename using suffix patterns.
   *
   * Supports standard HTTP methods as filename suffixes:
   * - `.get.ts`, `.post.ts`, `.put.ts`, etc.
   *
   * @param filename - The filename to analyze
   * @returns The HTTP method in uppercase, or undefined if not found
   */
  getMethodFromFilename(filename: string): MatchedMethodSuffix | undefined {
    const match = filename.match(this.suffixRegex);
    return match?.groups?.method?.toUpperCase() as
      | MatchedMethodSuffix
      | undefined;
  }

  /**
   * Extracts environment suffix from a filename.
   *
   * Supports environment-specific files:
   * - `.dev.ts` for development-only routes
   * - `.prod.ts` for production-only routes
   *
   * @param filename - The filename to analyze
   * @returns The environment suffix, or undefined if not found
   */

  /**
   * Transforms a file path into a route path following standardized conventions.
   *
   * Applies the following transformations:
   * - Removes `route.ts` filename (standardized naming)
   * - Removes file extensions
   * - Removes optional route groups (parentheses)
   * - Converts dynamic segments ([param] -> :param)
   * - Converts catch-all segments ([...param] -> **:param)
   * - Normalizes path separators
   * - Ensures path starts with /
   *
   * @param path - The file path to transform
   * @returns The transformed route path
   */
  transformPath(path: string): string {
    return path
      .replace(/\/route\.ts$/, '') // Remove standardized route.ts filename
      .replace(/\.[A-Za-z]+$/, '') // Remove any remaining extensions
      .replace(/\(([^(/\\]+)\)[/\\]/g, '') // Remove optional route groups
      .replace(/\[\.{3}]/g, '**') // Convert catch-all [...]
      .replace(/\[\.{3}(\w+)]/g, '**:$1') // Convert catch-all [...param]
      .replace(/\[([^/\]]+)]/g, ':$1') // Convert dynamic [param]
      .replace(/\\/g, '/') // Normalize separators
      .replace(/^\/?/, '/'); // Ensure path starts with /
  }

  /**
   * Extracts method information from a path.
   *
   * Analyzes the path for HTTP method suffixes in the standardized
   * `route.method.ts` format, removes them from the path, and returns the
   * extracted information along with the cleaned path.
   *
   * @param path - The path to analyze
   * @returns Object containing:
   *   - method: The HTTP method found in the path
   *   - updatedPath: The path with suffixes removed
   */
  extractMethod(path: string): {
    method: MatchedMethodSuffix | undefined;
    updatedPath: string;
  } {
    // Extract method from route.ts filename
    const routeMatch = path.match(
      /\/route(\.(?<method>connect|delete|get|head|options|patch|post|put|trace))?\.ts$/,
    );

    if (routeMatch) {
      const method = routeMatch.groups?.method?.toUpperCase() as
        | MatchedMethodSuffix
        | undefined;
      const updatedPath = path.replace(/\/route(\.\w+)?\.ts$/, '');

      return { method, updatedPath };
    }

    // Fallback to original logic for non-standardized files
    const suffixMatch = path.match(this.suffixRegex);
    let method: MatchedMethodSuffix | undefined;

    if (suffixMatch?.index && suffixMatch?.index >= 0) {
      path = path.slice(0, suffixMatch.index);
      method = suffixMatch.groups?.method?.toUpperCase() as
        | MatchedMethodSuffix
        | undefined;
    }

    return { method, updatedPath: path };
  }
}
