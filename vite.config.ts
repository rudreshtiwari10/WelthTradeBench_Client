import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server proxies API + WebSocket to the local backend (Phase 2).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
});
