export class MiddlewareRegistry<TRouteMiddleware, TEventMiddleware> {
	private readonly routeMiddlewares: TRouteMiddleware[] = [];
	private readonly eventMiddlewares: TEventMiddleware[] = [];

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

	public getRoutes(): TRouteMiddleware[] {
		return this.routeMiddlewares;
	}

	public getEvents(): TEventMiddleware[] {
		return this.eventMiddlewares;
	}
}
