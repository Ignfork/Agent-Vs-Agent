import { config } from './config';
import { loadStore, flushStore } from './store';
import { createHttpServer } from './http';
import { attachArena } from './arena';

loadStore();
const server = createHttpServer();
attachArena(server);
server.listen(config.port, () => {
  console.log(`\n  Agent VS Agent server on http://localhost:${config.port}`);
  console.log(`  network: ${config.network} · rpc: ${config.rpcUrl}`);
  console.log(`  $AVA mint: ${config.avaMint ?? 'not configured (token features shown as preview)'}`);
  console.log(`  season: ${config.season.name}\n`);
});
const shutdown = () => { try { flushStore(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
