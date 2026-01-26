import { EventHandler, logger } from "@lithiajs/core";

const handler: EventHandler = async (socket) => {
  logger.info(
    `Client connected: ${socket.id}`
  )
}

export default handler;