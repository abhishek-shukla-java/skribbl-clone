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
const DEFAULT_TOTAL_ROUNDS = 3;
const DEFAULT_DRAW_TIME_SECONDS = 60;

const generateRoomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));

  return code;
};

const getScores = (room) => room.players.map((player) => ({ id: player.id, name: player.name, score: player.score || 0 }));

const sanitizeRoom = (room) => {
  if (!room) {
    return room;
  }

  const { timerId, ...safeRoom } = room;
  return safeRoom;
};

const clearRoundTimer = (room) => {
  if (room.timerId) {
    clearInterval(room.timerId);
    room.timerId = null;
  }
};

const startRound = (room, drawerIndex, roundNumber = room.currentRound || 1) => {
  const drawer = room.players[drawerIndex] || room.players[0];
  const wordChoices = [...WORD_BANK]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  room.currentRound = roundNumber;
  room.status = 'choosing_word';
  room.currentDrawerId = drawer?.id || null;
  room.currentDrawerName = drawer?.name || null;
  room.wordChoices = wordChoices;
  room.selectedWord = null;
  room.chatMessages = [];
  room.guessedPlayers = [];

  return { drawer, wordChoices };
};

const startRoundTimer = (room, code, io) => {
  clearRoundTimer(room);
  room.remainingTime = room.drawTimeSeconds || DEFAULT_DRAW_TIME_SECONDS;

  io.to(code).emit('timer_tick', {
    roomCode: code,
    remainingTime: room.remainingTime,
    totalTime: room.drawTimeSeconds || DEFAULT_DRAW_TIME_SECONDS,
  });

  room.timerId = setInterval(() => {
    room.remainingTime -= 1;
    io.to(code).emit('timer_tick', {
      roomCode: code,
      remainingTime: room.remainingTime,
      totalTime: room.drawTimeSeconds || DEFAULT_DRAW_TIME_SECONDS,
    });

    if (room.remainingTime <= 0) {
      clearRoundTimer(room);
      endRound(room, code, io, 'time_up');
    }
  }, 1000);
};

const endRound = (room, code, io, reason = 'guess') => {
  if (room.status === 'game_over' || room.status === 'round_end') {
    return;
  }

  clearRoundTimer(room);
  room.status = 'round_end';

  io.to(code).emit('round_end', {
    roomCode: code,
    correctWord: room.selectedWord,
    scores: getScores(room),
    reason,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds || DEFAULT_TOTAL_ROUNDS,
  });

  const isFinalRound = room.currentRound >= (room.totalRounds || DEFAULT_TOTAL_ROUNDS);
  if (isFinalRound) {
    const winner = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    room.status = 'game_over';
    io.to(code).emit('game_over', {
      roomCode: code,
      winner,
      scores: getScores(room),
      currentRound: room.currentRound,
      totalRounds: room.totalRounds || DEFAULT_TOTAL_ROUNDS,
    });
    return;
  }

  setTimeout(() => {
    if (room.status !== 'round_end') {
      return;
    }

    const currentIndex = room.players.findIndex((entry) => entry.id === room.currentDrawerId);
    const nextIndex = (currentIndex + 1) % room.players.length;
    const nextDrawer = room.players[nextIndex];

    if (!nextDrawer) {
      room.status = 'lobby';
      io.to(code).emit('room_updated', sanitizeRoom(room));
      return;
    }

    room.currentRound += 1;
    startRound(room, nextIndex, room.currentRound);
    io.to(code).emit('round_start', sanitizeRoom(room));
    io.to(nextDrawer.id).emit('word_choices', { roomCode: code, words: room.wordChoices });
    startRoundTimer(room, code, io);
  }, 5000);
};

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create_room', ({ playerName, totalRounds, drawTimeSeconds }) => {
    const trimmedName = playerName?.trim();

    if (!trimmedName) {
      socket.emit('room_error', { message: 'Please enter a player name.' });
      return;
    }

    const roomCode = generateRoomCode();
    const room = {
      roomCode,
      hostId: socket.id,
      players: [{ id: socket.id, name: trimmedName, score: 0 }],
      status: 'lobby',
      totalRounds: Number.isFinite(Number(totalRounds)) && Number(totalRounds) > 0 ? Number(totalRounds) : DEFAULT_TOTAL_ROUNDS,
      drawTimeSeconds: Number.isFinite(Number(drawTimeSeconds)) && Number(drawTimeSeconds) > 0 ? Number(drawTimeSeconds) : DEFAULT_DRAW_TIME_SECONDS,
      currentRound: 1,
      currentDrawerId: null,
      currentDrawerName: null,
      wordChoices: [],
      selectedWord: null,
      chatMessages: [],
      guessedPlayers: [],
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('room_created', sanitizeRoom(room));
    socket.emit('room_updated', sanitizeRoom(room));

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
      room.players.push({ id: socket.id, name: trimmedName, score: 0 });
    } else {
      room.players = room.players.map((player) =>
        player.id === socket.id ? { ...player, name: trimmedName, score: player.score || 0 } : player
      );
    }

    socket.join(code);
    socket.emit('room_joined', sanitizeRoom(room));
    io.to(code).emit('room_updated', sanitizeRoom(room));

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

    if (room.status === 'game_over') {
      socket.emit('room_error', { message: 'The game is already finished.' });
      return;
    }

    room.currentRound = 1;
    const { drawer, wordChoices } = startRound(room, 0, 1);

    io.to(code).emit('round_start', sanitizeRoom(room));
    io.to(drawer.id).emit('word_choices', { roomCode: code, words: wordChoices });

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
    startRoundTimer(room, code, io);

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

      const guesser = room.players.find((player) => player.id === socket.id);
      const drawer = room.players.find((player) => player.id === room.currentDrawerId);

      if (guesser) {
        guesser.score = (guesser.score || 0) + 100;
      }
      if (drawer) {
        drawer.score = (drawer.score || 0) + 50;
      }

      room.guessedPlayers = [...(room.guessedPlayers || []), socket.id];

      const correctMessage = {
        id: `${socket.id}-correct-${Date.now()}`,
        type: 'system',
        text: `${player?.name || 'Player'} guessed the word!`,
      };

      room.chatMessages = [...(room.chatMessages || []).slice(-19), correctMessage];
      io.to(code).emit('chat_message', correctMessage);
      io.to(code).emit('guess_correct', {
        playerId: socket.id,
        playerName: player?.name || 'Player',
        scores: room.players.map((entry) => ({ id: entry.id, name: entry.name, score: entry.score || 0 })),
      });
      io.to(code).emit('room_updated', sanitizeRoom(room));

      endRound(room, code, io, 'guess');
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
      io.to(roomCode).emit('room_updated', sanitizeRoom(room));
    }

    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
