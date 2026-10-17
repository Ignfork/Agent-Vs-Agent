// Match page: spectate a live match, or replay and audit a finished one.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state';
import { spectate, stopSpectating } from '../actions';
import { api } from '../services/api';
import { useAsync } from '../hooks';
import { ArenaView } from '../components/Arena';
import { Icon, LiveTag, StateBox, Tag } from '../components/ui';
import { replay, initMatch, type Side } from '../../shared/engine';
import { snapshotOf } from '../services/demo';
import type { MatchRecord } from '../../shared/types';
import { navigate } from '../router';

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
const lo = (f: MatchRecord['players']['a']) => ({ classId: f.agent.classId, weapon: f.agent.weapon, gadget: f.agent.gadget, palette: f.agent.palette, name: f.agent.name });

export function MatchPage({ id }: { id: string }) {
  const server = useStore((s) => s.server);
  const myMatch = useStore((s) => s.match);
  const live = useAsync(() => api.liveMatches(), [id, server], { enabled: server === 'online' });
  const [forceReplay, setForceReplay] = useState(false);
  useEffect(() => setForceReplay(false), [id]);
  const isLive = !forceReplay && !!live.data?.some((m) => m.id === id);
  useEffect(() => { if (myMatch?.id === id && myMatch.phase !== 'ended') navigate('/arena'); }, [myMatch, id]);
  if (server === 'offline') return <div className="page"><StateBox kind="offline" title="Match history needs the game server">Matches are stored on the server, which isn't reachable right now.</StateBox></div>;
  if (live.loading && !live.data) return <div className="page"><StateBox kind="loading" title="Loading match…" /></div>;
  return isLive ? <Spectate id={id} onReplay={() => { stopSpectating(); setForceReplay(true); }} /> : <Replay id={id} />;
}

function Spectate({ id, onReplay }: { id: string; onReplay: () => void }) {
  const snap = useStore((s) => s.spectate);
  const last = useStore((s) => s.spectateRound);
  const emote = useStore((s) => s.emote);
  const socket = useStore((s) => s.socket);
  useEffect(() => { if (socket === 'open') spectate(id); }, [id, socket]);
  useEffect(() => () => stopSpectating(), []);
  if (!snap || !snap.players) return <div className="page"><StateBox kind="loading" title="Joining as a spectator…" /></div>;
  return (
    <div className="page">
      <div className="page-head-row"><p className="eyebrow"><LiveTag>Spectating</LiveTag> Live match · actions are revealed only after each round resolves</p><a className="btn btn-ghost btn-sm" href="#/arena">Back to arena</a></div>
      <ArenaView mode="spectate" snap={{ ...snap, you: undefined }} lastRound={last} emote={emote} />
      {snap.phase === 'ended' && <p className="small"><button className="btn btn-primary btn-sm" onClick={onReplay}>Open the full replay and verification</button></p>}
    </div>
  );
}

function Replay({ id }: { id: string }) {
  const { data: rec, error, loading } = useAsync(() => api.match(id), [id]);
  const [step, setStep] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [verify, setVerify] = useState<{ commit: boolean; replay: boolean } | null>(null);
  useEffect(() => { if (rec) setStep(rec.turns.length); }, [rec]);
  useEffect(() => {
    if (!rec) return;
    (async () => {
      const commit = (await sha256Hex(rec.seed)) === rec.seedCommit;
      const r = replay(rec.seed, lo(rec.players.a), lo(rec.players.b), rec.turns);
      setVerify({ commit, replay: r.f.a.hp === rec.finalHp.a && r.f.b.hp === rec.finalHp.b && (rec.endReason === 'abandon' || rec.endReason === 'forfeit' || r.winner === rec.winner) });
    })();
  }, [rec]);
  useEffect(() => {
    if (!playing || !rec) return;
    const t = setInterval(() => setStep((s) => { if (s >= rec.turns.length) { setPlaying(false); return s; } return s + 1; }), 1200);
    return () => clearInterval(t);
  }, [playing, rec]);

  const view = useMemo(() => {
    if (!rec || step < 0) return null;
    const st = step === 0 ? initMatch(rec.seed, lo(rec.players.a), lo(rec.players.b)) : replay(rec.seed, lo(rec.players.a), lo(rec.players.b), rec.turns.slice(0, step));
    const final = step >= rec.turns.length;
    const snap = snapshotOf(st, rec.players, { id: rec.id, season: rec.season, seedCommit: rec.seedCommit, seed: rec.seed, phase: final ? 'ended' : 'active', winner: final ? rec.winner : null, endReason: final ? rec.endReason : null, startedAt: rec.startedAt });
    const last = step > 0 ? { result: st.rounds[st.rounds.length - 1], seq: step } : null;
    return { snap, last };
  }, [rec, step]);

  if (loading) return <div className="page"><StateBox kind="loading" title="Loading match record…" /></div>;
  if (error || !rec) return <div className="page"><StateBox kind="error" title="Match not found">{error ?? 'This match does not exist.'} Live matches appear here once they end.</StateBox></div>;
  const winnerName = rec.winner === 'draw' ? 'Draw' : rec.players[rec.winner as Side].agent.name;
  return (
    <div className="page">
      <div className="page-head-row">
        <div>
          <p className="eyebrow">Match {rec.id} · {new Date(rec.endedAt).toLocaleString()} · {rec.mode}</p>
          <h1 className="display h2">{rec.players.a.agent.name} <span className="muted">vs</span> <span className="cyan">{rec.players.b.agent.name}</span></h1>
          <p className="small">Result: <strong>{winnerName}</strong> · {rec.endReason} · {rec.rounds.length} rounds</p>
        </div>
        <a className="btn btn-ghost btn-sm" href="#/arena">Back to arena</a>
      </div>

      <div className="replay-controls" role="group" aria-label="Replay controls">
        <button className="btn btn-ghost btn-sm" onClick={() => { setPlaying(false); setStep(0); }} aria-label="Go to start">⏮</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} aria-label="Previous round">◀</button>
        <button className="btn btn-primary btn-sm" onClick={() => { if (step >= rec.turns.length) setStep(0); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setPlaying(false); setStep((s) => Math.min(rec.turns.length, s + 1)); }} aria-label="Next round">▶</button>
        <label className="replay-slider"><span className="sr-only">Round</span>
          <input type="range" min={0} max={rec.turns.length} value={Math.max(0, step)} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} />
        </label>
        <span className="mono small">{Math.max(0, step)}/{rec.turns.length}</span>
      </div>

      {view && <ArenaView mode="replay" snap={view.snap} lastRound={view.last} />}

      <div className="split section-sm">
        <section className="panel" aria-labelledby="audit-h">
          <div className="panel-head"><h2 id="audit-h" className="h3 display">Audit</h2>{verify ? (verify.commit && verify.replay ? <Tag kind="active">Verified in your browser</Tag> : <Tag kind="demo">Mismatch</Tag>) : <Tag kind="muted">Checking…</Tag>}</div>
          <ul className="check-list small">
            <li><Icon name={verify?.commit ? 'check' : 'alert'} size={15} />SHA-256(seed) equals the commitment published when the match started</li>
            <li><Icon name={verify?.replay ? 'check' : 'alert'} size={15} />Re-running the combat engine with this seed and the action log reproduces the final HP</li>
          </ul>
          <dl className="kv small">
            <div><dt>Commitment</dt><dd className="mono break">{rec.seedCommit}</dd></div>
            <div><dt>Seed</dt><dd className="mono break">{rec.seed}</dd></div>
          </dl>
          <p className="tiny muted">The commitment is shown to both players before round 1, so the server can't pick a seed after seeing your moves. Rolls are derived from (seed, round, side, roll type) — see <code>shared/engine.ts</code>.</p>
        </section>
        <section className="panel" aria-labelledby="res-h">
          <div className="panel-head"><h2 id="res-h" className="h3 display">Rewards</h2></div>
          {(['a', 'b'] as Side[]).map((s) => (
            <div key={s} className="reward-block">
              <strong><a href={`#/player/${rec.players[s].wallet}`}>{rec.players[s].name}</a></strong> <span className="small muted">with {rec.players[s].agent.name}</span>
              <span className={`small ${rec.ratingDelta[s] >= 0 ? 'up' : 'down'}`}> · rating {rec.ratingDelta[s] >= 0 ? '+' : ''}{rec.ratingDelta[s]}</span>
              <ul className="xp-lines">{rec.xp[s].map((l, i) => <li key={i}><span>{l.reason}</span><b>+{l.xp}</b></li>)}</ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
