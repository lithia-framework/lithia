import type { Socket } from 'socket.io';

/**
 * Connection event handler.
 * Called when a client connects to the WebSocket server.
 */
export default async (socket: Socket) => {
  // Store custom data on the socket
  socket.data.userId = `user-${socket.id}`;
  socket.data.connectedAt = Date.now();

  console.log(`Client connected: ${socket.data.userId}`);

  // Send welcome message
  setTimeout(() => {
    socket.emit('welcome', {
      message: 'Connected to Lithia WebSocket server',
      serverTime: Date.now(),
      socketId: socket.id,
    });
  }, 0);
};
