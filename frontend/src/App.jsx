import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState(null);

  const isHost = socket?.id && room?.hostId === socket.id;

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
