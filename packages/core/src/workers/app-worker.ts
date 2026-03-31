import { parentPort } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { LithiaError } from "../errors/base";
import { LithiaApp } from "../lithia-app";

let isInitialized = false;

async function bootstrap(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  logger.debug("Initializing Lithia background worker...");

  const app = new LithiaApp();

  try {
    await app.start();
    
    parentPort?.postMessage({ type: "ready" });

  } catch (error: any) {
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

    if (!(error instanceof LithiaError)) {
      throw error;
    }
    return;
  }

  const shutdown = async (): Promise<void> => {
    try {
      await app.stop();
    } catch {
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  logger.error("Fatal exception in Lithia worker:", err);
  process.exit(1);
});