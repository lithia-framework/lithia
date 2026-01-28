import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import db from "./db.mjs";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET as string,
  baseUrl: process.env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true },
});

export default auth;
