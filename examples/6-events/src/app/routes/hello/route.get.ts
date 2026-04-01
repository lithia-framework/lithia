import type { RouteHandler } from "@lithia-js/core";

const helloRoute: RouteHandler = async (_req, res) => {
	return res.json({
		message: "Lithia events example is running.",
		socket: {
			events: ["connection", "disconnect", "chat:ping"],
			notes: [
				"Connect with a Socket.IO client to trigger the connection handler.",
				"Emit 'chat:ping' with any payload to receive 'chat:pong'.",
			],
		},
	});
};

export default helloRoute;
