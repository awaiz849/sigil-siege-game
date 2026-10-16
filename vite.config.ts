// Vite config. Defaults, plus one DEV-ONLY helper for tuning by hand (BUILD_PLAN A3):
// at game over the page POSTs its round log to /__round-log and the dev server appends it to
// logs/round-logs.txt, so the logs can be read straight from the project folder.
// apply: 'serve' means it only exists under `npm run dev`, never in the built game.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Largest log we accept (bytes); a round log is about 1 KB. */
const MAX_LOG_BYTES = 100_000;

function roundLogFile(): Plugin {
  return {
    name: 'round-log-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__round-log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_LOG_BYTES) req.destroy();
        });
        req.on('end', () => {
          const dir = join(server.config.root, 'logs');
          mkdirSync(dir, { recursive: true });
          appendFileSync(join(dir, 'round-logs.txt'), body.trim() + '\n\n');
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [roundLogFile()],
});
