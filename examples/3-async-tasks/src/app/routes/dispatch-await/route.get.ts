import type { RouteHandler } from "@lithia-js/core";
import { executeTask } from "@lithia-js/core";

const dispatchAwaitRoute: RouteHandler = async (req, res) => {
	const name = typeof req.query.name === "string" ? req.query.name : "Ada";

	await executeTask("notifications:welcome-email", name);

	return res.json({
		message: "Task completed.",
		taskId: "notifications:welcome-email",
		payload: {
			name,
		},
	});
};

export default dispatchAwaitRoute;
