import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 3001;

const child = spawn('nuxt', ['dev', '--host', host, '--port', String(port)], {
  shell: true,
  stdio: 'inherit',
  cwd:   new URL('..', import.meta.url),
  env:   process.env,
});

child.on('exit', (code, signal) => {
  if (signal != null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
