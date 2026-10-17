import { useEffect, useRef, useState } from 'react';
import { useStore, setState } from '../state';
import { api } from '../services/api';
import { DEMO_AGENTS, DemoMatch, demoFighter, demoLeaderboard } from '../services/demo';
import { useAsync, usePrefersReducedMotion } from '../hooks';
import { PixelAgent } from '../components/PixelAgent';
import { AgentCard, LeaderTable, SectionHead } from '../components/Cards';
import { Bar, DemoTag, Icon, LiveTag, StateBox, Tag } from '../components/ui';
import { CLASSES, RULES } from '../../shared/game';
import { botAction, type RoundResult, type Side } from '../../shared/engine';
import { retryServer, startSignIn } from '../actions';
import { navigate } from '../router';
import { utilities } from '../services/token';

/** Bot-vs-bot exhibition used for the hero. Always labelled as demo. */
function VersusStage() {
  const reduced = usePrefersReducedMotion();
  const [pair, setPair] = useState(0);
  const make = (i: number) => new DemoMatch({ a: demoFighter('demo bot', DEMO_AGENTS[(i * 2) % 8]), b: demoFighter('demo bot', DEMO_AGENTS[(i * 2 + 1) % 8]) });
  const m = useRef(make(0));
  const [, force] = useState(0);
  const [last, setLast] = useState<RoundResult | null>(null);
  const step = () => {
    const cur = m.current;
    if (cur.state.over) { const n = pair + 1; setPair(n); m.current = make(n); setLast(null); force((x) => x + 1); return; }
    const r = cur.play(botAction(cur.state, 'a', Math.random), botAction(cur.state, 'b', Math.random));
    setLast(r); force((x) => x + 1);
  };
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(step, m.current.state.over ? 2600 : 1500);
    return () => clearInterval(t);
  });
  const s = m.current.state, P = m.current.players;
  const hitOn = (side: Side) => last?.events.some((e) => e.type === 'attack' && e.side !== side && (e.dmg ?? 0) > 0);
  const atk = (side: Side) => last?.actions[side] === 'attack';
  const lastText = last?.events.filter((e) => e.type !== 'info').slice(-1)[0]?.text;
  return (
    <div className="vs-stage hud-frame" aria-label="Demo exhibition match between two bots">
      <div className="vs-top"><DemoTag>Demo exhibition · bots</DemoTag><span className="mono tiny muted">round {Math.min(s.round, RULES.maxRounds)} · {s.range}</span></div>
      <div className={`vs-arena range-${s.range}`} key={pair}>
        {(['a', 'b'] as Side[]).map((side) => (
          <div key={side} className={`vs-fighter corner-${side} ${atk(side) ? 'atk' : ''} ${hitOn(side) ? 'hit' : ''} ${s.f[side].hp <= 0 ? 'ko' : ''}`}>
            <PixelAgent look={P[side].agent} corner={side} size={148} flip={side === 'b'} title={`${P[side].agent.name}, ${CLASSES[P[side].agent.classId].name}`} />
            <div className="vs-name">{P[side].agent.name}</div>
            <div className="vs-class mono tiny">{CLASSES[P[side].agent.classId].name}</div>
            <Bar kind="hp" value={s.f[side].hp} max={s.f[side].maxHp} label={`${P[side].agent.name} health`} showText={false} />
            <Bar kind="energy" value={s.f[side].energy} max={RULES.maxEnergy} label={`${P[side].agent.name} energy`} showText={false} />
          </div>
        ))}
        <div className="vs-word" aria-hidden="true">VS</div>
        {last && atk('a') && <span className="shot shot-ltr" key={`a${s.round}`} aria-hidden="true" />}
        {last && atk('b') && <span className="shot shot-rtl" key={`b${s.round}`} aria-hidden="true" />}
      </div>
      <div className="vs-ticker mono small" aria-live="off">{s.over ? `${s.winner === 'draw' ? 'Draw' : P[s.winner as Side].agent.name + ' wins'} · next bout loading…` : lastText ?? 'Both bots pick actions at the same time…'}</div>
      {reduced && <button className="btn btn-ghost btn-sm" onClick={step}>Play next round</button>}
    </div>
  );
}

function StatusPanel() {
  const server = useStore((s) => s.server);
  const cfg = useStore((s) => s.config);
  const { data } = useAsync(() => api.status(), [server], { enabled: server === 'online', pollMs: 8000 });
  const live = server === 'online' && data;
  const row = (k: string, v: React.ReactNode) => <div className="status-row"><dt>{k}</dt><dd>{v}</dd></div>;
  return (
    <div className="status-panel hud-frame" aria-label="Network and game status">
      <div className="status-head"><span className="label">Status</span>{server === 'online' ? <LiveTag>Live server</LiveTag> : server === 'checking' ? <Tag kind="muted">Checking…</Tag> : <DemoTag>Offline · demo</DemoTag>}</div>
      <dl>
        {row('Network', <span className="mono">solana {cfg?.network ?? 'devnet'}</span>)}
        {row('Game server', server === 'online' ? <span className="ok-text">online</span> : server === 'checking' ? '…' : <span className="warn-text">unreachable <button className="link-btn" onClick={retryServer}>retry</button></span>)}
        {row('Players online', live ? data.online : '—')}
        {row('Live matches', live ? data.live : '—')}
        {row('In queue', live ? data.queued : '—')}
        {row('Season', cfg?.season.name ?? 'Season 1 · Static Bloom')}
        {row('$AVA mint', cfg?.avaMint ? <span className="mono">{cfg.avaMint.slice(0, 4)}…{cfg.avaMint.slice(-4)}</span> : <Tag kind="preview">not configured</Tag>)}
      </dl>
    </div>
  );
}

function LiveArenaPreview() {
  const server = useStore((s) => s.server);
  const { data, loading, error } = useAsync(() => api.liveMatches(), [server], { enabled: server === 'online', pollMs: 5000 });
  if (server !== 'online') return <StateBox kind="offline" title="Live arena unavailable">The game server isn't reachable, so live PvP matches can't be shown. Try a demo match against a local bot instead.<div style={{ marginTop: 10 }}><a className="btn btn-ghost btn-sm" href="#/arena">Open demo arena</a></div></StateBox>;
  if (loading && !data) return <StateBox kind="loading" title="Looking for live matches…" />;
  if (error) return <StateBox kind="error" title="Couldn't load live matches">{error}</StateBox>;
  if (!data?.length) return <StateBox kind="empty" title="No live matches right now">Be the first in the arena — queue up and anyone else in the queue gets matched against you.<div style={{ marginTop: 10 }}><a className="btn btn-primary btn-sm" href="#/arena">Enter the arena</a></div></StateBox>;
  return (
    <div className="live-grid">
      {data.slice(0, 6).map((m) => (
        <a key={m.id} className="live-card" href={`#/match/${m.id}`}>
          <div className="live-card-top"><LiveTag>{m.phase === 'ready' ? 'Starting' : `Round ${m.round}`}</LiveTag><span className="tiny muted">{m.spectators} watching</span></div>
          <div className="live-card-row">
            {(['a', 'b'] as Side[]).map((s) => (
              <div key={s} className="live-side">
                <PixelAgent look={m.players[s].agent} corner={s} size={56} flip={s === 'b'} />
                <strong className="small">{m.players[s].agent.name}</strong>
                <span className="tiny muted">{m.players[s].name}</span>
                <Bar kind="hp" value={m.players[s].hp} max={m.players[s].maxHp} label="health" showText={false} />
              </div>
            ))}
          </div>
          <span className="small violet">Watch <Icon name="eye" size={14} /></span>
        </a>
      ))}
    </div>
  );
}

export function Home() {
  const server = useStore((s) => s.server);
  const account = useStore((s) => s.account);
  const me = useStore((s) => s.me);
  const cfg = useStore((s) => s.config);
  const featured = useAsync(() => api.featuredAgents(), [server], { enabled: server === 'online' });
  const board = useAsync(() => api.leaderboard(cfg?.season.id ?? 's1'), [server, cfg?.season.id], { enabled: server === 'online' });
  const liveAgents = featured.data && featured.data.length > 0;
  const liveBoard = board.data && board.data.length > 0;
  const primary = () => { if (!account) setState({ walletModal: true }); else if (!me && server === 'online') startSignIn(); else navigate('/arena'); };

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="sq" aria-hidden="true" />{cfg?.season.name ?? 'Season 1'} / Solana {cfg?.network ?? 'devnet'} / $AVA</p>
          <h1 className="display h1">Build your agent.<br /><span className="violet">Enter the arena.</span></h1>
          <p className="lede">Agent VS Agent is a pixel-combat PvP game on Solana. Design a fighter, take on other wallets in server-refereed duels, earn XP every match, and climb the season ladder. No staking, no wagers — just skill.</p>
          <div className="cta-row">
            <button className="btn btn-primary btn-lg" onClick={primary}><Icon name="wallet" />{!account ? 'Connect wallet' : !me ? 'Sign in to play' : 'Enter the arena'}</button>
            <button className="btn btn-ghost btn-lg" onClick={() => document.getElementById('live')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}><Icon name="eye" />Watch live battles</button>
          </div>
          <ul className="hero-points small">
            <li><Icon name="check" size={14} />Free to play — no token needed for combat</li>
            <li><Icon name="check" size={14} />Every match has an auditable seed</li>
            <li><Icon name="check" size={14} />Try a demo match without a wallet</li>
          </ul>
        </div>
        <div className="hero-side">
          <VersusStage />
          <StatusPanel />
        </div>
      </section>

      <section id="live" className="section" aria-labelledby="live-h">
        <SectionHead eyebrow="01 // Arena" title="Live in the" accent="arena." action={<a className="btn btn-ghost" href="#/arena">Open arena <Icon name="chevron" size={14} /></a>}>
          Real matches between connected players, resolved round by round on the server. Click any match to spectate.
        </SectionHead>
        <h3 id="live-h" className="sr-only">Live matches</h3>
        <LiveArenaPreview />
      </section>

      <section className="section" aria-labelledby="agents-h">
        <SectionHead eyebrow="02 // Agents" title="Featured" accent="agents." action={<a className="btn btn-ghost" href="#/agents">Agent workshop <Icon name="chevron" size={14} /></a>}>
          Four classes, each with a primary weapon and a sidegrade, plus a gadget badge on the helmet. {liveAgents ? <LiveTag>From the server</LiveTag> : <DemoTag>Sample agents</DemoTag>}
        </SectionHead>
        <h3 id="agents-h" className="sr-only">Featured agents</h3>
        <div className="agent-grid">
          {(liveAgents ? featured.data!.slice(0, 4) : DEMO_AGENTS.slice(0, 4)).map((a, i) => <AgentCard key={a.id} a={a} index={i} corner={i % 2 ? 'b' : 'a'} href={liveAgents ? `#/agent/${a.id}` : undefined} />)}
        </div>
      </section>

      <section className="section split" aria-labelledby="board-h">
        <div>
          <SectionHead eyebrow="03 // Season" title="Season" accent="leaderboard." action={<a className="btn btn-ghost" href="#/leaderboard">Full board <Icon name="chevron" size={14} /></a>}>
            Elo-style rating. Everyone starts at 1000 each season. {liveBoard ? <LiveTag>Live</LiveTag> : <DemoTag>{server === 'online' ? 'Sample — no ranked matches yet' : 'Sample data'}</DemoTag>}
          </SectionHead>
          <h3 id="board-h" className="sr-only">Top players</h3>
          <LeaderTable compact rows={(liveBoard ? board.data! : demoLeaderboard('s1')).slice(0, 6)} highlight={me?.wallet} link={!!liveBoard} />
        </div>
        <div className="ava-teaser hud-frame">
          <p className="eyebrow">04 // $AVA</p>
          <h3 className="display h3">What $AVA is for</h3>
          <p className="small muted">$AVA is optional. It unlocks looks, not power. Every utility below shows its status and exactly what transaction (if any) it needs.</p>
          <ul className="util-mini">
            {utilities(cfg).map((u) => <li key={u.id}><span>{u.title}</span><Tag kind={u.status}>{u.status}</Tag></li>)}
          </ul>
          <a className="btn btn-ghost btn-sm" href="#/utility">See $AVA utility</a>
        </div>
      </section>

      <section className="section" aria-labelledby="how-h">
        <SectionHead eyebrow="05 // How it works" title="From wallet to" accent="leaderboard." />
        <h3 id="how-h" className="sr-only">Steps</h3>
        <ol className="steps">
          {[
            ['Connect & sign in', 'Connect a Solana wallet and sign a free message. No transaction, no fee.'],
            ['Build an agent', 'Pick a class, weapon, gadget and palette. Preview it before you save.'],
            ['Queue or challenge', 'Join the rated queue or challenge a player by name or wallet.'],
            ['Fight & progress', 'Win or lose, every finished match earns XP. Wins move your rating.'],
            ['Use $AVA (optional)', 'Cosmetic unlocks and community votes — never combat stats.']
          ].map(([t, d], i) => <li key={t} className="step"><span className="step-n mono">{String(i + 1).padStart(2, '0')}</span><strong>{t}</strong><span className="small muted">{d}</span></li>)}
        </ol>
        <p><a href="#/how" className="violet">Read the full guide and FAQ →</a></p>
      </section>
    </>
  );
}
