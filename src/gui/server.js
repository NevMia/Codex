const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { runExtraction } = require('../extractor');

function openBrowser(url) {
  let child;
  if (process.platform === 'win32') {
    child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }

  child.on('error', () => {
    // Intentionally ignore; GUI still works, user can open URL manually.
  });

  child.unref();
}

function openOutputFolder(dirPath) {
  let child;
  if (process.platform === 'win32') {
    child = spawn('explorer.exe', [dirPath], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    child = spawn('open', [dirPath], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('xdg-open', [dirPath], { detached: true, stdio: 'ignore' });
  }
  child.on('error', () => {});
  child.unref();
}


function resolveOutputPath(inputPath) {
  const trimmed = String(inputPath || '').trim();
  if (!trimmed) return '';

  // Support Windows absolute paths like C:\folder even when running on non-Windows hosts.
  if (/^[a-zA-Z]:\\/.test(trimmed)) return trimmed;

  // Relative paths resolve from app working directory (same base as extraction output path logic).
  return path.resolve(trimmed);
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

    if (req.method === 'POST' && req.url === '/open-output') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const out = String(data.out || '').trim();
          if (!out) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Missing output folder path');
            return;
          }

          const resolved = resolveOutputPath(out);
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Output folder does not exist');
            return;
          }

          openOutputFolder(resolved);
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Opened: ${resolved}`);
        } catch {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid request');
        }
      });
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
          log(`Total count (raw): ${result.meta.totalCountRaw}`);
          log(`Total count (capped for summary): ${result.meta.totalCountCappedForSummary}`);
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
    console.log(`If your browser did not open automatically, copy/paste this URL: ${url}`);
    openBrowser(url);
  });
}

module.exports = { startGui };
