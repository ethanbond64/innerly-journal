import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Routes use hashes; unknown paths must return 404 so Wails can serve /media/.
  appType: 'mpa',
  base: '/',
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
});
