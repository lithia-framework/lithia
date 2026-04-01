import type { RouteHandler } from "@lithia-js/core";
import { useDependency } from "@lithia-js/core";
import { STARTUP_MESSAGE_KEY } from "../../server";

const helloRoute: RouteHandler = async (_req, res) => {
	const message = useDependency<string>(STARTUP_MESSAGE_KEY);

	return res.json({
		message,
	});
};

export default helloRoute;
