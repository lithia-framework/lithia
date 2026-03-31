import { defineConfig } from "@lithia-js/core";

export default defineConfig({
	asyncTasks: {
		timeoutMs: 5000,
		concurrencyLimit: 1,
	},
});
