import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const START_PORT = 8081;
const MAX_PORT_ATTEMPTS = 20;
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';
const NGROK_TIMEOUT_MS = 90_000;
const NGROK_POLL_MS = 500;

function tryPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      server.close();
      if (err.code === 'EADDRINUSE') resolve(false);
      else reject(err);
    });
    // No host arg → binds the unspecified (dual-stack) address, so a listener on
    // the IPv6 wildcard (`*:PORT`, e.g. another Metro/Expo project) is also detected.
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort() {
  for (let port = START_PORT; port <= START_PORT + MAX_PORT_ATTEMPTS; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await tryPort(port)) return port;
  }
  process.stderr.write(
    `[dev-with-tunnel] no free port in range ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS}\n`,
  );
  process.exit(1);
}

function fetchTunnels() {
  return new Promise((resolve) => {
    const req = http.get(NGROK_API, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(NGROK_POLL_MS, () => req.destroy());
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findTunnelUrl() {
  const deadline = Date.now() + NGROK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchTunnels();
    const tunnel = data?.tunnels?.find(
      (t) => t.proto === 'https' || t.public_url?.startsWith('https://'),
    );
    if (tunnel?.public_url) return tunnel.public_url;
    // eslint-disable-next-line no-await-in-loop
    await delay(NGROK_POLL_MS);
  }
  return null;
}

const freePort = await findFreePort();
const tunnelUrl = await findTunnelUrl();

if (tunnelUrl) {
  process.stdout.write(`[dev-with-tunnel] using ngrok tunnel: ${tunnelUrl}\n`);
} else {
  process.stderr.write(
    `[dev-with-tunnel] no ngrok tunnel detected after 30s — falling back to .env's EXPO_PUBLIC_API_URL\n`,
  );
}

// Expo's own dotenv load does NOT overwrite variables already set in process.env,
// so injecting EXPO_PUBLIC_API_URL here wins over the value in .env.
const child = spawn('expo', ['start', '--port', String(freePort)], {
  stdio: 'inherit',
  shell: true,
  env: tunnelUrl ? { ...process.env, EXPO_PUBLIC_API_URL: tunnelUrl } : process.env,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => process.exit(code ?? 0));
