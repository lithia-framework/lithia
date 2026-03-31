import { LithiaClientError } from "../base";

export class BadRequestError extends LithiaClientError { constructor(m: string, d?: any) { super(m, 400, d); } }
export class UnauthorizedError extends LithiaClientError { constructor(m: string, d?: any) { super(m, 401, d); } }
export class ForbiddenError extends LithiaClientError { constructor(m: string, d?: any) { super(m, 403, d); } }
export class RouteNotFoundError extends LithiaClientError { constructor(m: string, d?: any) { super(m, 404, d); } }
export class NotFoundError extends LithiaClientError { constructor(m: string, d?: any) { super(m, 404, d); } }
export class ConflictError extends LithiaClientError { constructor(m: string, d?: any) { super(m, 409, d); } }