<div align="center">
  <a href="https://github.com/lithia-framework/lithia">
    <img alt="Lithia logo" src="https://raw.githubusercontent.com/lithia-framework/lithia/canary/.github/assets/logo.svg" height="128">
  </a>
  <h1>@lithia-js/openapi</h1>
  <p><strong>OpenAPI and Scalar integration for Lithia.</strong></p>

  <p>Generate OpenAPI documents from route metadata and serve Scalar docs in Lithia apps.</p>

<a href="https://www.npmjs.com/package/@lithia-js/openapi"><img alt="NPM version" src="https://img.shields.io/npm/v/@lithia-js/openapi.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/lithia-framework/lithia/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@lithia-js/openapi.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://opencollective.com/lithiajs"><img alt="Support Lithia" src="https://img.shields.io/badge/Support%20Lithia-blueviolet.svg?style=for-the-badge&logo=OpenCollective&labelColor=000000&logoWidth=20"></a>

</div>

## Overview

`@lithia-js/openapi` powers Lithia's optional OpenAPI + Scalar integration.

When enabled through `lithia.config.ts`, Lithia can:

- generate an OpenAPI document from route metadata
- emit a Scalar HTML entrypoint
- serve `/openapi.json` and `/docs` at runtime

## Metadata model

Routes can export:

```ts
export const metadata = {
	openapi: {
		summary: "Get hello",
	}
};
```

The package converts those route-level metadata objects into OpenAPI artifacts.
