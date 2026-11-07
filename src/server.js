import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from './config.js';

const DASHBOARD = path.join(ROOT, 'public', 'index.html');

// Dashboard: JSON API + server-sent events. Requests must name the server by
// localhost, an IP address or an ALLOWED_HOSTS entry (blocks DNS rebinding),
// and writes need a JSON body (blocks cross-site form posts).
export function startServer({ port, bindHost, allowedHosts, snapshot, actions }) {
  const clients = new Set();
  let pending = null;

  const broadcast = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      const data = `data: ${JSON.stringify(snapshot())}\n\n`;
      for (const res of clients) res.write(data);
    }, 250);
  };

  const server = http.createServer(async (req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    if (!isAllowedHost(host, allowedHosts)) return send(res, 403, { error: `Host "${host}" not allowed; add it to ALLOWED_HOSTS` });
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return fs.createReadStream(DASHBOARD).pipe(res);
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, snapshot());
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { error: 'expected JSON' });
      const action = actions[url.pathname.slice('/api/'.length)];
      if (!action) return send(res, 404, { error: 'not found' });
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const result = await action(body);
        broadcast();
        return send(res, 200, { ok: true, ...result });
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
    }
    send(res, 404, { error: 'not found' });
  });

  // Resolves once the port is ours; rejects with EADDRINUSE if another copy has it.
  const listening = new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  server.listen(port, bindHost);
  return { server, broadcast, listening };
}

function isAllowedHost(host, allowedHosts) {
  if (host === 'localhost' || allowedHosts.includes(host)) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:.]+\]$/.test(host);
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
