import type { RouteHandler } from "@lithia-js/core";

const helloRoute: RouteHandler = async (_req, res) => {
	return res.json({
		message: "Hello from Lithia.",
	});
};

export default helloRoute;
