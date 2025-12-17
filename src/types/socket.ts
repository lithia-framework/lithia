import type { Socket, Server as SocketIOServer } from 'socket.io';

/**
 * Re-export Socket.IO types for convenience.
 */
export type { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * Handler function for Socket.IO events.
 * Receives the socket instance and optional event data.
 */
export type SocketEventHandler = (
  socket: Socket,
  data?: unknown,
) => Promise<void> | void;

/**
 * Socket event module structure.
 * Each file should export a default handler for a single event.
 */
export type SocketEventModule = {
  /** Default event handler (one event per file) */
  default?: SocketEventHandler;
};

/**
 * Represents a discovered Socket.IO event.
 * Similar to Route but for WebSocket events.
 */
export interface Event {
  /** Event name (e.g., 'chat:message' or 'connection') */
  name: string;
  /** Full file path to the event handler */
  filePath: string;
  /** Source file path (same as filePath for now) */
  sourceFilePath: string;
  /** Optional namespace if event is in a subdirectory */
  namespace?: string;
}
