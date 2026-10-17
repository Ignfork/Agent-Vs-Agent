// Fallback implementation of `getWallets()` from @wallet-standard/app.
// The build only uses this file if the real package isn't installed (for
// example in an offline sandbox). It implements the same Wallet Standard
// registration protocol: listen for `wallet-standard:register-wallet` and
// announce `wallet-standard:app-ready`.
type Listener = (...wallets: any[]) => void;
let api: { get(): readonly any[]; on(ev: 'register' | 'unregister', l: Listener): () => void; register(...w: any[]): () => void } | null = null;

export function getWallets() {
  if (api) return api;
  const registered = new Set<any>();
  const listeners: Record<'register' | 'unregister', Set<Listener>> = { register: new Set(), unregister: new Set() };
  const register = (...wallets: any[]) => {
    const added = wallets.filter((w) => !registered.has(w));
    added.forEach((w) => registered.add(w));
    if (added.length) listeners.register.forEach((l) => l(...added));
    return () => { added.forEach((w) => registered.delete(w)); listeners.unregister.forEach((l) => l(...added)); };
  };
  api = {
    get: () => [...registered],
    on(ev, l) { listeners[ev].add(l); return () => listeners[ev].delete(l); },
    register
  };
  const appApi = Object.freeze({ register });
  if (typeof window !== 'undefined') {
    window.addEventListener('wallet-standard:register-wallet', (e: Event) => { try { (e as CustomEvent).detail(appApi); } catch (err) { console.error(err); } });
    try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: appApi })); } catch (err) { console.error(err); }
  }
  return api;
}
