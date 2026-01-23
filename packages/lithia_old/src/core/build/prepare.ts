import { mkdir, rm } from "node:fs/promises";

export async function prepare() {
	await rm(".lithia", { recursive: true, force: true });
	await mkdir(".lithia", { recursive: true });
}
