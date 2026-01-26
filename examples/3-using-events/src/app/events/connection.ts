import { EventHandler, logger } from "@lithia-js/core";

const handler: EventHandler = async (socket) => {
  logger.info(
    `Client connected: ${socket.id}`
  )
}

export default handler;