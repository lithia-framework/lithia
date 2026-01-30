import { createHash } from "node:crypto";
import { access } from "node:fs/promises";

export function produceDigest(err: unknown): string {
	const errString =
		err instanceof Error ? err.stack || err.message : String(err);

	const hash = createHash("sha256")
		.update(`${errString}${Date.now()}${Math.random()}`)
		.digest("hex");

	return hash.slice(0, 12);
}

export async function fileExists(filePath: string): Promise<boolean> {
  return await access(filePath).then(() => true).catch(() => false);
}