/**
 * Stores app-wide route and event middlewares.
 *
 * The registry keeps both middleware pipelines separate while preserving
 * registration order inside each one.
 */
export class MiddlewareRegistry<TRouteMiddleware, TEventMiddleware> {
	private readonly routeMiddlewares: TRouteMiddleware[] = [];
	private readonly eventMiddlewares: TEventMiddleware[] = [];

	/**
	 * Registers a middleware for either the route or event pipeline.
	 *
	 * Route middleware is appended to the global HTTP pipeline. Event
	 * middleware is appended to the global socket event pipeline.
	 *
	 * @param {"route" | "event"} context - Pipeline that should receive the
	 * middleware.
	 * @param {TRouteMiddleware | TEventMiddleware} middleware - Middleware
	 * instance appended to the selected pipeline.
	 */
	public use(
		context: "route" | "event",
		middleware: TRouteMiddleware | TEventMiddleware,
	): void {
		if (context === "route") {
			this.routeMiddlewares.push(middleware as TRouteMiddleware);
			return;
		}

		this.eventMiddlewares.push(middleware as TEventMiddleware);
	}

	/**
	 * Returns the registered global route middlewares.
	 *
	 * The returned array is the live registry array and preserves registration
	 * order.
	 *
	 * @returns {TRouteMiddleware[]} Registered route middlewares.
	 */
	public getRoutes(): TRouteMiddleware[] {
		return this.routeMiddlewares;
	}

	/**
	 * Returns the registered global event middlewares.
	 *
	 * The returned array is the live registry array and preserves registration
	 * order.
	 *
	 * @returns {TEventMiddleware[]} Registered event middlewares.
	 */
	public getEvents(): TEventMiddleware[] {
		return this.eventMiddlewares;
	}
}
