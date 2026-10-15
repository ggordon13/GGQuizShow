import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200, // three.js is most of the bundle; it's expected
  },
  server: {
    host: true, // expose on the LAN so phones can join during development
    port: 5173,
    proxy: {
      '/socket.io': { target: API, ws: true },
      '/api': API,
    },
  },
});
