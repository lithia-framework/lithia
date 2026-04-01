<div align="center">
  <a href="https://github.com/lithia-framework/lithia">
    <img alt="Lithia logo" src="https://raw.githubusercontent.com/lithia-framework/lithia/canary/.github/assets/logo.svg" height="128">
  </a>
  <h1>@lithia-js/core</h1>
  <p><strong>The main Lithia runtime package.</strong></p>

  <p>Routes, events, async tasks, startup bootstrap, config, and the public runtime APIs.</p>

<a href="https://www.npmjs.com/package/@lithia-js/core"><img alt="NPM version" src="https://img.shields.io/npm/v/@lithia-js/core.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/lithia-framework/lithia/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@lithia-js/core.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://opencollective.com/lithiajs"><img alt="Support Lithia" src="https://img.shields.io/badge/Support%20Lithia-blueviolet.svg?style=for-the-badge&logo=OpenCollective&labelColor=000000&logoWidth=20"></a>

</div>

## Overview

`@lithia-js/core` provides the main framework primitives:

- `defineConfig()` for `lithia.config.ts`
- file-based HTTP routes and Socket.IO events
- request/response primitives and route/event hooks
- dependency injection with `provide()` and `useDependency()`
- native async tasks with `executeTask()` and `dispatchTask()`
- optional `src/app/server.ts` startup bootstrap
- route metadata types for OpenAPI generation

## Example

```ts
import type { RouteHandler } from "@lithia-js/core";

const hello: RouteHandler = async (_req, res) => {
	res.json({ message: "Hello, world!" });
};

export default hello;
```

## Internal layout

The internal package layout is documented in
[src/README.md](./src/README.md).
