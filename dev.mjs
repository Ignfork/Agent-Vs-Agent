// `npm run dev`: rebuilds the client on change and restarts the server on change.
import { spawn } from 'node:child_process';
const run = (args, name) => {
  const p = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => { console.log(`[${name}] exited (${code})`); process.exit(code ?? 0); });
  return p;
};
const procs = [run(['scripts/build.mjs', '--watch'], 'client'), run(['--import', 'tsx', '--watch', 'server/index.ts'], 'server')];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
