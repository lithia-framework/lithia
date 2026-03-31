import fs from "node:fs/promises";
import path from "node:path";
import type { RouteHandler } from "@lithia-js/core";

const heartbeatFilePath = path.join(process.cwd(), "tmp", "heartbeat.json");

const heartbeatRoute: RouteHandler = async (_req, res) => {
	try {
		const content = await fs.readFile(heartbeatFilePath, "utf-8");
		return res.json(JSON.parse(content));
	} catch {
		return res.json({
			status: "waiting",
			message: "The CRON task has not produced a heartbeat yet.",
		});
	}
};

export default heartbeatRoute;
