import { spawn } from 'node:child_process';

const child = spawn('tsx', ['watch', 'src/index.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEV_AUTO_LOGIN: 'true' },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => process.exit(code ?? 0));
