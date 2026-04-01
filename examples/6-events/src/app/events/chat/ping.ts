import type { EventHandler } from "@lithia-js/core";
import { useEvent } from "@lithia-js/core";

type PingPayload = {
	message?: string;
};

const pingEvent: EventHandler = async (socket, data: PingPayload) => {
	const event = useEvent();

	socket.emit("chat:pong", {
		socketId: socket.id,
		event: event.name,
		message: data?.message ?? "pong",
		timestamp: new Date().toISOString(),
	});
};

export default pingEvent;
