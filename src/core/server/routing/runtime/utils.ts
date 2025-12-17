import type { Route } from 'lithia/types';

/**
 * Utility functions for route operations.
 *
 * Provides helper functions for common route-related operations
 * and transformations.
 */
export class RouteUtils {
  /**
   * Finds a route that matches the given pathname and method.
   * @param {Route[]} routes - Array of available routes
   * @param {string} pathname - Request pathname
   * @param {string} method - HTTP method
   * @returns {Route | undefined} Matching route or undefined
   *
   * @example
   * ```typescript
   * const utils = new RouteUtils();
   * const route = utils.findMatchingRoute(routes, '/users/123', 'GET');
   * ```
   */
  static findMatchingRoute(
    routes: Route[],
    pathname: string,
    method: string,
  ): Route | undefined {
    return routes.find((route) => {
      const methodMatches =
        !route.method || route.method.toLowerCase() === method.toLowerCase();
      const pathMatches = RouteUtils.matchesPath(pathname, route);
      return methodMatches && pathMatches;
    });
  }

  /**
   * Checks if a pathname matches a route pattern.
   * @param {string} pathname - Request pathname
   * @param {Route} route - Route configuration
   * @returns {boolean} True if pathname matches route
   */
  static matchesPath(pathname: string, route: Route): boolean {
    try {
      const regex = new RegExp(route.regex);
      return regex.test(pathname);
    } catch {
      return false;
    }
  }

  /**
   * Groups routes by their HTTP method.
   * @param {Route[]} routes - Array of routes
   * @returns {Map<string, Route[]>} Routes grouped by method
   */
  static groupRoutesByMethod(routes: Route[]): Map<string, Route[]> {
    const grouped = new Map<string, Route[]>();

    routes.forEach((route) => {
      const method = route.method || 'GET';
      const methodRoutes = grouped.get(method) || [];
      methodRoutes.push(route);
      grouped.set(method, methodRoutes);
    });

    return grouped;
  }

  /**
   * Filters routes by a specific HTTP method.
   * @param {Route[]} routes - Array of routes
   * @param {string} method - HTTP method to filter by
   * @returns {Route[]} Filtered routes
   */
  static filterRoutesByMethod(routes: Route[], method: string): Route[] {
    return routes.filter((route) => {
      const routeMethod = route.method || 'GET';
      return routeMethod.toLowerCase() === method.toLowerCase();
    });
  }

  /**
   * Sorts routes by specificity (more specific routes first).
   * @param {Route[]} routes - Array of routes to sort
   * @returns {Route[]} Sorted routes
   */
  static sortRoutesBySpecificity(routes: Route[]): Route[] {
    return [...routes].sort((a, b) => {
      // Static routes come before dynamic routes
      if (a.dynamic && !b.dynamic) return 1;
      if (!a.dynamic && b.dynamic) return -1;

      // More specific routes (fewer parameters) come first
      const aParamCount = (a.path.match(/:([^/]+)/g) || []).length;
      const bParamCount = (b.path.match(/:([^/]+)/g) || []).length;

      if (aParamCount !== bParamCount) {
        return aParamCount - bParamCount;
      }

      // Shorter paths come first
      return a.path.length - b.path.length;
    });
  }

  /**
   * Validates route configuration.
   * @param {Route} route - Route to validate
   * @returns {boolean} True if route is valid
   */
  static validateRoute(route: Route): boolean {
    if (!route.path || typeof route.path !== 'string') {
      return false;
    }

    if (!route.filePath || typeof route.filePath !== 'string') {
      return false;
    }

    if (!route.regex || typeof route.regex !== 'string') {
      return false;
    }

    if (route.method && typeof route.method !== 'string') {
      return false;
    }

    if (typeof route.dynamic !== 'boolean') {
      return false;
    }

    return true;
  }

  /**
   * Gets route statistics.
   * @param {Route[]} routes - Array of routes
   * @returns {object} Route statistics
   */
  static getRouteStats(routes: Route[]): {
    total: number;
    byMethod: Record<string, number>;
    dynamic: number;
    static: number;
  } {
    const stats = {
      total: routes.length,
      byMethod: {} as Record<string, number>,
      dynamic: 0,
      static: 0,
    };

    routes.forEach((route) => {
      const method = route.method || 'GET';
      stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;

      if (route.dynamic) {
        stats.dynamic++;
      } else {
        stats.static++;
      }
    });

    return stats;
  }
}
