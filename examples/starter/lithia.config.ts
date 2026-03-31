import { defineConfig } from "@lithia-js/core";

export default defineConfig({
  managedFunctions: {
    timeoutMs: 5000,
    concurrencyLimit: 1
  },
  openapi: {
    enabled: true,
    title: "Starter API",
    version: "0.1.0",
  }
});
