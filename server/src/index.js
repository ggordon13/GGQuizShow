import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { createGameServer } from './sockets.js';

const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 150;
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIST = path.resolve(SERVER_ROOT, '../client/dist');
const RESULTS_DIR = path.resolve(process.env.RESULTS_DIR || path.join(SERVER_ROOT, 'data/results'));

/** IPv4 LAN addresses, so the host screen can show a join URL that phones can reach. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // Phones lock screens and switch networks; be patient before declaring them gone.
  pingInterval: 10_000,
  pingTimeout: 20_000,
  // Quizzes with images are uploaded in one message when a game is created.
  maxHttpBufferSize: 32e6,
  cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined,
});

const { games } = createGameServer(io, { maxPlayers: MAX_PLAYERS, resultsDir: RESULTS_DIR });

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Question images, served from memory while their game is running.
app.get('/api/media/:pin/:index', (req, res) => {
  const image = games.get(req.params.pin)?.imageFor(Number(req.params.index));
  if (!image) return res.sendStatus(404);
  res.set({
    'Content-Type': image.mime,
    'Cache-Control': 'public, max-age=86400, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image.data);
});
app.get('/api/info', (_req, res) => res.json({ maxPlayers: MAX_PLAYERS, lanAddresses: lanAddresses() }));

// In production the server also serves the built React app.
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`GG Quiz Show server listening on http://localhost:${PORT} (max ${MAX_PLAYERS} players per game)`);
  console.log(`  Results are saved to ${RESULTS_DIR}`);
  if (existsSync(CLIENT_DIST)) {
    for (const ip of lanAddresses()) console.log(`  On your network: http://${ip}:${PORT}`);
  }
});
