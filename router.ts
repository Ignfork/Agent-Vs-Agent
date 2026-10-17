// Hash router: works on any static host and behind the Node server.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' } | { name: 'arena' } | { name: 'agents' } | { name: 'agent'; id: string }
  | { name: 'leaderboard' } | { name: 'utility' } | { name: 'how' } | { name: 'profile' }
  | { name: 'player'; wallet: string } | { name: 'match'; id: string } | { name: 'notfound' };

export function parse(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  switch (p[0]) {
    case undefined: return { name: 'home' };
    case 'arena': return { name: 'arena' };
    case 'agents': return { name: 'agents' };
    case 'agent': return p[1] ? { name: 'agent', id: decodeURIComponent(p[1]) } : { name: 'agents' };
    case 'leaderboard': return { name: 'leaderboard' };
    case 'utility': return { name: 'utility' };
    case 'how': return { name: 'how' };
    case 'profile': return { name: 'profile' };
    case 'player': return p[1] ? { name: 'player', wallet: decodeURIComponent(p[1]) } : { name: 'leaderboard' };
    case 'match': return p[1] ? { name: 'match', id: decodeURIComponent(p[1]) } : { name: 'arena' };
    default: return { name: 'notfound' };
  }
}
export const navigate = (to: string) => { window.location.hash = to.startsWith('#') ? to : `#${to}`; };
export function useRoute(): Route {
  const [r, setR] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => { setR(parse(window.location.hash)); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
