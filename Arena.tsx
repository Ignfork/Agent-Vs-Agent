// Arena HUD: used for live PvP, spectating, local demo matches and replays.
import { useEffect, useMemo, useState } from 'react';
import { ACTIONS, CLASSES, EMOTES, GADGETS, RULES, WEAPONS, type ActionId, type EmoteId } from '../../shared/game';
import { legalActions, initMatch, type MatchState, type RoundResult, type Side } from '../../shared/engine';
import type { MatchSnapshot, PublicFighter } from '../../shared/types';
import type { EndInfo } from '../state';
import { levelFromXp } from '../../shared/progression';
import { PixelAgent } from './PixelAgent';
import { Bar, Icon, Modal, Tag, secsLeft, useNow } from './ui';
import { shortAddr } from '../../shared/base58';

export type ArenaMode = 'live' | 'spectate' | 'demo' | 'replay';
interface Props {
  snap: MatchSnapshot; lastRound?: { result: RoundResult; seq: number } | null; mode: ArenaMode;
  endInfo?: EndInfo | null; rematch?: Record<Side, boolean>; emote?: { side: Side; emote: EmoteId; at: number } | null;
  myLevel?: number;
  onAction?: (a: ActionId) => void; onReady?: () => void; onForfeit?: () => void; onRematch?: () => void; onEmote?: (e: EmoteId) => void; onLeave?: () => void;
}

const reasonText: Record<string, string> = { ko: 'Knockout', rounds: `Decided on remaining HP after ${RULES.maxRounds} rounds`, forfeit: 'Forfeit', abandon: 'Opponent left and did not return' };

type Anim = { atk?: boolean; hit?: boolean; crit?: boolean; evade?: boolean; def?: boolean; heal?: boolean; gadget?: boolean; dmg?: number; healAmt?: number };
function animFrom(r: RoundResult): Record<Side, Anim> {
  const out: Record<Side, Anim> = { a: {}, b: {} };
  for (const s of ['a', 'b'] as Side[]) {
    if (r.actions[s] === 'attack') out[s].atk = true;
    if (r.actions[s] === 'defend') out[s].def = true;
    if (r.actions[s] === 'gadget') out[s].gadget = true;
  }
  for (const e of r.events) {
    const target: Side = e.side === 'a' ? 'b' : 'a';
    if (e.type === 'attack') { out[target].hit = (e.dmg ?? 0) > 0; out[target].dmg = (out[target].dmg ?? 0) + (e.dmg ?? 0); if (e.crit) out[target].crit = true; }
    if (e.type === 'evade') out[e.side].evade = true;
    if (e.type === 'gadget' && e.heal) { out[e.side].heal = true; out[e.side].healAmt = e.heal; }
  }
  return out;
}

export function ArenaView(p: Props) {
  const { snap, mode } = p;
  const now = useNow(250);
  const you = snap.you;
  const left: Side = you ?? 'a', right: Side = left === 'a' ? 'b' : 'a';
  const [anim, setAnim] = useState<Record<Side, Anim> | null>(null);
  const [prevHp, setPrevHp] = useState<Record<Side, number>>({ a: snap.f.a.hp, b: snap.f.b.hp });
  useEffect(() => {
    if (!p.lastRound) return;
    setAnim(animFrom(p.lastRound.result));
    const t = setTimeout(() => { setAnim(null); setPrevHp({ a: snap.f.a.hp, b: snap.f.b.hp }); }, 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.lastRound?.seq]);

  const stateForLegal = useMemo<MatchState>(() => ({ ...initMatch(snap.seed ?? 'x', lo(snap.players.a), lo(snap.players.b)), f: snap.f, round: snap.round, range: snap.range, over: snap.phase !== 'active' }), [snap]);
  const legal = you ? legalActions(stateForLegal, you) : null;
  const latest = snap.rounds[snap.rounds.length - 1];
  const secs = secsLeft(snap.deadline, now);
  const showEmote = p.emote && now - p.emote.at < 2600 ? p.emote : null;

  return (
    <section className={`arena mode-${mode} range-${snap.range}`} aria-label="Arena">
      <div className="hud-top">
        <div className="hud-chip"><span className="label">Round</span> <strong>{Math.min(snap.round, RULES.maxRounds)}</strong><span className="dim">/{RULES.maxRounds}</span></div>
        <div className="range-ind" aria-label={`Range: ${snap.range}`}>
          <span className={snap.range === 'close' ? 'on' : ''}>Close</span>
          <span className="range-track" aria-hidden="true"><i /></span>
          <span className={snap.range === 'far' ? 'on' : ''}>Far</span>
        </div>
        <div className="hud-right">
          {mode === 'demo' && <Tag kind="demo">Demo · local bot · not live PvP</Tag>}
          {mode === 'spectate' && <Tag kind="live">Spectating{snap.spectators ? ` · ${snap.spectators} watching` : ''}</Tag>}
          {mode === 'replay' && <Tag kind="muted">Replay</Tag>}
          {(mode === 'live' || mode === 'spectate') && snap.phase === 'active' && snap.deadline && (
            <div className={`timer ${secs <= 5 ? 'low' : ''}`} aria-label={`${secs} seconds left this round`}><Icon name="bolt" size={14} />{secs}s</div>
          )}
        </div>
      </div>

      <div className="fighters-hud">
        <FighterHud snap={snap} side={left} now={now} isYou={!!you} />
        <div className="vs-mini" aria-hidden="true">VS</div>
        <FighterHud snap={snap} side={right} now={now} alignRight />
      </div>

      <div className="stage">
        <div className="stage-floor" aria-hidden="true" />
        <FighterSprite f={snap.players[left]} side={left} anim={anim?.[left]} flip={false} emote={showEmote?.side === left ? showEmote.emote : null} ko={snap.f[left].hp <= 0} />
        {anim && (anim[left].atk || anim[right].atk) && (
          <>
            {anim[left].atk && <span className="shot shot-ltr" aria-hidden="true" />}
            {anim[right].atk && <span className="shot shot-rtl" aria-hidden="true" />}
          </>
        )}
        <FighterSprite f={snap.players[right]} side={right} anim={anim?.[right]} flip emote={showEmote?.side === right ? showEmote.emote : null} ko={snap.f[right].hp <= 0} />

        {snap.phase === 'ready' && <ReadyCard snap={snap} now={now} onReady={p.onReady} mode={mode} />}
        {snap.phase === 'cancelled' && <div className="stage-card"><h3 className="display">Match cancelled</h3><p className="muted">This match never started.</p></div>}
      </div>

      {snap.phase === 'ended' && <EndCard {...p} left={left} />}
      {mode === 'live' && snap.phase === 'active' && you && legal && (
        <ActionBar snap={snap} you={you} legal={legal} onAction={p.onAction} onEmote={p.onEmote} onForfeit={p.onForfeit} myLevel={p.myLevel ?? 1} secs={secs} />
      )}
      {mode === 'demo' && snap.phase === 'active' && legal && <ActionBar snap={snap} you="a" legal={legal} onAction={p.onAction} onForfeit={p.onForfeit} myLevel={1} secs={0} demo />}

      <div className="sr-only" aria-live="polite">{latest ? `Round ${latest.round}: ${latest.events.map((e) => e.text).join(' ')}` : ''}</div>
      <CombatLog snap={snap} left={left} />

    </section>
  );
}

const lo = (f: PublicFighter) => ({ classId: f.agent.classId, weapon: f.agent.weapon, gadget: f.agent.gadget, palette: f.agent.palette, name: f.agent.name });

function FighterHud({ snap, side, now, isYou, alignRight }: { snap: MatchSnapshot; side: Side; now: number; isYou?: boolean; alignRight?: boolean }) {
  const pl = snap.players[side], f = snap.f[side];
  const g = GADGETS[pl.agent.gadget];
  const grace = snap.graceUntil[side];
  return (
    <div className={`fighter-hud corner-${side} ${alignRight ? 'right' : ''}`}>
      <div className="fh-name">
        <strong>{pl.agent.name}</strong>
        <span className="small muted">{pl.name}{pl.wallet !== 'demo' && pl.rating ? ` · ${pl.rating}` : ''}{isYou ? ' · you' : ''}</span>
      </div>
      <Bar kind="hp" value={f.hp} max={f.maxHp} label={`${pl.agent.name} health`} />
      <Bar kind="energy" value={f.energy} max={RULES.maxEnergy} label={`${pl.agent.name} energy`} />
      <div className="fh-status small">
        <span title={g.blurb}><i className="badge-dot" style={{ background: g.badge }} aria-hidden="true" />{g.name}{f.cooldown > 0 ? ` · ${f.cooldown} rd cooldown` : ' · ready'}</span>
        {f.shield > 0 && <span className="pill-cyan">Shield {f.shield}</span>}
        {f.mirageRounds > 0 && <span className="pill-violet">Mirage</span>}
        {f.blinkBonus && <span className="pill-gold">+25% next</span>}
        {snap.phase === 'active' && snap.mode !== undefined && snap.id !== 'demo' && (snap.locked[side] ? <span className="pill-lime">Locked in</span> : <span className="muted">choosing…</span>)}
        {!snap.connected[side] && <span className="pill-red">Disconnected{grace ? ` · ${secsLeft(grace, now)}s to return` : ''}</span>}
      </div>
    </div>
  );
}

function FighterSprite({ f, side, anim, flip, emote, ko }: { f: PublicFighter; side: Side; anim?: Anim; flip: boolean; emote: EmoteId | null; ko: boolean }) {
  const cls = ['fighter', flip ? 'is-right' : 'is-left', anim?.atk && 'atk', anim?.hit && 'hit', anim?.crit && 'crit', anim?.evade && 'evade', anim?.def && 'def', anim?.gadget && 'gad', ko && 'ko'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {emote && <div className="emote-bubble" role="status">{EMOTES[emote].text}</div>}
      {anim?.dmg ? <span className={`float-num dmg ${anim.crit ? 'crit' : ''}`} aria-hidden="true">−{anim.dmg}{anim.crit ? '!' : ''}</span> : null}
      {anim?.evade ? <span className="float-num miss" aria-hidden="true">miss</span> : null}
      {anim?.heal ? <span className="float-num heal" aria-hidden="true">+{anim.healAmt}</span> : null}
      {anim?.def && <span className="def-ring" aria-hidden="true" />}
      <PixelAgent look={f.agent} corner={side} size={176} flip={flip} title={`${f.agent.name}, ${CLASSES[f.agent.classId].name} with ${WEAPONS[f.agent.weapon].name}`} />
    </div>
  );
}

function ReadyCard({ snap, now, onReady, mode }: { snap: MatchSnapshot; now: number; onReady?: () => void; mode: ArenaMode }) {
  const you = snap.you;
  return (
    <div className="stage-card" role="group" aria-label="Ready check">
      <p className="eyebrow">Match found · {snap.mode === 'challenge' ? 'direct challenge' : snap.mode === 'rematch' ? 'rematch' : 'ranked queue'}</p>
      <h3 className="display">Ready up</h3>
      <div className="ready-row">
        {(['a', 'b'] as Side[]).map((s) => <span key={s} className={snap.ready[s] ? 'pill-lime' : 'pill-muted'}>{snap.players[s].name}: {snap.ready[s] ? 'ready' : 'waiting'}</span>)}
      </div>
      <p className="small muted">Starts when both players are ready · {secsLeft(snap.deadline, now)}s left</p>
      {mode === 'live' && you && (snap.ready[you] ? <p className="small"><Icon name="check" size={14} /> You're ready. Waiting for your opponent…</p> : <button className="btn btn-lime btn-lg" onClick={onReady} autoFocus>I'm ready</button>)}
      <p className="tiny muted mono">seed commitment {snap.seedCommit.slice(0, 16)}…</p>
    </div>
  );
}

function ActionBar({ snap, you, legal, onAction, onEmote, onForfeit, myLevel, secs, demo }: { snap: MatchSnapshot; you: Side; legal: ReturnType<typeof legalActions>; onAction?: (a: ActionId) => void; onEmote?: (e: EmoteId) => void; onForfeit?: () => void; myLevel: number; secs: number; demo?: boolean }) {
  const locked = !demo && snap.locked[you];
  const [chosen, setChosen] = useState<ActionId | null>(null);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  useEffect(() => setChosen(null), [snap.round]);
  const pick = (a: ActionId) => { if (locked || !legal[a].ok) return; setChosen(a); onAction?.(a); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = (Object.keys(ACTIONS) as ActionId[]).find((k) => ACTIONS[k].key === e.key);
      if (a) { e.preventDefault(); pick(a); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const l = snap.players[you].agent;
  const desc: Record<ActionId, string> = {
    attack: `${WEAPONS[l.weapon].name}: ${snap.range === 'close' ? WEAPONS[l.weapon].close : WEAPONS[l.weapon].far} dmg at ${snap.range} range`,
    defend: `Block ${Math.round(CLASSES[l.classId].block * 100)}% · +${RULES.defendBonus} energy`,
    gadget: `${GADGETS[l.gadget].name}: ${GADGETS[l.gadget].blurb}`,
    move: `Switch to ${snap.range === 'close' ? 'far' : 'close'} range`
  };
  return (
    <div className="action-bar" role="group" aria-label="Choose your action">
      <div className="action-grid">
        {(Object.keys(ACTIONS) as ActionId[]).map((a) => (
          <button key={a} className={`action-btn act-${a} ${chosen === a ? 'chosen' : ''}`} onClick={() => pick(a)} disabled={locked || !legal[a].ok} aria-describedby={`act-desc-${a}`} aria-keyshortcuts={ACTIONS[a].key}>
            <span className="act-key" aria-hidden="true">{ACTIONS[a].key}</span>
            <span className="act-name"><Icon name={a === 'attack' ? 'sword' : a === 'defend' ? 'shield' : a === 'gadget' ? 'bolt' : 'move'} size={16} />{ACTIONS[a].name}</span>
            <span className="act-cost">{legal[a].cost ? `${legal[a].cost} energy` : 'free'}</span>
            <span id={`act-desc-${a}`} className="act-desc">{legal[a].ok ? desc[a] : legal[a].reason}</span>
          </button>
        ))}
      </div>
      <div className="action-foot small">
        {locked ? <span className="pill-lime" role="status"><Icon name="lock" size={13} /> Locked in{chosen ? `: ${ACTIONS[chosen].name}` : ''} — waiting for opponent</span>
          : demo ? <span className="muted">Pick an action (keys 1–4). The bot chooses at the same time.</span>
          : <span className="muted">Both players choose at the same time. No pick in {secs}s = Defend.</span>}
        <span className="spacer" />
        {onEmote && (Object.keys(EMOTES) as EmoteId[]).filter((e) => EMOTES[e].level <= myLevel).map((e) => <button key={e} className="btn btn-ghost btn-xs" onClick={() => onEmote(e)} aria-label={`Send emote ${EMOTES[e].name}`}>{EMOTES[e].text}</button>)}
        {onForfeit && <button className="btn btn-ghost btn-xs danger" onClick={() => setConfirmForfeit(true)}><Icon name="flag" size={13} />{demo ? 'Quit' : 'Forfeit'}</button>}
      </div>
      <Modal open={confirmForfeit} onClose={() => setConfirmForfeit(false)} title={demo ? 'Quit this demo match?' : 'Forfeit this match?'}>
        <p>{demo ? 'Nothing is recorded in demo mode.' : 'A forfeit counts as a loss and changes your rating. You still get participation XP for the rounds you played.'}</p>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setConfirmForfeit(false)}>Keep fighting</button><button className="btn btn-danger" onClick={() => { setConfirmForfeit(false); onForfeit?.(); }}>{demo ? 'Quit' : 'Forfeit'}</button></div>
      </Modal>
    </div>
  );
}

function CombatLog({ snap, left }: { snap: MatchSnapshot; left: Side }) {
  const rounds = [...snap.rounds].reverse();
  return (
    <div className="combat-log">
      <div className="log-head"><span className="label">Combat log</span><span className="tiny muted">server-resolved · newest first</span></div>
      {rounds.length === 0 ? <p className="small muted">No rounds yet.</p> : (
        <ol className="log-list" reversed>
          {rounds.map((r) => (
            <li key={r.round}>
              <span className="log-round mono">R{r.round}</span>
              <span className="log-acts small"><b className={`c-${left}`}>{r.actions[left]}</b> vs <b className={`c-${left === 'a' ? 'b' : 'a'}`}>{r.actions[left === 'a' ? 'b' : 'a']}</b> · {r.rangeAfter}</span>
              <span className="log-events">{r.events.map((e, i) => <span key={i} className={`ev ev-${e.type} c-${e.side}`}>{e.text} </span>)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EndCard(p: Props & { left: Side }) {
  const { snap, mode, endInfo, left } = p;
  const you = snap.you;
  const res = snap.winner === 'draw' ? 'draw' : you ? (snap.winner === you ? 'win' : 'loss') : null;
  const title = res === 'win' ? 'Victory' : res === 'loss' ? 'Defeat' : res === 'draw' ? 'Draw' : `${snap.winner === 'draw' ? 'Draw' : `${snap.players[snap.winner as Side]?.agent.name} wins`}`;
  const xpLines = you && endInfo ? endInfo.xp[you] : null;
  const total = xpLines?.reduce((s, l) => s + l.xp, 0) ?? 0;
  return (
    <div className={`end-card result-${res ?? 'neutral'}`} role="status" aria-live="polite">
      <div className="end-main">
        <p className="eyebrow">{reasonText[snap.endReason ?? 'ko']}</p>
        <h3 className="display end-title">{title}</h3>
        <p className="small muted">Final HP — {snap.players[left].agent.name} {snap.f[left].hp} · {snap.players[left === 'a' ? 'b' : 'a'].agent.name} {snap.f[left === 'a' ? 'b' : 'a'].hp}</p>
        {mode === 'demo' && <p className="small"><Tag kind="demo">Demo</Tag> No rating or XP changes in demo matches.</p>}
        {you && endInfo && (
          <div className="end-grid">
            <div>
              <span className="label">Rating</span>
              <strong className={endInfo.ratingDelta[you] >= 0 ? 'up' : 'down'}>{endInfo.ratingDelta[you] >= 0 ? '+' : ''}{endInfo.ratingDelta[you]}</strong>
            </div>
            <div>
              <span className="label">XP earned · {total}</span>
              <ul className="xp-lines">{xpLines!.map((l, i) => <li key={i}><span>{l.reason}</span><b>+{l.xp}</b></li>)}</ul>
              {endInfo.levelUps[you].length > 0 && <p className="pill-lime">Level up → {endInfo.levelUps[you].join(', ')}! Check your new unlocks in the workshop.</p>}
            </div>
          </div>
        )}
        {snap.seed && (mode === 'live' || mode === 'spectate') && <p className="tiny mono muted">seed revealed: {snap.seed.slice(0, 24)}… · <a href={`#/match/${snap.id}`}>verify & replay</a></p>}
      </div>
      <div className="end-actions">
        {mode === 'live' && p.onRematch && (
          you && p.rematch?.[you] ? <span className="pill-lime">Rematch requested{p.rematch[you === 'a' ? 'b' : 'a'] ? '' : ' · waiting for opponent'}</span>
            : <button className="btn btn-primary" onClick={p.onRematch}>{p.rematch && you && p.rematch[you === 'a' ? 'b' : 'a'] ? 'Accept rematch' : 'Rematch'}</button>
        )}
        {mode === 'demo' && p.onRematch && <button className="btn btn-primary" onClick={p.onRematch}>Play again</button>}
        {p.onLeave && <button className="btn btn-ghost" onClick={p.onLeave}>Back to arena</button>}
      </div>
    </div>
  );
}

export function levelOf(xp: number) { return levelFromXp(xp).level; }
export { shortAddr };
