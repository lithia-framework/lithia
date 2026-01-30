import { EventHandler } from "@lithia-js/core";

const Disconnect: EventHandler = async (socket) => {
  console.log(`Socket disconnected: ${socket.id}`);
};

export default Disconnect;