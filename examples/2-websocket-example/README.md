# Lithia WebSocket Example

This example demonstrates how to use WebSockets in Lithia v5.

## Structure

```
src/
  app/
    routes/          # HTTP routes
      hello/
        route.ts
    events/          # WebSocket events
      connection.ts  # Connection handler
      disconnect.ts  # Disconnect handler
      chat/
        message.ts   # chat:message event
        join-room.ts # chat:join-room event
```

## Running

```bash
npm install
npm run dev
```

## Testing with Socket.IO Client

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected!');
  
  // Join a room
  socket.emit('chat:join-room', { room: 'general' });
  
  // Send a message
  socket.emit('chat:message', {
    message: 'Hello from client!',
    room: 'general'
  });
});

socket.on('chat:message', (data) => {
  console.log('Received message:', data);
});
```

