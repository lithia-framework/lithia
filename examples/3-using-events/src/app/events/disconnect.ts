import { EventHandler, logger } from "@lithiajs/core";

const handler: EventHandler = async (socket) => {
  logger.info(
    `Client disconnected: ${socket.id}`
  )
}

export default handler;