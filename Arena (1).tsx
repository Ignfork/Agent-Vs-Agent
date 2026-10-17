import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore, setState, signedIn } from '../state';
import { cancelChallenge, forfeit, joinQueue, leaveFinishedMatch, leaveQueue, readyUp, requestRematch, respondChallenge, retryServer, sendAction, sendChallenge, sendEmote, startSignIn } from '../actions';
import { ArenaView } from '../components/Arena';
import { PixelAgent } from '../components/PixelAgent';
import { DemoTag, Icon, LiveTag, StateBox, Tag, secsLeft, timeAgo, useNow } from '../components/ui';
import { SectionHead } from '../components/Cards';
import { DEMO_AGENTS, DemoMatch, demoFighter } from '../services/demo';
import { api } from '../services/api';
import { useAsync } from '../hooks';
import { CLASSES, NAME_RE, WEAPONS, type ActionId } from '../../shared/game';
import { isSolanaAddress, shortAddr } from '../../shared/base58';
import { levelFromXp } from '../../shared/progression';
import type { Side } from '../../shared/engine';
import type { RoundResult } from '../../shared/engine';
import type { Agent } from '../../shared/types';

function useDemo() {
  const ref = useRef<DemoMatch | null>(null);
  const [tick, setTick] = useState(0);
  const [last, setLast] = useState<{ result: RoundResult; seq: number } | null>(null);
  const start = (mine: { name: string; classId: any; weapon: any; gadget: any; palette: any; id?: string }) => {
    const bot = DEMO_AGENTS.filter((a) => a.name !== mine.name)[Math.floor(Math.random() * 7)];
    ref.current = new DemoMatch({ a: demoFighter('Practice', mine as any), b: demoFighter('Local bot', bot) });
    setLast(null); setTick((t) => t + 1);
  };
  const act = (a: ActionId) => { if (!ref.current || ref.current.state.over) return; const r = ref.current.play(a); setLast({ result: r, seq: Date.now() }); setTick((t) => t + 1); };
  const quit = () => { ref.current = null; setLast(null); setTick((t) => t + 1); };
  return { m: ref.current, tick, last, start, act, quit };
}

export function ArenaPage() {
  const match = useStore((s) => s.match);
  const lastRound = useStore((s) => s.lastRound);
  const endInfo = useStore((s) => s.endInfo);
  const rematch = useStore((s) => s.rematch);
  const emote = useStore((s) => s.emote);
  const me = useStore((s) => s.me);
  const demo = useDemo();
  const level = me ? levelFromXp(me.xp).level : 1;

  if (match && match.phase !== 'cancelled') {
    return (
      <div className="page">
        <div className="page-head-row">
          <p className="eyebrow"><LiveTag>Live PvP</LiveTag> {match.mode === 'challenge' ? 'Direct challenge' : match.mode === 'rematch' ? 'Rematch' : 'Ranked queue'} · {match.season}</p>
        </div>
        <ArenaView mode="live" snap={match} lastRound={lastRound} endInfo={endInfo} rematch={rematch} emote={emote} myLevel={level}
          onReady={readyUp} onAction={sendAction} onForfeit={forfeit} onEmote={sendEmote} onRematch={requestRematch} onLeave={leaveFinishedMatch} />
      </div>
    );
  }
  if (demo.m) {
    return (
      <div className="page">
        <div className="demo-banner" role="note"><DemoTag>Demo mode</DemoTag> You're fighting a bot running in your browser. This is not live PvP — no rating, XP or wallet involved.</div>
        <ArenaView mode="demo" snap={demo.m.snapshot('a')} lastRound={demo.last} onAction={demo.act} onForfeit={demo.quit} onRematch={() => demo.start(demo.m!.players.a.agent)} onLeave={demo.quit} />
      </div>
    );
  }
  return <Lobby onDemo={demo.start} />;
}

function Lobby({ onDemo }: { onDemo: (a: any) => void }) {
  const server = useStore((s) => s.server);
  const account = useStore((s) => s.account);
  const me = useStore((s) => s.me);
  const isIn = useStore(signedIn);
  const socket = useStore((s) => s.socket);
  const [agentId, setAgentId] = useState<string | null>(null);
  useEffect(() => { if (me && !agentId) setAgentId(me.activeAgentId ?? me.agents[0]?.id ?? null); }, [me, agentId]);
  const agents = me?.agents ?? [];

  return (
    <div className="page">
      <SectionHead eyebrow="Arena" title="Queue up or" accent="call someone out.">
        Matches are refereed by the game server: both players pick an action each round, the server resolves it, and every match publishes a seed you can audit afterwards.
      </SectionHead>
      <div className="arena-lobby">
        <section className="panel" aria-labelledby="play-h">
          <div className="panel-head"><h2 id="play-h" className="h3 display">Play online</h2>{server === 'online' ? <LiveTag>Live PvP</LiveTag> : <Tag kind="muted">Unavailable</Tag>}</div>
          {server === 'offline' ? (
            <StateBox kind="offline" title="Game server unreachable" action={<button className="btn btn-ghost btn-sm" onClick={retryServer}><Icon name="refresh" size={14} />Retry</button>}>
              Online matchmaking needs the Agent VS Agent server. You can still play the demo against a local bot. We never simulate online opponents.
            </StateBox>
          ) : !account ? (
            <StateBox kind="empty" title="Connect a wallet to play online" action={<button className="btn btn-primary btn-sm" onClick={() => setState({ walletModal: true })}>Connect wallet</button>}>Your wallet is your player identity. Connecting doesn't sign anything or stake any tokens.</StateBox>
          ) : !isIn ? (
            <StateBox kind="empty" title="Sign in to queue" action={<button className="btn btn-lime btn-sm" onClick={startSignIn}>Sign in</button>}>Sign a free message so the server knows this wallet is yours. No transaction.</StateBox>
          ) : agents.length === 0 ? (
            <StateBox kind="empty" title="You need an agent first" action={<a className="btn btn-primary btn-sm" href="#/agents">Build an agent</a>}>Pick a class, weapon and gadget in the workshop — it takes a minute.</StateBox>
          ) : (
            <>
              <fieldset className="agent-pick">
                <legend className="label">Fight as</legend>
                {agents.map((a) => (
                  <label key={a.id} className={`agent-radio ${agentId === a.id ? 'on' : ''}`}>
                    <input type="radio" name="agent" value={a.id} checked={agentId === a.id} onChange={() => setAgentId(a.id)} />
                    <PixelAgent look={a} size={44} />
                    <span><strong>{a.name}</strong><span className="tiny muted block">{CLASSES[a.classId].name} · {WEAPONS[a.weapon].name}</span></span>
                  </label>
                ))}
              </fieldset>
              {socket !== 'open' && <p className="small warn-text" role="status"><span className="spinner sm" aria-hidden="true" /> Connecting to the arena…</p>}
              <QueuePanel agentId={agentId} />
              <ChallengePanel agentId={agentId} agents={agents} />
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="demo-h">
          <div className="panel-head"><h2 id="demo-h" className="h3 display">Practice</h2><DemoTag>Demo · local bot</DemoTag></div>
          <p className="small muted">Learn the combat loop against a bot that runs entirely in your browser. No wallet, no rating, no XP — and it's never shown as a real opponent.</p>
          <div className="demo-picks">
            {(agents.length ? agents : DEMO_AGENTS.slice(0, 4)).map((a) => (
              <button key={a.id} className="demo-pick" onClick={() => onDemo(a)}>
                <PixelAgent look={a} size={52} />
                <span><strong>{a.name}</strong><span className="tiny muted block">{CLASSES[a.classId].name}</span></span>
                <Icon name="play" size={16} />
              </button>
            ))}
          </div>
          <Rules />
        </section>
      </div>
      <LiveAndRecent />
    </div>
  );
}

function QueuePanel({ agentId }: { agentId: string | null }) {
  const q = useStore((s) => s.queue);
  const socket = useStore((s) => s.socket);
  return (
    <div className="queue-box" aria-live="polite">
      {q?.inQueue ? (
        <>
          <div className="queue-anim" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <strong>Searching for an opponent…</strong>
            <p className="small muted">Waited {q.waitSec}s · {q.queued} in queue · rating window {q.window < 0 ? 'open to anyone' : `±${q.window}`}</p>
            <p className="tiny muted">We pair the closest rating first and widen the window the longer you wait. After 90s, anyone can be matched.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={leaveQueue}>Leave queue</button>
        </>
      ) : (
        <>
          <div><strong>Rated queue</strong><p className="small muted">Matched by rating. Free to enter — nothing is staked.</p></div>
          <button className="btn btn-primary" disabled={!agentId || socket !== 'open'} onClick={() => agentId && joinQueue(agentId)}><Icon name="sword" size={16} />Find a match</button>
        </>
      )}
    </div>
  );
}

function ChallengePanel({ agentId, agents }: { agentId: string | null; agents: Agent[] }) {
  const incoming = useStore((s) => s.incoming);
  const outgoing = useStore((s) => s.outgoing);
  const socket = useStore((s) => s.socket);
  const now = useNow(1000);
  const [target, setTarget] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [acceptAs, setAcceptAs] = useState<string>('');
  useEffect(() => { if (!acceptAs && agentId) setAcceptAs(agentId); }, [agentId, acceptAs]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = target.trim();
    if (!t) return setErr('Enter a player name or wallet address.');
    if (!isSolanaAddress(t) && !NAME_RE.test(t)) return setErr("That doesn't look like a player name or a Solana address.");
    if (!agentId) return setErr('Pick an agent first.');
    setErr(null); sendChallenge(t, agentId);
  };
  return (
    <div className="challenge-box">
      <form onSubmit={submit} noValidate>
        <label htmlFor="ch-target" className="label">Direct challenge</label>
        <div className="input-row">
          <input id="ch-target" className="input" value={target} onChange={(e) => { setTarget(e.target.value); setErr(null); }} placeholder="Player name or wallet address" aria-invalid={!!err} aria-describedby="ch-help" autoComplete="off" spellCheck={false} />
          <button className="btn btn-ghost" type="submit" disabled={socket !== 'open' || !!outgoing}>Challenge</button>
        </div>
        <p id="ch-help" className={err ? 'form-error' : 'tiny muted'} role={err ? 'alert' : undefined}>{err ?? 'They must be online. Challenges are rated like queue matches and expire after 60 seconds.'}</p>
      </form>
      {outgoing && (
        <div className="challenge-item" role="status">
          <span>Waiting for <strong>{outgoing.to.name}</strong> · {secsLeft(outgoing.expiresAt, now)}s</span>
          <button className="btn btn-ghost btn-xs" onClick={() => cancelChallenge(outgoing.id)}>Cancel</button>
        </div>
      )}
      {incoming.length > 0 && (
        <div className="incoming">
          <span className="label">Incoming challenges</span>
          {agents.length > 1 && (
            <label className="tiny muted">Accept as{' '}
              <select className="input input-sm" value={acceptAs} onChange={(e) => setAcceptAs(e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
          )}
          {incoming.map((c) => (
            <div key={c.id} className="challenge-item">
              <span><strong>{c.from.name}</strong> <span className="tiny muted">({c.from.rating}) with {c.agentName} · {secsLeft(c.expiresAt, now)}s</span></span>
              <span className="row-gap">
                <button className="btn btn-lime btn-xs" onClick={() => respondChallenge(c.id, true, acceptAs || agentId || undefined)}>Accept</button>
                <button className="btn btn-ghost btn-xs" onClick={() => respondChallenge(c.id, false)}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Rules() {
  return (
    <details className="rules">
      <summary>How a round works</summary>
      <ul className="small">
        <li><strong>Simultaneous turns.</strong> Both players lock in one action per round (20s). No pick = Defend.</li>
        <li><strong>Attack</strong> deals weapon damage for the current range, ±10%, with a crit chance (×1.6).</li>
        <li><strong>Defend</strong> blocks 50–65% (by class) and restores 15 extra energy.</li>
        <li><strong>Gadget</strong> has an energy cost and a cooldown (3–5 rounds).</li>
        <li><strong>Move</strong> switches close ⇄ far before shots land. If both move, range stays.</li>
        <li>Energy regenerates 18 per round (max 100). KO wins; after 14 rounds, higher HP % wins.</li>
        <li>Disconnected? You have 45s to return; your turns auto-Defend meanwhile. Stay away longer and you forfeit.</li>
      </ul>
    </details>
  );
}

function LiveAndRecent() {
  const server = useStore((s) => s.server);
  const v = useStore((s) => s.dataVersion);
  const live = useAsync(() => api.liveMatches(), [server], { enabled: server === 'online', pollMs: 5000 });
  const recent = useAsync(() => api.recentMatches(), [server, v], { enabled: server === 'online', pollMs: 15000 });
  if (server !== 'online') return null;
  return (
    <div className="split section-sm">
      <section className="panel" aria-labelledby="lv-h">
        <div className="panel-head"><h2 id="lv-h" className="h3 display">Live now</h2><LiveTag /></div>
        {live.loading && !live.data ? <StateBox kind="loading" title="Loading…" /> : !live.data?.length ? <StateBox kind="empty" title="No matches in progress" /> : (
          <ul className="match-list">
            {live.data.map((m) => (
              <li key={m.id}><a href={`#/match/${m.id}`}>
                <span className="mono tiny">{m.phase === 'ready' ? 'ready check' : `R${m.round}`}</span>
                <span>{m.players.a.agent.name} <span className="muted">vs</span> {m.players.b.agent.name}</span>
                <span className="small violet">Watch <Icon name="eye" size={13} /></span>
              </a></li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel" aria-labelledby="rc-h">
        <div className="panel-head"><h2 id="rc-h" className="h3 display">Recent results</h2><LiveTag>Server</LiveTag></div>
        {recent.loading && !recent.data ? <StateBox kind="loading" title="Loading…" /> : !recent.data?.length ? <StateBox kind="empty" title="No finished matches yet" /> : (
          <ul className="match-list">
            {recent.data.map((m) => {
              const w = m.winner === 'draw' ? null : m.players[m.winner as Side];
              return (
                <li key={m.id}><a href={`#/match/${m.id}`}>
                  <span className="mono tiny">{timeAgo(m.endedAt)}</span>
                  <span>{m.players.a.agent.name} <span className="muted">vs</span> {m.players.b.agent.name}</span>
                  <span className="small">{w ? <><span className="up">{w.agent.name}</span> · {m.endReason}</> : 'draw'} · {m.roundCount}r</span>
                </a></li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
export { shortAddr };
