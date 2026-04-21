#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const docsRoot = join(repoRoot, 'docs');

const args = process.argv.slice(2);
const portArgIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
const port = Number(
  portArgIndex >= 0 && args[portArgIndex + 1]
    ? args[portArgIndex + 1]
    : process.env.PORT || 8000,
);

if (!Number.isInteger(port) || port <= 0) {
  console.error('Invalid port. Use --port <number> or set PORT.');
  process.exit(1);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function getRequestPath(url = '/') {
  const pathname = new URL(url, 'http://localhost').pathname;
  return pathname === '/' ? '/index.html' : pathname;
}

function resolveFilePath(requestPath) {
  const safePath = normalize(requestPath).replace(/^\/+/, '');
  let filePath = join(docsRoot, safePath);

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (existsSync(htmlPath)) filePath = htmlPath;
  }

  return filePath;
}

const server = createServer(async (req, res) => {
  try {
    const requestPath = getRequestPath(req.url);
    const filePath = resolveFilePath(requestPath);
    const normalizedFilePath = resolve(filePath);

    if (!normalizedFilePath.startsWith(docsRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (!existsSync(normalizedFilePath) || !statSync(normalizedFilePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = extname(normalizedFilePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });

    createReadStream(normalizedFilePath).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
    console.error(error);
  }
});

server.listen(port, () => {
  console.log(`Serving LazyPi docs at http://localhost:${port}`);
  console.log('Routes:');
  console.log(`  /            -> docs/index.html`);
  console.log(`  /docs/       -> docs/docs/index.html`);
  console.log(`  /themes.html -> docs/themes.html`);
  console.log(`  /faq.html    -> docs/faq.html`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
