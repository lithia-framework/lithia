<div align="center">
  <a href="https://github.com/lithia-framework/lithia">
    <img alt="Lithia logo" src="https://raw.githubusercontent.com/lithia-framework/lithia/canary/.github/assets/logo.svg" height="128">
  </a>
  <h1>@lithia-js/middlewares</h1>
  <p><strong>Reusable middlewares for Lithia apps.</strong></p>

  <p>Shared middleware utilities such as request validation for the Lithia runtime.</p>

<a href="https://www.npmjs.com/package/@lithia-js/middlewares"><img alt="NPM version" src="https://img.shields.io/npm/v/@lithia-js/middlewares.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/lithia-framework/lithia/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@lithia-js/middlewares.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://opencollective.com/lithiajs"><img alt="Support Lithia" src="https://img.shields.io/badge/Support%20Lithia-blueviolet.svg?style=for-the-badge&logo=OpenCollective&labelColor=000000&logoWidth=20"></a>

</div>

## Overview

`@lithia-js/middlewares` contains reusable middleware helpers for Lithia apps.

Today it includes:

- `validate()` for request validation with Zod

## Example

```ts
import { validate } from "@lithia-js/middlewares";
import { z } from "zod";

const query = z.object({
	name: z.string().optional(),
});

export const middlewares = [validate({ query })];
```
