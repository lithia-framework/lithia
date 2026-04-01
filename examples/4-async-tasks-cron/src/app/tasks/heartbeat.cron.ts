import fs from "node:fs/promises";
import path from "node:path";

const heartbeatFilePath = path.join(process.cwd(), "tmp", "heartbeat.json");

export const schedule = "*/10 * * * * *";
export const retries = 2;

export default async function heartbeat() {
	await fs.mkdir(path.dirname(heartbeatFilePath), { recursive: true });
	await fs.writeFile(
		heartbeatFilePath,
		JSON.stringify(
			{
				status: "ok",
				lastRunAt: new Date().toISOString(),
			},
			null,
			2,
		),
		"utf-8",
	);
}
