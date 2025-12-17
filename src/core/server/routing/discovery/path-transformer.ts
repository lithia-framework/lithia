import { withBase, withLeadingSlash, withoutTrailingSlash } from 'ufo';

/**
 * Interface for path transformation implementations.
 *
 * Implementations of this interface are responsible for converting file system
 * paths into URL-friendly route paths and generating regex patterns for
 * route matching.
 *
 * @interface
 */
export interface PathTransformer {
  /**
   * Transforms a file system path into a route path.
   *
   * @param path - The file system path to transform
   * @returns The transformed route path
   */
  transformFilePath(path: string): string;

  /**
   * Normalizes a path with the global prefix.
   *
   * @param path - The path to normalize
   * @param globalPrefix - The global prefix to apply
   * @returns The normalized path with prefix
   */
  normalizePath(path: string, globalPrefix: string): string;

  /**
   * Removes index suffix from a path.
   *
   * @param path - The path to process
   * @returns The path without index suffix
   */
  removeIndexSuffix(path: string): string;

  /**
   * Checks if a path contains dynamic segments.
   *
   * @param path - The path to check
   * @returns True if the path contains dynamic segments
   */
  isDynamicRoute(path: string): boolean;

  /**
   * Generates a regex pattern for route matching.
   *
   * @param path - The route path to convert to regex
   * @returns The regex pattern as a string
   */
  generateRouteRegex(path: string): string;
}

/**
 * Default implementation of PathTransformer that handles file-based routing conventions.
 *
 * This transformer converts file system paths into URL routes following the
 * framework's conventions, including support for dynamic segments, catch-all
 * routes, and optional route groups.
 *
 * @class
 * @implements {PathTransformer}
 */
export class DefaultPathTransformer implements PathTransformer {
  /**
   * Transforms a file system path into a route path.
   *
   * Applies the following transformations:
   * - Removes file extensions
   * - Removes optional route groups (parentheses)
   * - Converts dynamic segments ([param] -> :param)
   * - Converts catch-all segments ([...param] -> **:param)
   * - Normalizes path separators
   *
   * @param path - The file system path to transform
   * @returns The transformed route path
   */
  transformFilePath(path: string): string {
    return path
      .replace(/\.[A-Za-z]+$/, '')
      .replace(/\(([^(/\\]+)\)[/\\]/g, '')
      .replace(/\[\.{3}]/g, '**')
      .replace(/\[\.{3}(\w+)]/g, '**:$1')
      .replace(/\[([^/\]]+)]/g, ':$1')
      .replace(/\\/g, '/');
  }

  /**
   * Normalizes a path with the global prefix.
   *
   * Applies the global prefix, ensures leading slash, and removes trailing slash.
   *
   * @param path - The path to normalize
   * @param globalPrefix - The global prefix to apply
   * @returns The normalized path with prefix
   */
  normalizePath(path: string, globalPrefix: string): string {
    return withLeadingSlash(withoutTrailingSlash(withBase(path, globalPrefix)));
  }

  /**
   * Removes index suffix from a path.
   *
   * Converts paths ending with '/index' to just '/', or returns the original
   * path if it doesn't end with '/index'.
   *
   * @param path - The path to process
   * @returns The path without index suffix, defaults to '/' if empty
   */
  removeIndexSuffix(path: string): string {
    return path.replace(/\/index$/, '') || '/';
  }

  /**
   * Checks if a path contains dynamic segments.
   *
   * @param path - The path to check
   * @returns True if the path contains ':' (indicating dynamic segments)
   */
  isDynamicRoute(path: string): boolean {
    return path.includes(':');
  }

  /**
   * Generates a regex pattern for route matching.
   *
   * Converts route paths with dynamic segments into regex patterns that can
   * be used to match incoming requests and extract parameter values.
   *
   * @param path - The route path to convert to regex
   * @returns The regex pattern as a string
   */
  generateRouteRegex(path: string): string {
    const namedRegex = path.replace(/:(\w+)/g, (_, key) => `:${key}`);
    return new RegExp(
      `^${namedRegex.replace(/\//g, '\\/').replace(/:\w+/g, '([^\\/]+)')}$`,
    ).source;
  }
}
