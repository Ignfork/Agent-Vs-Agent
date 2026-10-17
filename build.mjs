// Client build with esbuild. `node scripts/build.mjs` for production,
// `node scripts/build.mjs --watch` during development.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const watch = process.argv.includes('--watch');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist');
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

// Use the maintained @wallet-standard/app package when installed; otherwise
// fall back to the protocol-compatible local implementation.
const alias = {};
try { createRequire(import.meta.url).resolve('@wallet-standard/app'); }
catch { alias['@wallet-standard/app'] = path.join(root, 'src/wallet/wallet-standard-app-shim.ts'); console.warn('[build] @wallet-standard/app not installed — using built-in shim (run npm install).'); }

function copyStatic() {
  fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
  for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(out, f));
}

const options = {
  entryPoints: { app: path.join(root, 'src/main.tsx') },
  outdir: path.join(out, 'assets'),
  bundle: true, format: 'esm', target: ['es2020'], jsx: 'automatic',
  sourcemap: watch ? 'inline' : true, minify: !watch, alias,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
  plugins: [{ name: 'static', setup(b) { b.onEnd(() => copyStatic()); } }]
};

if (watch) { const ctx = await esbuild.context(options); await ctx.watch(); console.log('[build] watching src/ …'); }
else { await esbuild.build(options); console.log('[build] done → dist/'); }
