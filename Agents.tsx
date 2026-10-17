import { useEffect, useMemo, useState } from 'react';
import { useStore, setState, signedIn, toast } from '../state';
import { api, ApiError } from '../services/api';
import { refreshMe, startSignIn } from '../actions';
import { useAsync } from '../hooks';
import { PixelAgent } from '../components/PixelAgent';
import { AgentCard, SectionHead } from '../components/Cards';
import { DemoTag, Icon, LiveTag, Modal, StateBox, Tag, timeAgo } from '../components/ui';
import { CLASSES, EMOTES, FRAMES, GADGETS, NAME_RE, PALETTES, WEAPONS, statSummary, validateLoadout, type ClassId, type EmoteId, type FrameId, type GadgetId, type PaletteId, type WeaponId } from '../../shared/game';
import { levelFromXp } from '../../shared/progression';
import { DEMO_AGENTS } from '../services/demo';
import type { Agent } from '../../shared/types';
import type { Side } from '../../shared/engine';

interface Draft { name: string; classId: ClassId; weapon: WeaponId; gadget: GadgetId; palette: PaletteId; frame: FrameId; emote: EmoteId }
const blank = (): Draft => ({ name: '', classId: 'trooper', weapon: 'pulse_carbine', gadget: 'patch_kit', palette: 'violet', frame: 'none', emote: 'wave' });

export function AgentsPage() {
  const me = useStore((s) => s.me);
  const isIn = useStore(signedIn);
  const server = useStore((s) => s.server);
  const account = useStore((s) => s.account);
  const [editing, setEditing] = useState<Agent | 'new' | null>(null);
  const [retire, setRetire] = useState<Agent | null>(null);
  const featured = useAsync(() => api.featuredAgents(), [server], { enabled: server === 'online' });
  const level = me ? levelFromXp(me.xp).level : 1;
  useEffect(() => { if (isIn && me && me.agents.length === 0 && editing === null) setEditing('new'); }, [isIn, me, editing]);

  return (
    <div className="page">
      <SectionHead eyebrow="Agents" title="Meet the roster." accent="Build your fighter.">
        Every class is built on the same power budget. Levels unlock looks and sidegrades — never bigger numbers.
      </SectionHead>

      <section className="panel" aria-labelledby="roster-h">
        <div className="panel-head"><h2 id="roster-h" className="h3 display">Your agents</h2>{isIn ? <span className="small muted">{me!.agents.length}/3 slots · level {level}</span> : <Tag kind="muted">Sign in to save agents</Tag>}</div>
        {!isIn ? (
          <StateBox kind="empty" title="Your roster lives on your wallet" action={server === 'online' ? <button className="btn btn-primary btn-sm" onClick={() => (account ? startSignIn() : setState({ walletModal: true }))}>Connect & sign in</button> : undefined}>
            You can still design an agent below and try it in a demo match. Saving needs a signed-in wallet.
          </StateBox>
        ) : me!.agents.length === 0 ? (
          <StateBox kind="empty" title="No agents yet">Design your first fighter in the workshop below.</StateBox>
        ) : (
          <div className="agent-grid">
            {me!.agents.map((a, i) => (
              <AgentCard key={a.id} a={a} corner={i % 2 ? 'b' : 'a'} href={undefined} footer={
                <div className="card-actions">
                  {me!.activeAgentId === a.id ? <Tag kind="active">Active</Tag> : <button className="btn btn-ghost btn-xs" onClick={async () => { try { await api.updateMe({ activeAgentId: a.id }); refreshMe(); } catch (e) { toast((e as Error).message, 'error'); } }}>Set active</button>}
                  <button className="btn btn-ghost btn-xs" onClick={() => setEditing(a)}><Icon name="gear" size={13} />Edit</button>
                  <a className="btn btn-ghost btn-xs" href={`#/agent/${a.id}`}>Details</a>
                  <button className="btn btn-ghost btn-xs danger" onClick={() => setRetire(a)}>Retire</button>
                </div>
              } />
            ))}
            {me!.agents.length < 3 && <button className="agent-card add-card" onClick={() => setEditing('new')}><Icon name="star" size={28} /><span>New agent</span></button>}
          </div>
        )}
      </section>

      <Workshop key={editing === null ? 'free' : editing === 'new' ? 'new' : editing.id} editing={editing} level={level} onDone={() => setEditing(null)} />

      <section className="section-sm" aria-labelledby="feat-h">
        <div className="panel-head"><h2 id="feat-h" className="h3 display">Around the arena</h2>{featured.data?.length ? <LiveTag>Server</LiveTag> : <DemoTag>Sample agents</DemoTag>}</div>
        <div className="agent-grid">
          {(featured.data?.length ? featured.data : DEMO_AGENTS).slice(0, 8).map((a, i) => <AgentCard key={a.id} a={a} corner={i % 2 ? 'b' : 'a'} href={featured.data?.length ? `#/agent/${a.id}` : undefined} />)}
        </div>
      </section>

      <Modal open={!!retire} onClose={() => setRetire(null)} title={`Retire ${retire?.name}?`}>
        <p>This removes the agent from your roster. Your level, rating and match history stay. Matches it played remain viewable.</p>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setRetire(null)}>Keep it</button>
          <button className="btn btn-danger" onClick={async () => { try { await api.deleteAgent(retire!.id); toast(`${retire!.name} retired.`); refreshMe(); } catch (e) { toast((e as Error).message, 'error'); } setRetire(null); }}>Retire agent</button></div>
      </Modal>
    </div>
  );
}

function Workshop({ editing, level, onDone }: { editing: Agent | 'new' | null; level: number; onDone: () => void }) {
  const isIn = useStore(signedIn);
  const account = useStore((s) => s.account);
  const [d, setD] = useState<Draft>(() => (editing && editing !== 'new' ? { name: editing.name, classId: editing.classId, weapon: editing.weapon, gadget: editing.gadget, palette: editing.palette, frame: editing.frame, emote: editing.emote } : blank()));
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setServerErr(null); };
  const chooseClass = (c: ClassId) => set({ classId: c, weapon: CLASSES[c].weapons[0] });
  const err = validateLoadout(d, level);
  const nameErr = touched && !NAME_RE.test(d.name.trim()) ? 'Use 3–16 characters: letters, numbers, spaces, - or _.' : null;
  const stats = useMemo(() => statSummary(d), [d]);
  const w = WEAPONS[d.weapon];
  const isEdit = editing && editing !== 'new';

  const save = async () => {
    setSaving(true); setServerErr(null);
    try {
      const body = { ...d, name: d.name.trim() };
      const a = isEdit ? await api.updateAgent((editing as Agent).id, body) : await api.createAgent(body);
      toast(`${a.name} ${isEdit ? 'updated' : 'saved'} — ready for the arena.`, 'success');
      setConfirm(false); await refreshMe(); onDone();
      if (!isEdit) setD(blank());
    } catch (e) { setServerErr(e instanceof ApiError ? e.message : 'Could not save the agent.'); }
    finally { setSaving(false); }
  };

  return (
    <section id="workshop" className="panel workshop" aria-labelledby="ws-h">
      <div className="panel-head"><h2 id="ws-h" className="h3 display">{isEdit ? `Edit ${(editing as Agent).name}` : 'Agent workshop'}</h2>{editing && <button className="btn btn-ghost btn-xs" onClick={onDone}>Close</button>}</div>
      <div className="ws-grid">
        <form className="ws-form" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!err) setConfirm(true); }} noValidate>
          <label className="label" htmlFor="ag-name">Name</label>
          <input id="ag-name" className="input" value={d.name} maxLength={16} onBlur={() => setTouched(true)} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Brick Halo" aria-invalid={!!nameErr} aria-describedby="ag-name-help" autoComplete="off" />
          <p id="ag-name-help" className={nameErr ? 'form-error' : 'tiny muted'}>{nameErr ?? 'Must be unique across the arena.'}</p>

          <fieldset><legend className="label">Class</legend>
            <div className="choice-grid four">
              {(Object.keys(CLASSES) as ClassId[]).map((c) => (
                <label key={c} className={`choice ${d.classId === c ? 'on' : ''}`}>
                  <input type="radio" name="class" checked={d.classId === c} onChange={() => chooseClass(c)} />
                  <PixelAgent look={{ ...d, classId: c, weapon: CLASSES[c].weapons[0] }} size={52} />
                  <strong>{CLASSES[c].name}</strong><span className="tiny muted">{CLASSES[c].role} · {CLASSES[c].hp} HP</span>
                </label>
              ))}
            </div>
            <p className="tiny muted">{CLASSES[d.classId].blurb}</p>
          </fieldset>

          <fieldset><legend className="label">Weapon</legend>
            <div className="choice-grid two">
              {CLASSES[d.classId].weapons.map((wid) => { const wd = WEAPONS[wid]; const locked = wd.level > level; return (
                <label key={wid} className={`choice row ${d.weapon === wid ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                  <input type="radio" name="weapon" checked={d.weapon === wid} disabled={locked} onChange={() => set({ weapon: wid })} />
                  <span><strong>{wd.name}</strong>{locked && <Tag kind="muted">Lv {wd.level}</Tag>}<span className="tiny muted block">{wd.close} close · {wd.far} far · {wd.cost} energy · {Math.round(wd.crit * 100)}% crit</span><span className="tiny muted block">{wd.blurb}</span></span>
                </label>
              ); })}
            </div>
          </fieldset>

          <fieldset><legend className="label">Gadget (helmet badge)</legend>
            <div className="choice-grid three">
              {(Object.keys(GADGETS) as GadgetId[]).map((gid) => { const g = GADGETS[gid]; const locked = g.level > level; return (
                <label key={gid} className={`choice row ${d.gadget === gid ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                  <input type="radio" name="gadget" checked={d.gadget === gid} disabled={locked} onChange={() => set({ gadget: gid })} />
                  <span><i className="badge-dot" style={{ background: g.badge }} aria-hidden="true" /><strong>{g.name}</strong>{locked && <Tag kind="muted">Lv {g.level}</Tag>}<span className="tiny muted block">{g.blurb} {g.cost ? `${g.cost} energy` : 'free'} · {g.cooldown} rd cooldown</span></span>
                </label>
              ); })}
            </div>
          </fieldset>

          <fieldset><legend className="label">Palette</legend>
            <div className="swatches">
              {(Object.keys(PALETTES) as PaletteId[]).map((pid) => { const p = PALETTES[pid]; const locked = p.level > level; return (
                <label key={pid} className={`swatch ${d.palette === pid ? 'on' : ''} ${locked ? 'locked' : ''}`} title={locked ? `${p.name} — unlocks at level ${p.level}` : p.name}>
                  <input type="radio" name="palette" checked={d.palette === pid} disabled={locked} onChange={() => set({ palette: pid })} aria-label={`${p.name}${locked ? `, unlocks at level ${p.level}` : ''}`} />
                  <span style={{ background: `linear-gradient(135deg, ${p.H} 50%, ${p.S} 50%)` }} aria-hidden="true" />
                  {locked && <Icon name="lock" size={12} />}
                </label>
              ); })}
            </div>
          </fieldset>

          <div className="two-col">
            <label className="label">Profile frame
              <select className="input" value={d.frame} onChange={(e) => set({ frame: e.target.value as FrameId })}>
                {(Object.keys(FRAMES) as FrameId[]).map((f) => <option key={f} value={f} disabled={FRAMES[f].level > level}>{FRAMES[f].name}{FRAMES[f].level > level ? ` (Lv ${FRAMES[f].level})` : ''}</option>)}
              </select>
            </label>
            <label className="label">Emote
              <select className="input" value={d.emote} onChange={(e) => set({ emote: e.target.value as EmoteId })}>
                {(Object.keys(EMOTES) as EmoteId[]).map((x) => <option key={x} value={x} disabled={EMOTES[x].level > level}>{EMOTES[x].name} “{EMOTES[x].text}”{EMOTES[x].level > level ? ` (Lv ${EMOTES[x].level})` : ''}</option>)}
              </select>
            </label>
          </div>

          {touched && err && !nameErr && <p className="form-error" role="alert">{err}</p>}
          {serverErr && <p className="form-error" role="alert">{serverErr}</p>}
          <div className="ws-actions">
            {isIn ? <button className="btn btn-primary" type="submit">{isEdit ? 'Review changes' : 'Review & save'}</button>
              : <button className="btn btn-primary" type="button" onClick={() => (account ? startSignIn() : setState({ walletModal: true }))}>{account ? 'Sign in to save' : 'Connect wallet to save'}</button>}
            <a className="btn btn-ghost" href="#/arena">Try it in a demo</a>
          </div>
        </form>

        <aside className="ws-preview" aria-label="Preview">
          <div className={`ws-portrait frame-${d.frame}`}>
            <PixelAgent look={d} size={200} title={`Preview of ${d.name || 'your agent'}`} />
          </div>
          <h3 className="display h3 center">{d.name.trim() || 'Unnamed agent'}</h3>
          <p className="center mono small violet">{CLASSES[d.classId].name} · {w.name} · {GADGETS[d.gadget].name}</p>
          <div className="stat-list">
            {stats.map((s) => (
              <div key={s.k} className="stat-row">
                <span className="small">{s.k}</span>
                <span className="stat-pips" role="meter" aria-label={s.k} aria-valuemin={0} aria-valuemax={10} aria-valuenow={s.v}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < s.v ? 'on' : ''} />)}</span>
                <span className="tiny muted mono">{s.raw}</span>
              </div>
            ))}
          </div>
          <div className="arena-preview" aria-label="Arena preview">
            <span className="label">In the arena</span>
            <div className="mini-stage">
              <PixelAgent look={d} corner="a" size={84} />
              <span className="vs-mini" aria-hidden="true">VS</span>
              <PixelAgent look={{ classId: 'heavy', weapon: 'scatter_cannon', gadget: 'aegis', palette: 'cyan' }} corner="b" size={84} flip />
            </div>
            <p className="tiny muted">Your corner glows violet or cyan depending on which side you're placed. Stats never scale with level or $AVA.</p>
          </div>
        </aside>
      </div>

      <Modal open={confirm} onClose={() => !saving && setConfirm(false)} title={isEdit ? 'Save changes?' : 'Save this agent?'} dismissable={!saving}>
        <div className="confirm-agent">
          <PixelAgent look={d} size={96} />
          <dl className="kv small">
            <div><dt>Name</dt><dd>{d.name.trim()}</dd></div>
            <div><dt>Class</dt><dd>{CLASSES[d.classId].name}</dd></div>
            <div><dt>Weapon</dt><dd>{w.name}</dd></div>
            <div><dt>Gadget</dt><dd>{GADGETS[d.gadget].name}</dd></div>
            <div><dt>Palette</dt><dd>{PALETTES[d.palette].name}</dd></div>
          </dl>
        </div>
        <p className="small">This saves your agent to the game server under your wallet. <strong>Nothing is minted, no transaction is sent and no tokens are used.</strong> You can edit or retire it any time.</p>
        {serverErr && <p className="form-error" role="alert">{serverErr}</p>}
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setConfirm(false)} disabled={saving}>Back</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><span className="spinner sm" aria-hidden="true" />Saving…</> : 'Confirm & save'}</button></div>
      </Modal>
    </section>
  );
}

export function AgentDetailPage({ id }: { id: string }) {
  const server = useStore((s) => s.server);
  const { data, error, loading } = useAsync(() => api.agent(id), [id], { enabled: server === 'online' });
  if (server === 'offline') return <div className="page"><StateBox kind="offline" title="Agent pages need the game server" /></div>;
  if (loading) return <div className="page"><StateBox kind="loading" title="Loading agent…" /></div>;
  if (error || !data) return <div className="page"><StateBox kind="error" title="Agent not found">{error}</StateBox></div>;
  const a = data.agent, games = a.wins + a.losses + a.draws;
  return (
    <div className="page">
      <div className="agent-hero panel">
        <div className={`ws-portrait frame-${a.frame}`}><PixelAgent look={a} size={220} title={a.name} /></div>
        <div>
          <p className="eyebrow">Agent · {CLASSES[a.classId].role}</p>
          <h1 className="display h2">{a.name}</h1>
          <p className="mono violet">{CLASSES[a.classId].name} · {WEAPONS[a.weapon].name} · {GADGETS[a.gadget].name}</p>
          {data.owner && <p className="small">Owned by <a href={`#/player/${data.owner.wallet}`}>{data.owner.name}</a> · level {data.owner.level} · rating {data.owner.season.rating}</p>}
          <p className="small"><span className="up">{a.wins} wins</span> · <span className="down">{a.losses} losses</span> · {a.draws} draws{games ? ` · ${Math.round((a.wins / games) * 100)}% win rate` : ''}</p>
          <div className="stat-list">{statSummary(a).map((s) => <div key={s.k} className="stat-row"><span className="small">{s.k}</span><span className="stat-pips" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < s.v ? 'on' : ''} />)}</span><span className="tiny muted mono">{s.raw}</span></div>)}</div>
        </div>
      </div>
      <section className="panel section-sm" aria-labelledby="am-h">
        <div className="panel-head"><h2 id="am-h" className="h3 display">Recent matches</h2></div>
        {data.matches.length === 0 ? <StateBox kind="empty" title="No matches yet" /> : (
          <ul className="match-list">{data.matches.map((m) => { const side: Side = m.players.a.agent.id === a.id ? 'a' : 'b'; const res = m.winner === 'draw' ? 'Draw' : m.winner === side ? 'Win' : 'Loss'; const opp = m.players[side === 'a' ? 'b' : 'a']; return (
            <li key={m.id}><a href={`#/match/${m.id}`}><span className={`mono tiny ${res === 'Win' ? 'up' : res === 'Loss' ? 'down' : ''}`}>{res}</span><span>vs {opp.agent.name} <span className="muted small">({opp.name})</span></span><span className="small muted">{m.endReason} · {timeAgo(m.endedAt)}</span></a></li>
          ); })}</ul>
        )}
      </section>
    </div>
  );
}
