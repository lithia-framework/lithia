import type { Socket } from 'socket.io';

interface JoinRoomData {
  room: string;
}

/**
 * Join room event handler.
 * Allows clients to join specific rooms for targeted messaging.
 */
export default async (socket: Socket, data: JoinRoomData) => {
  if (!data.room) {
    socket.emit('error', { message: 'Room name is required' });
    return;
  }

  socket.join(data.room);
  socket.emit('room:joined', {
    room: data.room,
    message: `Joined room: ${data.room}`,
  });

  // Notify others in the room
  socket.to(data.room).emit('room:user-joined', {
    room: data.room,
    userId: socket.data.userId,
    socketId: socket.id,
  });
};

