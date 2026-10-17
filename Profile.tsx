import { useState, type FormEvent } from 'react';
import { useStore, setState, signedIn, toast } from '../state';
import { api, ApiError } from '../services/api';
import { refreshMe, startSignIn } from '../actions';
import { useAsync } from '../hooks';
import { PixelAgent } from '../components/PixelAgent';
import { AgentCard } from '../components/Cards';
import { Bar, CopyButton, Icon, LiveTag, StateBox, Tag, timeAgo } from '../components/ui';
import { FRAMES, NAME_RE, type FrameId } from '../../shared/game';
import { UNLOCKS, levelFromXp } from '../../shared/progression';
import { shortAddr } from '../../shared/base58';
import type { Agent, MatchRecord, PlayerPublic } from '../../shared/types';
import type { Side } from '../../shared/engine';

export function ProfilePage({ wallet }: { wallet?: string }) {
  const me = useStore((s) => s.me);
  const isIn = useStore(signedIn);
  const server = useStore((s) => s.server);
  const account = useStore((s) => s.account);
  const v = useStore((s) => s.dataVersion);
  const target = wallet ?? me?.wallet;
  const own = !!me && target === me.wallet;
  const pub = useAsync(() => api.player(target!), [target, v], { enabled: server === 'online' && !!target });

  if (server === 'offline') return <div className="page"><StateBox kind="offline" title="Profiles need the game server" /></div>;
  if (!wallet && !isIn) return <div className="page"><StateBox kind="empty" title="Sign in to see your profile" action={<button className="btn btn-primary btn-sm" onClick={() => (account ? startSignIn() : setState({ walletModal: true }))}>{account ? 'Sign in' : 'Connect wallet'}</button>}>Your profile shows your agents, level, rating, unlocks and every reward you've earned.</StateBox></div>;
  if (pub.loading && !pub.data) return <div className="page"><StateBox kind="loading" title="Loading profile…" /></div>;
  if (pub.error || !pub.data) return <div className="page"><StateBox kind="error" title="Player not found">{pub.error}</StateBox></div>;
  const { player, agents, online, matches } = pub.data;
  return (
    <div className="page">
      <Header player={player} own={own} online={online} agents={agents} />
      <div className="split section-sm">
        <section className="panel" aria-labelledby="pa-h">
          <div className="panel-head"><h2 id="pa-h" className="h3 display">Agents</h2>{own && <a className="btn btn-ghost btn-xs" href="#/agents">Workshop</a>}</div>
          {agents.length === 0 ? <StateBox kind="empty" title="No agents yet" /> : <div className="agent-grid two">{agents.map((a, i) => <AgentCard key={a.id} a={a} corner={i % 2 ? 'b' : 'a'} href={`#/agent/${a.id}`} />)}</div>}
        </section>
        <Matches matches={matches} wallet={player.wallet} />
      </div>
      {own && me && (
        <div className="split section-sm">
          <section className="panel" aria-labelledby="rw-h">
            <div className="panel-head"><h2 id="rw-h" className="h3 display">Rewards</h2><span className="small muted">every XP grant, with its reason</span></div>
            {me.rewards.length === 0 ? <StateBox kind="empty" title="No rewards yet">Finish a match — win or lose — to earn XP.</StateBox> : (
              <ul className="reward-list">
                {me.rewards.map((r) => (
                  <li key={r.matchId + r.at}>
                    <div className="reward-top"><a href={`#/match/${r.matchId}`} className="mono tiny">{r.matchId}</a><span className="tiny muted">{timeAgo(r.at)}</span><strong className="violet">+{r.total} XP</strong></div>
                    <ul className="xp-lines">{r.lines.map((l, i) => <li key={i}><span>{l.reason}</span><b>+{l.xp}</b></li>)}</ul>
                    {r.levelUps.length > 0 && <span className="pill-lime">Reached level {r.levelUps.join(', ')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Unlocks xp={me.xp} />
        </div>
      )}
    </div>
  );
}

function Header({ player, own, online, agents }: { player: PlayerPublic; own: boolean; online: boolean; agents: Agent[] }) {
  const lv = levelFromXp(player.xp);
  const active = agents.find((a) => a.id === player.activeAgentId) ?? agents[0];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [err, setErr] = useState<string | null>(null);
  const s = player.season;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!NAME_RE.test(name.trim())) return setErr('3–16 characters: letters, numbers, spaces, - or _.');
    try { await api.updateMe({ name: name.trim() }); await refreshMe(); setEditing(false); toast('Name updated.', 'success'); setState((x) => ({ dataVersion: x.dataVersion + 1 })); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : 'Could not update name.'); }
  };
  const setFrame = async (f: FrameId) => { try { await api.updateMe({ frame: f }); await refreshMe(); setState((x) => ({ dataVersion: x.dataVersion + 1 })); } catch (e) { toast((e as Error).message, 'error'); } };
  return (
    <section className="profile-head panel">
      <div className={`ws-portrait frame-${player.frame}`}>{active ? <PixelAgent look={active} size={150} /> : <Icon name="user" size={60} />}</div>
      <div className="profile-main">
        <p className="eyebrow">{own ? 'Your profile' : 'Player'} {online ? <LiveTag>Online</LiveTag> : <Tag kind="muted">Offline</Tag>}</p>
        {editing ? (
          <form onSubmit={save} className="input-row" noValidate>
            <label htmlFor="pname" className="sr-only">Display name</label>
            <input id="pname" className="input" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} maxLength={16} aria-invalid={!!err} aria-describedby="pname-err" />
            <button className="btn btn-primary btn-sm" type="submit">Save</button><button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : <h1 className="display h2">{player.name} {own && <button className="link-btn small" onClick={() => setEditing(true)}>edit</button>}</h1>}
        {err && <p id="pname-err" className="form-error" role="alert">{err}</p>}
        <p className="mono small muted">{shortAddr(player.wallet)} <CopyButton text={player.wallet} label="Copy address" /></p>
        <div className="profile-stats">
          <div><span className="label">Level</span><strong>{lv.level}</strong></div>
          <div><span className="label">Rating</span><strong>{s.rating}</strong></div>
          <div><span className="label">Record</span><strong><span className="up">{s.wins}</span>-<span className="down">{s.losses}</span>-{s.draws}</strong></div>
          <div><span className="label">Win rate</span><strong>{s.games ? Math.round((s.wins / s.games) * 100) : 0}%</strong></div>
        </div>
        <Bar kind="xp" value={lv.into} max={lv.need} label="XP to next level" />
        <p className="tiny muted">{lv.need - lv.into} XP to level {lv.level + 1}</p>
        {own && (
          <label className="label inline">Profile frame
            <select className="input input-sm" value={player.frame} onChange={(e) => setFrame(e.target.value as FrameId)}>
              {(Object.keys(FRAMES) as FrameId[]).map((f) => <option key={f} value={f} disabled={FRAMES[f].level > lv.level}>{FRAMES[f].name}{FRAMES[f].level > lv.level ? ` (Lv ${FRAMES[f].level})` : ''}</option>)}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}

function Matches({ matches, wallet }: { matches: MatchRecord[]; wallet: string }) {
  return (
    <section className="panel" aria-labelledby="pm-h">
      <div className="panel-head"><h2 id="pm-h" className="h3 display">Match history</h2></div>
      {matches.length === 0 ? <StateBox kind="empty" title="No matches yet" /> : (
        <ul className="match-list">
          {matches.map((m) => {
            const side: Side = m.players.a.wallet === wallet ? 'a' : 'b'; const opp = m.players[side === 'a' ? 'b' : 'a'];
            const res = m.winner === 'draw' ? 'Draw' : m.winner === side ? 'Win' : 'Loss';
            return (
              <li key={m.id}><a href={`#/match/${m.id}`}>
                <span className={`mono tiny ${res === 'Win' ? 'up' : res === 'Loss' ? 'down' : ''}`}>{res}</span>
                <span>{m.players[side].agent.name} vs {opp.agent.name} <span className="small muted">({opp.name})</span></span>
                <span className="small muted">{m.ratingDelta[side] >= 0 ? '+' : ''}{m.ratingDelta[side]} · {m.rounds.length}r · {timeAgo(m.endedAt)}</span>
              </a></li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Unlocks({ xp }: { xp: number }) {
  const lv = levelFromXp(xp).level;
  return (
    <section className="panel" aria-labelledby="ul-h">
      <div className="panel-head"><h2 id="ul-h" className="h3 display">Unlocks</h2><span className="small muted">cosmetics & sidegrades only</span></div>
      <ul className="unlock-list">
        {UNLOCKS.filter((u) => u.level > 1).map((u) => (
          <li key={u.kind + u.id} className={u.level <= lv ? 'got' : ''}>
            <Icon name={u.level <= lv ? 'check' : 'lock'} size={14} /><span>{u.name}</span><span className="tiny muted">Lv {u.level}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
