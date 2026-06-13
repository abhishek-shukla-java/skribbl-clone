// Backend entry point for the Socket.IO game server.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();
const WORD_BANK = [
  'apple', 'planet', 'rocket', 'guitar', 'tiger', 'ocean', 'castle', 'flower', 'piano', 'sunset',
  'pirate', 'diamond', 'volcano', 'jungle', 'garden', 'dragon', 'umbrella', 'library', 'mountain', 'robot',
];

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
      status: 'lobby',
      currentDrawerId: null,
      currentDrawerName: null,
      wordChoices: [],
      selectedWord: null,
      chatMessages: [],
      guessedPlayers: [],
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('room_created', room);
    socket.emit('room_updated', room);

    console.log(`Room created: ${roomCode} by ${socket.id}`);
  });

  socket.on('join_room', ({ playerName, roomCode }) => {
    const trimmedName = playerName?.trim();
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!trimmedName) {
      socket.emit('room_error', { message: 'Please enter a player name.' });
      return;
    }

    if (!room) {
      socket.emit('room_error', { message: 'Room does not exist. Check the code and try again.' });
      return;
    }

    if (!room.players.some((player) => player.id === socket.id)) {
      room.players.push({ id: socket.id, name: trimmedName });
    }

    socket.join(code);
    socket.emit('room_joined', room);
    io.to(code).emit('room_updated', room);

    console.log(`Player ${socket.id} joined room ${code}`);
  });

  socket.on('start_game', ({ roomCode }) => {
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('room_error', { message: 'Room does not exist.' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('room_error', { message: 'Only the host can start the game.' });
      return;
    }

    const firstDrawer = room.players[0];
    const wordChoices = [...WORD_BANK]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    room.status = 'choosing_word';
    room.currentDrawerId = firstDrawer?.id || null;
    room.currentDrawerName = firstDrawer?.name || null;
    room.wordChoices = wordChoices;
    room.selectedWord = null;
    room.chatMessages = [];
    room.guessedPlayers = [];

    io.to(code).emit('round_start', room);
    io.to(firstDrawer.id).emit('word_choices', { roomCode: code, words: wordChoices });

    console.log(`Round started in room ${code} by host ${socket.id}`);
  });

  socket.on('choose_word', ({ roomCode, word }) => {
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('room_error', { message: 'Room does not exist.' });
      return;
    }

    if (room.currentDrawerId !== socket.id) {
      socket.emit('room_error', { message: 'Only the current drawer can choose a word.' });
      return;
    }

    if (!room.wordChoices.includes(word)) {
      socket.emit('room_error', { message: 'That word is not available.' });
      return;
    }

    room.selectedWord = word;
    room.status = 'in_progress';

    io.to(code).emit('word_chosen', {
      roomCode: code,
      selectedWord: word,
      currentDrawerId: room.currentDrawerId,
      currentDrawerName: room.currentDrawerName,
      wordChoices: room.wordChoices,
    });

    console.log(`Drawer ${socket.id} chose word "${word}" for room ${code}`);
  });

  socket.on('draw_start', ({ roomCode, stroke }) => {
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room || room.currentDrawerId !== socket.id) {
      return;
    }

    io.to(code).emit('draw_start', { drawerId: socket.id, stroke });
  });

  socket.on('draw_move', ({ roomCode, point }) => {
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room || room.currentDrawerId !== socket.id) {
      return;
    }

    io.to(code).emit('draw_move', { drawerId: socket.id, point });
  });

  socket.on('draw_end', ({ roomCode }) => {
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room || room.currentDrawerId !== socket.id) {
      return;
    }

    io.to(code).emit('draw_end', { drawerId: socket.id });
  });

  socket.on('submit_guess', ({ roomCode, guess }) => {
    const code = roomCode?.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('room_error', { message: 'Room does not exist.' });
      return;
    }

    if (!room.selectedWord || room.status !== 'in_progress') {
      socket.emit('room_error', { message: 'The round is not active yet.' });
      return;
    }

    if (room.currentDrawerId === socket.id) {
      socket.emit('room_error', { message: 'The drawer cannot guess.' });
      return;
    }

    const normalizedGuess = guess?.trim().toLowerCase();
    const normalizedWord = room.selectedWord.trim().toLowerCase();
    const player = room.players.find((entry) => entry.id === socket.id);

    if (!normalizedGuess) {
      socket.emit('room_error', { message: 'Please enter a guess before sending it.' });
      return;
    }

    const chatMessage = {
      id: `${socket.id}-${Date.now()}`,
      type: 'guess',
      playerName: player?.name || 'Player',
      text: guess.trim(),
    };

    room.chatMessages = [...(room.chatMessages || []).slice(-19), chatMessage];
    io.to(code).emit('chat_message', chatMessage);

    if (normalizedGuess === normalizedWord) {
      if (room.guessedPlayers?.includes(socket.id)) {
        return;
      }

      room.guessedPlayers = [...(room.guessedPlayers || []), socket.id];

      const correctMessage = {
        id: `${socket.id}-correct-${Date.now()}`,
        type: 'system',
        text: `${player?.name || 'Player'} guessed the word!`,
      };

      room.chatMessages = [...(room.chatMessages || []).slice(-19), correctMessage];
      io.to(code).emit('chat_message', correctMessage);
      io.to(code).emit('guess_correct', { playerId: socket.id, playerName: player?.name || 'Player' });
    }
  });

  socket.on('disconnect', () => {
    const roomCode = Array.from(socket.rooms).find((roomId) => rooms.has(roomId) && roomId !== socket.id);

    if (!roomCode) {
      console.log('Client disconnected:', socket.id);
      return;
    }

    const room = rooms.get(roomCode);

    if (!room) {
      console.log('Client disconnected:', socket.id);
      return;
    }

    room.players = room.players.filter((player) => player.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
    } else {
      io.to(roomCode).emit('room_updated', room);
    }

    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
