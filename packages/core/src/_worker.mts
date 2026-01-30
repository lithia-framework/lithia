/**
 * @fileoverview Internal Dev-Mode Worker Entry Point.
 * This file is executed within a Node.js Worker Thread to isolate the 
 * application instance from the CLI process. This allows for clean 
 * reloads without leaking memory or crashing the main CLI tool.
 * * @internal
 */

import { parentPort } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { LithiaError } from "./errors/base.mjs";
import { LithiaApp } from "./lithia-app.mjs";

/**
 * Flag to prevent multiple bootstrap attempts within the same worker.
 */
let isInitialized = false;

/**
 * Bootstraps the application within the worker thread context.
 * Communicates state changes back to the Lithia CLI via parentPort.
 */
async function bootstrap(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  logger.debug("Initializing Lithia background worker...");

  const app = new LithiaApp();

  try {
    await app.start();
    
    // Notify the main thread that the server is up and healthy
    parentPort?.postMessage({ type: "ready" });

  } catch (error: any) {
    // Standardize error payload for thread-safe cloning
    const errorPayload = error instanceof LithiaError
      ? {
          name: error.name,
          message: error.message,
          context: (error as any).context,
          stack: error.stack,
        }
      : {
          name: error?.name ?? "UnknownWorkerError",
          message: String(error?.message ?? error),
          stack: error?.stack,
        };

    parentPort?.postMessage({ type: "error", error: errorPayload });

    // If it's not a framework-managed error, we rethrow to let the thread terminate
    if (!(error instanceof LithiaError)) {
      throw error;
    }
    return;
  }

  /**
   * Orchestrates a clean exit for the isolated app instance.
   */
  const shutdown = async (): Promise<void> => {
    try {
      await app.stop();
    } catch {
      // Ignore cleanup errors to ensure the process exits
    } finally {
      process.exit(0);
    }
  };

  // Register termination listeners
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

// Execute bootstrap and handle unhandled rejection at the worker root
bootstrap().catch((err) => {
  logger.error("Fatal exception in Lithia worker:", err);
  process.exit(1);
});