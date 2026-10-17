import { useEffect, useRef, useState } from 'react';
import { useRoute, type Route } from './router';
import { useStore } from './state';
import { NetworkBadge, SignInDialog, WalletControl, WalletModal } from './components/Wallet';
import { Icon } from './components/ui';
import { Home } from './pages/Home';
import { ArenaPage } from './pages/Arena';
import { AgentDetailPage, AgentsPage } from './pages/Agents';
import { LeaderboardPage } from './pages/Leaderboard';
import { UtilityPage } from './pages/Utility';
import { HowPage } from './pages/How';
import { ProfilePage } from './pages/Profile';
import { MatchPage } from './pages/Match';
import { readyUp } from './actions';

const NAV: { href: string; label: string; match: Route['name'][] }[] = [
  { href: '#/arena', label: 'Arena', match: ['arena', 'match'] },
  { href: '#/agents', label: 'Agents', match: ['agents', 'agent'] },
  { href: '#/leaderboard', label: 'Leaderboard', match: ['leaderboard', 'player'] },
  { href: '#/utility', label: '$AVA Utility', match: ['utility'] },
  { href: '#/how', label: 'How it works', match: ['how'] }
];

function Logo() {
  return (
    <a href="#/" className="logo" aria-label="Agent VS Agent home">
      <svg width="30" height="30" viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="1" y="1" width="3" height="1" fill="#9b7bff" /><rect x="0" y="2" width="4" height="3" fill="#9b7bff" /><rect x="1" y="3" width="1" height="1" fill="#0b0f22" /><rect x="0" y="5" width="4" height="3" fill="#3a3f72" />
        <rect x="6" y="1" width="3" height="1" fill="#35d9ee" /><rect x="6" y="2" width="4" height="3" fill="#35d9ee" /><rect x="8" y="3" width="1" height="1" fill="#0b0f22" /><rect x="6" y="5" width="4" height="3" fill="#27486a" />
        <rect x="4.5" y="4" width="1" height="1" fill="#b6f24a" />
      </svg>
      <span className="logo-text">AGENT<span className="logo-vs">VS</span>AGENT</span>
      <span className="ticker">$AVA</span>
    </a>
  );
}

function Header({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  return (
    <header className="site-header">
      <div className="header-in">
        <Logo />
        <nav aria-label="Main" className={`main-nav ${open ? 'open' : ''}`} id="main-nav">
          {NAV.map((n) => <a key={n.href} href={n.href} className={n.match.includes(route.name) ? 'on' : ''} aria-current={n.match.includes(route.name) ? 'page' : undefined}>{n.label}</a>)}
        </nav>
        <div className="header-right">
          <NetworkBadge />
          <WalletControl />
          <button className="icon-btn menu-toggle" aria-label="Menu" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} /></button>
        </div>
      </div>
    </header>
  );
}

/** Topographic contour background, generated once with marching squares. */
function Topo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 1400, H = 900, step = 10; c.width = W; c.height = H;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const f = (x: number, y: number) => Math.sin(x * 0.006) * Math.cos(y * 0.007) + 0.6 * Math.sin((x + y) * 0.004 + 1.3) + 0.35 * Math.cos(x * 0.013 - y * 0.009) + 0.2 * Math.sin(Math.hypot(x - 900, y - 300) * 0.02);
    const cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1;
    const v = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) v[j * cols + i] = f(i * step, j * step);
    ctx.lineWidth = 1;
    for (let lvl = -1.8; lvl <= 1.8; lvl += 0.18) {
      ctx.strokeStyle = `rgba(${lvl > 0 ? '155,123,255' : '53,217,238'}, ${0.05 + Math.abs(lvl) * 0.012})`;
      ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = v[j * cols + i], b = v[j * cols + i + 1], cc = v[(j + 1) * cols + i + 1], d = v[(j + 1) * cols + i];
        const idx = (a > lvl ? 8 : 0) | (b > lvl ? 4 : 0) | (cc > lvl ? 2 : 0) | (d > lvl ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * step, y = j * step;
        const lerp = (p: number, q: number) => (lvl - p) / (q - p || 1e-6);
        const T: [number, number] = [x + step * lerp(a, b), y], R: [number, number] = [x + step, y + step * lerp(b, cc)], B: [number, number] = [x + step * lerp(d, cc), y + step], L: [number, number] = [x, y + step * lerp(a, d)];
        const seg = (p: [number, number], q: [number, number]) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(L, B); break; case 2: case 13: seg(B, R); break; case 3: case 12: seg(L, R); break; case 4: case 11: seg(T, R); break;
          case 5: seg(L, T); seg(B, R); break; case 6: case 9: seg(T, B); break; case 7: case 8: seg(L, T); break; case 10: seg(T, R); seg(L, B); break;
        }
      }
      ctx.stroke();
    }
  }, []);
  return <canvas ref={ref} className="topo" aria-hidden="true" />;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>{t.text}</div>)}
    </div>
  );
}

function MatchBanner({ route }: { route: Route }) {
  const match = useStore((s) => s.match);
  const incoming = useStore((s) => s.incoming);
  if (route.name === 'arena') return null;
  if (match && (match.phase === 'ready' || match.phase === 'active')) {
    return (
      <div className="match-banner" role="status">
        <span className="pulse-dot" aria-hidden="true" />
        <strong>{match.phase === 'ready' ? 'Match found!' : 'Your match is live'}</strong>
        <span className="small">vs {match.players[match.you === 'a' ? 'b' : 'a'].name}</span>
        {match.phase === 'ready' && match.you && !match.ready[match.you] && <button className="btn btn-lime btn-xs" onClick={readyUp}>Ready</button>}
        <a className="btn btn-primary btn-xs" href="#/arena">Go to arena</a>
      </div>
    );
  }
  if (incoming.length) return <div className="match-banner" role="status"><strong>{incoming[0].from.name}</strong> challenged you <a className="btn btn-primary btn-xs" href="#/arena">Respond</a></div>;
  return null;
}

export function App() {
  const route = useRoute();
  let page;
  switch (route.name) {
    case 'home': page = <Home />; break;
    case 'arena': page = <ArenaPage />; break;
    case 'agents': page = <AgentsPage />; break;
    case 'agent': page = <AgentDetailPage id={route.id} />; break;
    case 'leaderboard': page = <LeaderboardPage />; break;
    case 'utility': page = <UtilityPage />; break;
    case 'how': page = <HowPage />; break;
    case 'profile': page = <ProfilePage />; break;
    case 'player': page = <ProfilePage wallet={route.wallet} />; break;
    case 'match': page = <MatchPage id={route.id} />; break;
    default: page = <div className="page"><h1 className="display h2">Lost in the arena</h1><p><a href="#/">Back home</a></p></div>;
  }
  return (
    <>
      <Topo />
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <Header route={route} />
      <MatchBanner route={route} />
      <main id="main" tabIndex={-1}>{page}</main>
      <footer className="site-footer">
        <div className="footer-in">
          <span className="small">Agent VS Agent · <span className="mono">$AVA</span> · a skill-based PvP game on Solana</span>
          <span className="tiny muted">No wagering. No financial advice. $AVA is optional and confers no gameplay advantage. Labels show what is live and what is demo.</span>
        </div>
      </footer>
      <Toasts />
      <WalletModal />
      <SignInDialog />
    </>
  );
}
