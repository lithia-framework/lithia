<div align="center">
  <a href="https://github.com/lithia-framework/lithia">
    <img alt="Lithia logo" src="https://raw.githubusercontent.com/lithia-framework/lithia/canary/.github/assets/logo.svg" height="128">
  </a>
  <h1>@lithia-js/cli</h1>
  <p><strong>The `lithia` command-line interface.</strong></p>

  <p>Development server, production build flow, and host orchestration for Lithia apps.</p>

<a href="https://www.npmjs.com/package/@lithia-js/cli"><img alt="NPM version" src="https://img.shields.io/npm/v/@lithia-js/cli.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/lithia-framework/lithia/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@lithia-js/cli.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://opencollective.com/lithiajs"><img alt="Support Lithia" src="https://img.shields.io/badge/Support%20Lithia-blueviolet.svg?style=for-the-badge&logo=OpenCollective&labelColor=000000&logoWidth=20"></a>

</div>

## Commands

### `lithia dev`

Starts the development server, watches source/config/env changes, rebuilds the
app, and swaps the app worker when reloads succeed.

### `lithia build`

Builds the application into the configured `outDir`, generates manifests, and
prints the discovered routes, events, and async tasks.

## Notes

- The CLI is designed around the worker-based Lithia runtime.
- It uses `@lithia-js/core/_` internally for host orchestration.
- Templates are scaffolded by `create-lithia`, while repo-local examples live
  under `examples/`.
