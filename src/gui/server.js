const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { runExtraction } = require('../extractor');

function safeSpawn(cmd, args, opts) {
  const child = spawn(cmd, args, opts);
  // Prevent unhandled 'error' event (e.g., ENOENT when xdg-open isn't available)
  child.on('error', () => {});
  return child;
}

function openBrowser(url) {
  const opts = { detached: true, stdio: 'ignore' };
  if (process.platform === 'win32') safeSpawn('cmd', ['/c', 'start', '', url], opts);
  else if (process.platform === 'darwin') safeSpawn('open', [url], opts);
  else safeSpawn('xdg-open', [url], opts);
}

function startGui() {
  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      const html = fs.readFileSync(path.join(publicDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && req.url === '/start') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        const data = JSON.parse(body || '{}');
        const log = (msg) => res.write(`[${new Date().toISOString()}] ${msg}\n`);

        try {
          const result = await runExtraction({
            video: data.video,
            apiKey: data.key,
            out: data.out,
            order: data.order,
            sleepMs: Number(data.sleep_ms || 50),
            capPerThread: Number(data.cap_per_thread || 5),
            dryRun: Boolean(data.dry_run),
            logger: log
          });
          log('Completed successfully.');
          log(`Output folder: ${data.out}`);
          // extractor meta now reports both raw and capped totals
          if (result?.meta?.totalCountRaw != null) log(`Total count (raw): ${result.meta.totalCountRaw}`);
          if (result?.meta?.totalCountCappedForSummary != null) log(`Total count (capped for summary): ${result.meta.totalCountCappedForSummary}`);
        } catch (e) {
          log(`Error: ${e.message}`);
        }
        res.end();
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}`;
    console.log(`GUI running at ${url}`);
    openBrowser(url);
  });
}

module.exports = { startGui };
