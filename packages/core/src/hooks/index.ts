/**
 * Lithia hooks for accessing context and dependencies.
 *
 * This module provides a composable API for accessing request/event data
 * and managing dependencies through dependency injection.
 *
 * ## Hook Categories
 *
 * ### Route Hooks (HTTP Requests)
 * - `useRequest()`: Access the current request object
 * - `useResponse()`: Access the current response object
 * - `useRoute()`: Access the matched route metadata
 * - `useParams()`: Access route parameters (e.g., `/users/:id`)
 * - `useQuery()`: Access URL query parameters
 * - `useHeaders()`: Access request headers
 *
 * ### Event Hooks (Socket.IO)
 * - `useData()`: Access event payload data
 *
 * ### Dependency Injection Hooks (Both)
 * - `provide()`: Register a dependency in the container
 * - `inject()`: Retrieve a required dependency
 * - `injectOptional()`: Retrieve an optional dependency
 *
 * @module hooks
 *
 * @example
 * ```typescript
 * import { useParams, inject } from '@lithiajs/core';
 *
 * export default async function handler() {
 *   const { id } = useParams<{ id: string }>();
 *   const db = inject(dbKey);
 *   const user = await db.findUser(id);
 *   return user;
 * }
 * ```
 */

// Dependency injection hooks
export {
	type InjectionKey,
	inject,
	injectOptional,
	provide,
} from "./dependency-hooks";
// Socket.IO event hooks
export { useData } from "./event-hooks";
// HTTP Route hooks
export {
	useHeaders,
	useParams,
	useQuery,
	useRequest,
	useResponse,
	useRoute,
  useSocketServer
} from "./route-hooks";
