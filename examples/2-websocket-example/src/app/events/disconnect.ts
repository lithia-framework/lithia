import type { Socket } from 'socket.io';

/**
 * Disconnect event handler.
 * Called when a client disconnects from the WebSocket server.
 */
export default async (socket: Socket) => {
  console.log(`Client disconnected: ${socket.id}`);
  // Cleanup logic can be added here
};

