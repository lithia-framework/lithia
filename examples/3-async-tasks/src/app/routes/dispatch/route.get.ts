import type { RouteHandler } from "@lithia-js/core";
import { dispatchTask } from "@lithia-js/core";

const dispatchRoute: RouteHandler = async (req, res) => {
	const name = typeof req.query.name === "string" ? req.query.name : "Ada";

	dispatchTask("notifications:welcome-email", name);

	return res.json({
		message: "Task dispatched.",
		taskId: "notifications:welcome-email",
		payload: {
			name,
		},
	});
};

export default dispatchRoute;
