/**
 * Stores app-wide route and event middlewares.
 */
export class MiddlewareRegistry<TRouteMiddleware, TEventMiddleware> {
	private readonly routeMiddlewares: TRouteMiddleware[] = [];
	private readonly eventMiddlewares: TEventMiddleware[] = [];

	/**
	 * Registers a middleware for either the route or event pipeline.
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
	 */
	public getRoutes(): TRouteMiddleware[] {
		return this.routeMiddlewares;
	}

	/**
	 * Returns the registered global event middlewares.
	 */
	public getEvents(): TEventMiddleware[] {
		return this.eventMiddlewares;
	}
}
