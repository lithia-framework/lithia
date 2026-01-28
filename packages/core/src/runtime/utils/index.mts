import { createHash } from "node:crypto";

export function digest(err: unknown): string {
	const errString =
		err instanceof Error ? err.stack || err.message : String(err);

	const hash = createHash("sha256")
		.update(`${errString}${Date.now()}${Math.random()}`)
		.digest("hex");

	return hash.slice(0, 12);
}
