<div align="center">
  <a href="https://github.com/lithia-framework/lithia">
    <img alt="Lithia logo" src="https://raw.githubusercontent.com/lithia-framework/lithia/canary/.github/assets/logo.svg" height="128">
  </a>
  <h1>@lithia-js/better-auth</h1>
  <p><strong>Official Better Auth integration for Lithia.</strong></p>

  <p>Bridge Better Auth routes into Lithia and access the current session inside protected routes.</p>

<a href="https://www.npmjs.com/package/@lithia-js/better-auth"><img alt="NPM version" src="https://img.shields.io/npm/v/@lithia-js/better-auth.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/lithia-framework/lithia/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@lithia-js/better-auth.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://opencollective.com/lithiajs"><img alt="Support Lithia" src="https://img.shields.io/badge/Support%20Lithia-blueviolet.svg?style=for-the-badge&logo=OpenCollective&labelColor=000000&logoWidth=20"></a>

</div>

## What it provides

- `BetterAuth(auth)` to expose Better Auth routes through Lithia
- `authenticated(auth)` middleware to resolve and require a session
- `useSession()` to access the current Better Auth session inside a protected
  route

## Basic usage

Create a catch-all auth route:

```ts
import { BetterAuth } from "@lithia-js/better-auth";
import { auth } from "../../../lib/auth";

export default BetterAuth(auth);
```

Protect a route:

```ts
import type { RouteHandler } from "@lithia-js/core";
import { authenticated, useSession } from "@lithia-js/better-auth";
import { auth } from "../../lib/auth";

export const middlewares = [authenticated(auth)];

const handler: RouteHandler = async (_req, res) => {
	const session = useSession();
	res.json({ user: session?.user ?? null });
};

export default handler;
```
