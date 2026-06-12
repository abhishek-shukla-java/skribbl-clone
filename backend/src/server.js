// Backend entry point for the Socket.IO game server.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();

const generateRoomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));

  return code;
};

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create_room', ({ playerName }) => {
    const trimmedName = playerName?.trim();

    if (!trimmedName) {
      socket.emit('room_error', { message: 'Please enter a player name.' });
      return;
    }

    const roomCode = generateRoomCode();
    const room = {
      roomCode,
      hostId: socket.id,
      players: [{ id: socket.id, name: trimmedName }],
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('room_created', room);

    console.log(`Room created: ${roomCode} by ${socket.id}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
