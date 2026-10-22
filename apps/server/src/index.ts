import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { applyMigrations, createDb } from '@quest/db';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './api/app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { recheckOpportunity } from './detection/recheck';
import { runDetection, type DetectionSummary } from './detection/run';
import { createNotifier } from './notify/telegram';
import { createPoller } from './poller/poller';
import { createProvider } from './providers/index';

// Load the repo-root .env (for local `pnpm start`). In Docker, compose's env_file
// supplies these instead, and loadEnvFile no-ops on the missing file.
try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
} catch {
  /* no .env file — rely on the real process environment */
}

const config = loadConfig(process.env);

// Ensure the sqlite data directory exists (no-op for :memory:).
if (config.databaseUrl !== ':memory:') {
  mkdirSync(dirname(config.databaseUrl), { recursive: true });
}

const db = createDb(config.databaseUrl);
applyMigrations(db);

const provider = createProvider(config);
const clock = systemClock;
const notifier = createNotifier(config);
if (notifier.enabled) console.log('[quest] telegram notifications enabled');

const detect = async (): Promise<DetectionSummary> => {
  const summary = await runDetection({ db, provider, config, clock, notifier });
  const coverage = Object.entries(summary.bookCoverage ?? {})
    .map(([b, n]) => `${b}=${n}`)
    .join(' ');
  console.log(
    `[quest] poll — markets=${summary.marketsFetched} arbs=${summary.arbsFound} values=${summary.valuesFound} errors=${summary.errors} archived=${summary.archived ?? 0} clv=${summary.clvCaptured ?? 0} | books: ${coverage}`,
  );
  return summary;
};

const poller = createPoller<DetectionSummary>({
  intervalMs: config.pollIntervalSeconds * 1000,
  runOnce: detect,
});
poller.start();

// The API triggers polls through the SAME poller, so POST /api/poll shares the
// overlap guard and can never run a detection concurrently with an interval tick.
const app = createApp({
  db,
  config,
  runOnce: () => poller.runOnce(),
  recheck: (id) => recheckOpportunity({ db, provider, config, clock }, id),
  supportsRecheck: typeof provider.recheckEvent === 'function',
  clock,
});

// In production (Docker) serve the built web app from WEB_DIST: static assets first,
// then an SPA fallback to index.html for any non-API route. Absent in dev (Vite serves it).
const webDist = process.env.WEB_DIST;
if (webDist && existsSync(webDist)) {
  // Unmatched API routes get a JSON 404 (never the SPA HTML), so client errors aren't masked.
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
  app.use('/*', serveStatic({ root: webDist }));
  app.get('/*', serveStatic({ root: webDist, path: 'index.html' }));
  console.log(`[quest] serving web app from ${webDist}`);
}

console.log(
  `[quest] provider=${provider.name} regions=${config.regions.join(',')} sports=${config.sports.join(',')} poll=${config.pollIntervalSeconds}s`,
);
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[quest] API listening on http://localhost:${info.port}`);
});

// Graceful shutdown for clean container restarts.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[quest] ${sig} received — shutting down`);
    poller.stop();
    server.close(() => process.exit(0));
  });
}
