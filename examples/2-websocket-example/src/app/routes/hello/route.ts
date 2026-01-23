import type { LithiaRequest, LithiaResponse } from "lithia";
import { useSocket } from "lithia/core";

export default async (_: LithiaRequest, res: LithiaResponse) => {
	const socket = useSocket()!;

	socket
		.to("room1")
		.emit("chat:message:sent", { success: true, messageId: "message" });

	res.json({
		message: "Hello from Lithia with WebSocket support!",
		websocket: "Connect to this server using Socket.IO client",
	});
};
