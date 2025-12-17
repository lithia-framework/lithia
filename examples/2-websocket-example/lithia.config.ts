import type { LithiaConfig } from 'lithia';

export default {
  server: {
    port: 3000,
    host: 'localhost',
  },
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  studio: {
    enabled: true,
  },
} satisfies LithiaConfig;

