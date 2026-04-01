import type { EventHandler } from "@lithia-js/core";

const connectionEvent: EventHandler = async (socket) => {
	socket.emit("server:connected", {
		socketId: socket.id,
		message: "Connected to the Lithia events example.",
	});
};

export default connectionEvent;
