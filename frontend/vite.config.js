import { defineConfig } from 'vite';

export default defineConfig({
  // Routes use hashes; unknown paths must return 404 so Wails can serve /media/.
  appType: 'mpa',
  base: '/',
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
});
