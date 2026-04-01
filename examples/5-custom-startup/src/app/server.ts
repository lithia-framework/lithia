import type { LithiaServerBootstrap } from "@lithia-js/core";
import { provide } from "@lithia-js/core";

export const STARTUP_MESSAGE_KEY = "startup.message";

const server: LithiaServerBootstrap = async () => {
	provide(STARTUP_MESSAGE_KEY, "Hello from app/server.ts");

	return async () => {};
};

export default server;
