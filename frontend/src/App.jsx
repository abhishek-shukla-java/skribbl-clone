import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [brushColor, setBrushColor] = useState('#22d3ee');
  const [brushSize, setBrushSize] = useState(4);
  const canvasRef = useRef(null);

  const isHost = socket?.id && room?.hostId === socket.id;
  const isCurrentDrawer = socket?.id && room?.currentDrawerId === socket.id;
  const wordLengthDisplay = room?.selectedWord ? room.selectedWord.split('').map((char) => /[A-Za-z]/.test(char) ? '_' : char).join(' ') : 'Waiting for the drawer to choose a word.';

  useEffect(() => {
    const client = io('http://localhost:5000', {
      transports: ['websocket'],
    });

    client.on('connect', () => {
      setMessage('Connected to game server.');
    });

    client.on('room_created', (createdRoom) => {
      setRoom(createdRoom);
      setMessage(`Room created successfully. Code: ${createdRoom.roomCode}`);
    });

    client.on('room_joined', (joinedRoom) => {
      setRoom(joinedRoom);
      setMessage(`You joined room ${joinedRoom.roomCode}.`);
    });

    client.on('room_updated', (updatedRoom) => {
      setRoom(updatedRoom);
      setMessage(`Lobby updated. ${updatedRoom.players.length} player(s) in the room.`);
    });

    client.on('round_start', (startedRoom) => {
      setRoom(startedRoom);
      setMessage(`Round started! ${startedRoom.currentDrawerName || 'A player'} is drawing.`);
    });

    client.on('word_choices', ({ words }) => {
      setRoom((currentRoom) => ({
        ...(currentRoom || {}),
        wordChoices: words,
        status: 'choosing_word',
      }));
      setMessage('Choose one of the three words to start the round.');
    });

    client.on('word_chosen', (updatedRoom) => {
      setRoom((currentRoom) => ({
        ...(currentRoom || {}),
        ...updatedRoom,
        status: 'in_progress',
      }));
      setMessage(`The word has been chosen. ${updatedRoom.currentDrawerName || 'Drawer'} is ready to draw.`);
    });

    client.on('room_error', ({ message: errorMessage }) => {
      setMessage(errorMessage);
    });

    setSocket(client);

    return () => {
      client.disconnect();
    };
  }, []);

  const canCreateRoom = useMemo(() => playerName.trim().length > 0 && socket?.connected, [playerName, socket]);
  const canJoinRoom = useMemo(
    () => playerName.trim().length > 0 && roomCodeInput.trim().length > 0 && socket?.connected,
    [playerName, roomCodeInput, socket]
  );

  const handleCreateRoom = () => {
    if (!socket) {
      setMessage('Socket connection is not ready yet.');
      return;
    }

    if (!playerName.trim()) {
      setMessage('Please enter your player name first.');
      return;
    }

    socket.emit('create_room', { playerName: playerName.trim() });
  };

  const handleJoinRoom = () => {
    if (!socket) {
      setMessage('Socket connection is not ready yet.');
      return;
    }

    if (!playerName.trim()) {
      setMessage('Please enter your player name first.');
      return;
    }

    const code = roomCodeInput.trim().toUpperCase();

    if (!code) {
      setMessage('Please enter a room code to join.');
      return;
    }

    socket.emit('join_room', { playerName: playerName.trim(), roomCode: code });
  };

  const handleStartGame = () => {
    if (!socket) {
      setMessage('Socket connection is not ready yet.');
      return;
    }

    if (!room?.roomCode) {
      setMessage('You need to be in a room first.');
      return;
    }

    socket.emit('start_game', { roomCode: room.roomCode });
  };

  const handleChooseWord = (word) => {
    if (!socket || !room?.roomCode) {
      setMessage('Unable to choose a word right now.');
      return;
    }

    socket.emit('choose_word', { roomCode: room.roomCode, word });
  };

  const getCanvasContext = () => canvasRef.current?.getContext('2d');

  const startDrawing = (event) => {
    if (!isCurrentDrawer || !canvasRef.current) {
      return;
    }

    const context = getCanvasContext();
    if (!context) {
      return;
    }

    const point = getPoint(event);
    context.beginPath();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = brushSize;
    context.strokeStyle = brushColor;
    context.moveTo(point.x, point.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath();
    context.moveTo(point.x, point.y);
    event.preventDefault();
  };

  const draw = (event) => {
    if (!isCurrentDrawer || !canvasRef.current) {
      return;
    }

    const context = getCanvasContext();
    if (!context || !event.buttons) {
      return;
    }

    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    event.preventDefault();
  };

  const getPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const clearCanvas = () => {
    if (!canvasRef.current) {
      return;
    }

    const context = getCanvasContext();
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/60">
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-400">Skribbl Clone</p>
        <h1 className="mt-3 text-3xl font-semibold">Create or join a room</h1>
        <p className="mt-2 text-slate-300">Enter your name, then create a room or join an existing lobby.</p>

        <div className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-200" htmlFor="playerName">
            Player name
          </label>
          <input
            id="playerName"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-0 transition focus:border-cyan-400"
            placeholder="Enter your name"
          />

          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={!canCreateRoom}
            className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Create Room
          </button>

          <label className="block text-sm font-medium text-slate-200" htmlFor="roomCodeInput">
            Room code
          </label>
          <input
            id="roomCodeInput"
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-0 transition focus:border-cyan-400"
            placeholder="Enter room code"
          />

          <button
            type="button"
            onClick={handleJoinRoom}
            disabled={!canJoinRoom}
            className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Join Room
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200">
          <p className="font-medium text-cyan-300">Status</p>
          <p className="mt-1 text-slate-300">{message || 'Ready to create a lobby.'}</p>
        </div>

        {room && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-semibold">Lobby</p>
            <p className="mt-1">Code: <span className="font-mono text-xl tracking-[0.35em]">{room.roomCode}</span></p>
            <p className="mt-1">Host: {room.players[0]?.name || 'Waiting for host'}</p>
            {room.currentDrawerName && (
              <p className="mt-2 text-emerald-50">Current drawer: <span className="font-semibold">{room.currentDrawerName}</span></p>
            )}
            {isCurrentDrawer && room.status === 'choosing_word' && room.wordChoices?.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-400/30 bg-slate-950/50 p-4">
                <p className="text-sm font-semibold text-amber-100">Choose a word</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {room.wordChoices.map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => handleChooseWord(word)}
                      className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-amber-50 transition hover:bg-amber-300/20"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {room.selectedWord && (
              <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-slate-950/50 p-4">
                <p className="text-sm font-semibold text-cyan-100">{isCurrentDrawer ? 'Your secret word' : 'Word length'}</p>
                <p className="mt-1 text-lg font-mono tracking-[0.25em] text-cyan-50">{isCurrentDrawer ? room.selectedWord : wordLengthDisplay}</p>
              </div>
            )}
            {room.selectedWord && room.status === 'in_progress' && (
              <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-cyan-100">Drawing board</p>
                  {isCurrentDrawer && (
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {isCurrentDrawer ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs uppercase tracking-[0.25em] text-slate-300">Color</label>
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(event) => setBrushColor(event.target.value)}
                        className="h-10 w-16 rounded-lg border border-slate-700 bg-slate-800"
                      />
                      <label className="text-xs uppercase tracking-[0.25em] text-slate-300">Brush</label>
                      <select
                        value={brushSize}
                        onChange={(event) => setBrushSize(Number(event.target.value))}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                      >
                        <option value={2}>2 px</option>
                        <option value={4}>4 px</option>
                        <option value={6}>6 px</option>
                        <option value={8}>8 px</option>
                      </select>
                    </div>
                    <canvas
                      ref={canvasRef}
                      width="380"
                      height="220"
                      onPointerDown={startDrawing}
                      onPointerMove={draw}
                      onPointerUp={() => {}}
                      className="w-full rounded-2xl border border-slate-700 bg-white"
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Read-only view</p>
                    <canvas
                      ref={canvasRef}
                      width="380"
                      height="220"
                      className="w-full rounded-2xl border border-slate-700 bg-white cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            )}
            {isHost && !room.currentDrawerName && (
              <button
                type="button"
                onClick={handleStartGame}
                className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Start Game
              </button>
            )}
            <p className="mt-2 font-medium text-emerald-50">Players in lobby</p>
            <ul className="mt-2 space-y-1 text-emerald-100/90">
              {room.players.map((player) => (
                <li key={player.id} className="rounded-lg border border-emerald-400/20 bg-slate-950/40 px-3 py-2">{player.name}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
