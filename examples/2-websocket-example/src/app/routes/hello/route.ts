import type { LithiaRequest, LithiaResponse } from 'lithia';

export default async (_: LithiaRequest, res: LithiaResponse) => {
  res.json({
    message: 'Hello from Lithia with WebSocket support!',
    websocket: 'Connect to this server using Socket.IO client',
  });
};

