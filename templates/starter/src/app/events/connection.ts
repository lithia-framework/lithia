import { EventHandler } from "@lithia-js/core";

const Connection: EventHandler = async (socket) => {
  console.log(`Socket connected: ${socket.id}`);
};

export default Connection;