import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState(null);

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

    client.on('room_error', ({ message: errorMessage }) => {
      setMessage(errorMessage);
    });

    setSocket(client);

    return () => {
      client.disconnect();
    };
  }, []);

  const canCreateRoom = useMemo(() => playerName.trim().length > 0 && socket?.connected, [playerName, socket]);

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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/60">
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-400">Skribbl Clone</p>
        <h1 className="mt-3 text-3xl font-semibold">Create a room</h1>
        <p className="mt-2 text-slate-300">Enter your name and create a unique room code for your lobby.</p>

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
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200">
          <p className="font-medium text-cyan-300">Status</p>
          <p className="mt-1 text-slate-300">{message || 'Ready to create a lobby.'}</p>
        </div>

        {room && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-semibold">Room created</p>
            <p className="mt-1">Code: <span className="font-mono text-xl tracking-[0.35em]">{room.roomCode}</span></p>
            <p className="mt-1">Players: {room.players.length}</p>
          </div>
        )}
      </section>
    </main>
  );
}
