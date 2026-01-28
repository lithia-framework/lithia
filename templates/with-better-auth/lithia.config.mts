import { defineConfig } from '@lithia-js/core/config';

export default defineConfig({
  debug: true,
  http: {
    port: 3002
  },
  logging: {
    requests: true
  }
})