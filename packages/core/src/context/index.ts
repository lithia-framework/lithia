/**
 * Context management for Lithia.
 *
 * This module provides three separate context types using AsyncLocalStorage:
 * - **LithiaContext**: Global application context with DI container
 * - **RouteContext**: HTTP request-specific context
 * - **EventContext**: Socket.IO event-specific context
 *
 * Each context is isolated and provides different information based on
 * the execution environment (HTTP request vs Socket.IO event).
 *
 * @module context
 */

// Socket.IO event context
export {
	type EventContext,
	eventContext,
	getEventContext,
} from "./event-context";
// Lithia global context
export {
	getLithiaContext,
	type LithiaContext,
	lithiaContext,
} from "./lithia-context";
// HTTP route context
export {
	getRouteContext,
	type RouteContext,
	routeContext,
} from "./route-context";
