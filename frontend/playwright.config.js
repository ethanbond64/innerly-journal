import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= fileURLToPath(new URL('../.work/playwright', import.meta.url));

export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.js',
    outputDir: '../.work/ui-results',
    fullyParallel: true,
    workers: 2,
    use: { baseURL: 'http://127.0.0.1:5178', viewport: { width: 1200, height: 850 }, trace: 'retain-on-failure' },
    projects: [{ name: 'webkit', use: { browserName: 'webkit' } }, { name: 'chromium', use: { browserName: 'chromium' } }],
    webServer: { command: 'npm run start -- --host 127.0.0.1 --port 5178 --strictPort', url: 'http://127.0.0.1:5178', reuseExistingServer: false },
});
