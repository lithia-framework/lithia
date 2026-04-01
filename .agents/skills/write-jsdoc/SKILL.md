---
name: write-jsdoc
description: Write or refactor detailed JSDoc blocks for Lithia.js APIs, including classes, methods, functions, getters, config options, conventions, and runtime helpers. Use when the user asks to document source code, improve API reference quality, add missing JSDoc, standardize existing comments, or make documentation more organized, explicit, and detailed.
---

# Write JSDoc for Lithia.js APIs

## Goal

Produce JSDoc blocks that are:

- highly organized
- mechanically precise
- detailed enough to explain behavior, lifecycle, side effects, and constraints
- consistent across related APIs

Prefer thoroughness over minimalism when the code contains non-obvious behavior. Do not add filler.

## What to document

Document every relevant public API element in scope, and document private/internal elements when they control lifecycle, context, error handling, bootstrap, cleanup, orchestration, or other behavior that would otherwise be hard to infer from the code.

Relevant API elements include:

- exported classes
- exported functions
- public methods
- getters and setters
- constructors
- important private helpers
- type aliases when their runtime role or usage pattern is not obvious
- conventions expressed through filenames, directives, config objects, or special exports

## Documentation standard

Every block should help a reader answer these questions quickly:

1. What does this API element do?
2. When is it used?
3. What inputs does it expect?
4. What does it return or change?
5. What side effects or lifecycle implications does it have?
6. What errors, constraints, or execution-context requirements matter?
7. Where should the reader go next in the docs?

## Required structure

Start with a one-sentence summary that says what the API element does in direct, observable language.

After the opening sentence, add only the sections that are justified by the code:

- behavior details
- lifecycle or execution context
- side effects
- mutation semantics
- dependency/context requirements
- ordering guarantees
- cleanup behavior
- linked docs

Use tags when they add concrete value:

- `@param` for every meaningful parameter
- `@returns` when a value is returned or a promise resolves with a value
- `@throws` when the code can throw synchronously or the contract clearly allows failure modes worth surfacing
- `@example` when usage is not obvious from the signature alone

Do not force tags that would repeat the signature without adding information.

## Writing rules

1. Lead with behavior, not motivation. Write what the API does before explaining when it matters.
2. Use mechanical language. Prefer "Registers a middleware in the route pipeline" over "Lets you easily plug in middleware."
3. Be explicit about scope. Say whether something affects one request, the entire app, startup only, shutdown only, or all workers.
4. Describe side effects. Mention registration, mutation, logging, task scheduling, network listeners, cleanup hooks, worker messages, or context changes when present.
5. Describe constraints. Mention worker-only execution, bootstrap-only usage, ordering requirements, or assumptions imposed by the framework.
6. Make async semantics visible. If a method waits for startup, cleanup, I/O, or user code, say so.
7. Make mutation semantics visible. If a method uses a snapshot, mutable container, or shared registry, say so.
8. Link related docs when useful. Use absolute URLs with `https://lithiajs.org/` as the base.
9. Write all documentation in English. Summaries, prose, tag descriptions, and examples must all be written in English, even when the user request is in another language.
10. Keep tone neutral. Do not market the API and do not justify design choices.
11. Stay concrete. If the code does not prove a behavior, do not invent it.

## Detail rules

Aim for detailed comments, but make every sentence earn its place.

Add detail when the code includes:

- lifecycle sequencing
- bootstrap or teardown behavior
- runtime-only constraints
- internal context propagation
- scheduling or background execution
- global registration
- implicit framework conventions
- error handling with non-trivial consequences

Keep comments shorter when the code is a trivial getter or wrapper, but still document the returned value or scope when that helps navigation.

## Template

Use this as a pattern, not a rigid requirement:

```ts
/**
 * [One-sentence summary of what the API element does.]
 *
 * [Optional paragraph describing lifecycle, scope, side effects, ordering,
 * execution context, or framework-specific behavior.]
 *
 * @param {Type} name - [Concrete role of the parameter.]
 * @returns {Type} [What is returned or what the promise resolves with.]
 * @throws {ErrorType} [What can fail and under which condition.]
 * @example
 * // [Short example only when it clarifies usage.]
 */
```

## Links to docs

When the source code corresponds to product docs in `apps/docs/content/docs`, link them directly in the JSDoc when that helps the reader navigate.

Rules:

- browse `apps/docs/content/docs` to find the correct page
- write the final link as an absolute URL using `https://lithiajs.org/` as the base
- prefer exact pages over broad index pages
- only link when the relation is real and useful

Example:

- `https://lithiajs.org/docs/latest/async-tasks`
- `https://lithiajs.org/docs/latest/project-structure`

## Workflow

1. Identify every API element in scope that needs documentation.
2. Read surrounding code before writing, including helper methods and imported collaborators when needed to understand behavior.
3. Infer contract, lifecycle, and side effects only from code and existing docs.
4. Draft comments in descending order of importance: summary, behavior, constraints, side effects, tags.
5. Standardize nearby comments so related members read like one coherent API surface.
6. Add doc links where they materially improve discoverability.
7. Re-read the file and tighten vague wording, duplicated phrases, and unsupported claims.

## Quality bar

Before finishing, check that the documentation:

- covers all relevant members in the requested scope
- uses consistent terminology for the same concept
- distinguishes immutable versus mutable behavior where relevant
- explains startup, shutdown, and worker/runtime restrictions where relevant
- uses absolute `https://lithiajs.org/...` links
- is written entirely in English
- avoids filler, hype, and empty restatements of the type signature
