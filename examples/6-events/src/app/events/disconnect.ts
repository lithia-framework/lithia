import type { EventHandler } from "@lithia-js/core";

const disconnectEvent: EventHandler = async (socket, reason) => {
	console.log(`[events-example] ${socket.id} disconnected: ${String(reason)}`);
};

export default disconnectEvent;
