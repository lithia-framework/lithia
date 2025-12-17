import type { Params, Route } from 'lithia/types';

/**
 * Handles extraction of dynamic parameters from request paths.
 *
 * Provides functionality to extract route parameters from request URLs
 * based on route definitions with dynamic segments.
 */
export class ParameterExtractor {
  /**
   * Extracts dynamic parameters from request path.
   * @param {string} pathname - Request pathname
   * @param {Route} route - Matched route configuration
   * @returns {Params} Extracted parameters object
   *
   * @example
   * ```typescript
   * const extractor = new ParameterExtractor();
   * const params = extractor.extractParams('/users/123', route);
   * // Returns: { id: '123' }
   * ```
   */
  extractParams(pathname: string, route: Route): Params {
    try {
      const matches = this.getPathMatches(pathname, route);
      const paramNames = this.getParameterNames(route);

      return this.buildParamsObject(paramNames, matches);
    } catch (error) {
      throw new Error(
        `Failed to extract parameters for route ${route.path}: ${error.message}`,
      );
    }
  }

  /**
   * Gets regex matches for the given pathname and route.
   * @private
   * @param {string} pathname - Request pathname
   * @param {Route} route - Route configuration
   * @returns {RegExpMatchArray | null} Regex matches
   */
  private getPathMatches(
    pathname: string,
    route: Route,
  ): RegExpMatchArray | null {
    return pathname.match(new RegExp(route.regex));
  }

  /**
   * Extracts parameter names from route path.
   * @private
   * @param {Route} route - Route configuration
   * @returns {string[]} Array of parameter names
   */
  private getParameterNames(route: Route): string[] {
    const paramMatches = route.path.match(/:([^/]+)/g) || [];
    return paramMatches.map((param) => param.slice(1));
  }

  /**
   * Builds parameters object from parameter names and matches.
   * @private
   * @param {string[]} paramNames - Parameter names
   * @param {RegExpMatchArray | null} matches - Regex matches
   * @returns {Params} Parameters object
   */
  private buildParamsObject(
    paramNames: string[],
    matches: RegExpMatchArray | null,
  ): Params {
    if (!matches) {
      return {};
    }

    return paramNames.reduce((acc, name, index) => {
      const value = matches[index + 1];
      if (value !== undefined) {
        acc[name] = value;
      }
      return acc;
    }, {} as Params);
  }

  /**
   * Validates if a pathname matches a route pattern.
   * @param {string} pathname - Request pathname
   * @param {Route} route - Route configuration
   * @returns {boolean} True if pathname matches route
   */
  matchesRoute(pathname: string, route: Route): boolean {
    try {
      const regex = new RegExp(route.regex);
      return regex.test(pathname);
    } catch {
      return false;
    }
  }

  /**
   * Gets all parameter names from a route path.
   * @param {Route} route - Route configuration
   * @returns {string[]} Array of parameter names
   */
  getRouteParameterNames(route: Route): string[] {
    return this.getParameterNames(route);
  }

  /**
   * Checks if a route has dynamic parameters.
   * @param {Route} route - Route configuration
   * @returns {boolean} True if route has dynamic parameters
   */
  hasDynamicParameters(route: Route): boolean {
    return /:/.test(route.path);
  }
}
