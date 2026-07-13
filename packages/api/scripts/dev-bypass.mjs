import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';

// `shell: true` is required so the `tsx.CMD` shim resolves on Windows; on POSIX
// it means `child.kill()` alone only signals the shell, leaving `tsx watch`
// orphaned. Run the child in its own process group there and kill the group.
const child = spawn('tsx', ['watch', 'src/index.ts'], {
  stdio: 'inherit',
  shell: true,
  detached: !isWindows,
  env: { ...process.env, DEV_AUTO_LOGIN: 'true' },
});

function shutdown(signal) {
  if (isWindows || !child.pid) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

child.on('exit', (code) => process.exit(code ?? 0));
