import { createHash } from "node:crypto";

/**
 * Produces a short non-deterministic digest for error reporting.
 *
 * The digest is derived from the error stack or message plus time- and
 * randomness-based entropy, so repeated failures do not generate a stable
 * identifier across executions.
 *
 * @param {unknown} err - Original error or thrown value.
 * @returns {string} Short hexadecimal digest suitable for logs and client error
 * payloads.
 */
export function produceDigest(err: unknown): string {
	const errString =
		err instanceof Error ? err.stack || err.message : String(err);

	const hash = createHash("sha256")
		.update(`${errString}${Date.now()}${Math.random()}`)
		.digest("hex");

	return hash.slice(0, 12);
}
