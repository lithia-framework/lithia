# `@lithia-js/core` Internal Layout

The `core` package is organized by subsystem:

- `runtime/host`: host lifecycle, manifest loading, app worker supervision, and async task execution.
- `runtime/app`: the app runtime that lives inside the worker and owns middleware/dependency state.
- `runtime/workers`: worker entrypoints published into `dist/workers/*`.
- `transport/http`: request/response primitives and the HTTP pipeline.
- `transport/socket`: Socket.io bootstrap and event pipeline.
- `build`: compilation orchestration and generated type output.
- `discovery`: route, event, and task discovery plus manifest generation.
- `shared`: cross-cutting runtime utilities used by more than one subsystem.

Public user-facing exports stay in `index.ts`. The advanced runtime-facing surface stays in `_index.ts`.
