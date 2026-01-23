import { ErrorUtils } from "./errors";
import type { _LithiaResponse } from "./response";

/**
 * ErrorHandler manages HTTP error handling and response formatting.
 * Provides centralized error processing with consistent response structure.
 */
export class ErrorHandler {
	/**
	 * Handles errors and sends appropriate HTTP response.
	 * Converts any error to HttpError and sends standardized response.
	 *
	 * @param error - Caught error (any type)
	 * @param res - Response object
	 * @param isDev - Whether in development mode
	 */
	handleError(error: unknown, res: _LithiaResponse, isDev: boolean): void {
		if (res._ended) return;

		try {
			// Convert any error to HttpError using ErrorUtils
			const httpError = ErrorUtils.toHttpError(
				error,
				undefined,
				this.generateRequestId(),
			);

			// Create standardized error response
			const errorResponse = ErrorUtils.createErrorResponse(httpError, isDev);

			// Send error response
			res.status(httpError.status).json(errorResponse);
		} catch (handlerError) {
			// Fallback if error handling itself fails
			console.error("Error in error handler:", handlerError);
			this.sendFallbackError(res);
		}
	}

	/**
	 * Handles server startup errors.
	 * Logs error and provides context information.
	 *
	 * @param error - Server startup error
	 * @param port - Server port
	 * @param host - Server host
	 */
	handleServerError(error: unknown, port: number, host: string): void {
		console.error("⨯ Server error:", {
			error,
			config: { port, host },
		});
	}

	/**
	 * Handles development server startup failures.
	 *
	 * @param error - Development server error
	 */
	handleDevServerError(error: unknown): void {
		console.error("⨯ Failed to start development server:", error);
	}

	/**
	 * Sends fallback error response when error handling fails.
	 *
	 * @param res - Response object
	 */
	private sendFallbackError(res: _LithiaResponse): void {
		if (!res._ended) {
			res.status(500).json({
				error: "Internal Server Error",
				message: "An unexpected error occurred",
				timestamp: new Date().toISOString(),
			});
		}
	}

	/**
	 * Generates a unique request ID for tracking.
	 *
	 * @returns Request ID string
	 */
	private generateRequestId(): string {
		return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
}
