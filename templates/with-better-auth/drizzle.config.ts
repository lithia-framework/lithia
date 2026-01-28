import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './dist/lib/schema/index.mjs',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  }
})