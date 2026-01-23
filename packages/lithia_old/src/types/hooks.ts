import type { LithiaRequest, LithiaResponse } from "./handler";
import type { MiddlewareInfo } from "./middleware";

type HookResult = void | Promise<void>;

/**
 * Simplified hooks system for Lithia framework.
 * Focuses on request and middleware lifecycle events.
 */
export type LithiaHooks = {
	// Request lifecycle hooks
	"request:before": (req: LithiaRequest, res: LithiaResponse) => HookResult;
	"request:after": (req: LithiaRequest, res: LithiaResponse) => HookResult;
	"request:error": (
		req: LithiaRequest,
		res: LithiaResponse,
		error: Error,
	) => HookResult;

	// Middleware lifecycle hooks
	"middleware:beforeExecute": (
		middleware: MiddlewareInfo,
		req: LithiaRequest,
		res: LithiaResponse,
	) => HookResult;
	"middleware:afterExecute": (
		middleware: MiddlewareInfo,
		req: LithiaRequest,
		res: LithiaResponse,
	) => HookResult;
	"middleware:error": (
		middleware: MiddlewareInfo,
		req: LithiaRequest,
		res: LithiaResponse,
		error: Error,
	) => HookResult;
};
