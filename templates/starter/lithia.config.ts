import { defineConfig } from "@lithia-js/core";

export default defineConfig({
  managedFunctions: {
    timeoutMs: 5000,
    concurrencyLimit: 1
  }
});
