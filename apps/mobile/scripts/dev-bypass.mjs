import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';

const START_PORT = 8081;
const MAX_PORT_ATTEMPTS = 20;

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
    if (await tryPort(port)) return port;
  }
  process.stderr.write(
    `[dev-bypass] no free port in range ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS}\n`,
  );
  process.exit(1);
}

// Interface-name prefixes we must NEVER hand a phone: a Docker bridge, a libvirt
// bridge, a veth pair, or a VPN interface (Tailscale/WireGuard/ZeroTier/OpenVPN)
// all carry an address that is routable from THIS laptop but NOT from the phone on
// the physical Wi-Fi/LAN. Picking one of those (the naive "first non-internal IPv4"
// bug) makes dev auto-login silently fail on device. Match is case-insensitive prefix.
const EXCLUDED_IFACE_PREFIXES = [
  'docker',
  'br-',
  'veth',
  'virbr',
  'tailscale',
  'tun',
  'tap',
  'zt',
  'utun',
  'wg',
  'lo',
];

function isExcludedIface(name) {
  const lower = name.toLowerCase();
  return EXCLUDED_IFACE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// Only RFC1918 private ranges are reachable from a phone on the same LAN.
function isRfc1918(ip) {
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('10.')) return true;
  // 172.16.0.0 – 172.31.255.255
  const match = /^172\.(\d+)\./.exec(ip);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

// Tailscale's CGNAT range 100.64.0.0/10 (100.64.* – 100.127.*) is routable from the
// laptop over the VPN but unreachable from a phone on the physical LAN — exclude it.
function isCgnat(ip) {
  const match = /^100\.(\d+)\./.exec(ip);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 64 && second <= 127;
}

// Well-known virtualization/connection-sharing subnets. A phone on the real
// Wi-Fi/LAN can never reach these even though they pass the RFC1918 check —
// e.g. Windows often labels a VirtualBox Host-Only adapter generically (just
// "Ethernet"), so interface-name exclusion alone can't catch it.
const KNOWN_VIRTUAL_SUBNET_PREFIXES = [
  '192.168.56.', // VirtualBox Host-Only Network default
  '192.168.99.', // Docker Toolbox / docker-machine default
  '192.168.137.', // Windows Mobile Hotspot / Internet Connection Sharing default
];

function isKnownVirtualSubnet(ip) {
  return KNOWN_VIRTUAL_SUBNET_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

// Prefer 192.168.* (typical home Wi-Fi), then 10.*, then 172.16–31.* — lower rank wins.
function rankIp(ip) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  return 2;
}

function detectLanIp() {
  const candidates = [];
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || isExcludedIface(name)) continue;
    for (const addr of addrs) {
      // Node ≥18 reports family as the string 'IPv4'; older Node used the number 4.
      const isIPv4 = addr.family === 'IPv4' || addr.family === 4;
      if (!isIPv4 || addr.internal) continue;
      if (isCgnat(addr.address)) continue;
      if (isKnownVirtualSubnet(addr.address)) continue;
      if (!isRfc1918(addr.address)) continue;
      candidates.push(addr.address);
    }
  }
  candidates.sort((a, b) => rankIp(a) - rankIp(b));
  return candidates[0] ?? null;
}

const apiPort = Number(process.env.API_PORT ?? 3000);

let apiUrl;
if (process.env.EXPO_PUBLIC_API_URL) {
  // Respect an explicit override — lets a user force a value and skip detection.
  apiUrl = process.env.EXPO_PUBLIC_API_URL;
  process.stdout.write(`[dev-bypass] using EXPO_PUBLIC_API_URL from env: ${apiUrl}\n`);
} else {
  const ip = detectLanIp();
  if (ip) {
    apiUrl = `http://${ip}:${apiPort}`;
    process.stdout.write(`[dev-bypass] API for device: ${apiUrl}\n`);
  } else {
    process.stderr.write(
      `[dev-bypass] no LAN address detected — falling back to .env's EXPO_PUBLIC_API_URL. ` +
        `Auto-login will NOT work from a physical device (localhost resolves to the phone itself).\n`,
    );
  }
}

const freePort = await findFreePort();

// Expo's own dotenv load does NOT overwrite variables already set in process.env,
// so injecting EXPO_PUBLIC_API_URL here wins over the value in .env.
const child = spawn('expo', ['start', '--port', String(freePort)], {
  stdio: 'inherit',
  shell: true,
  env: apiUrl ? { ...process.env, EXPO_PUBLIC_API_URL: apiUrl } : process.env,
});

process.stdout.write(
  `[dev-bypass] no tunnel — Google OAuth and emailed magic links will not work in this mode. Use \`pnpm dev\` for those.\n`,
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => process.exit(code ?? 0));
