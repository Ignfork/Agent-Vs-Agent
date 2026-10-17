import { useState } from 'react';
import { SectionHead } from '../components/Cards';
import { Icon } from '../components/ui';
import { CLASSES, GADGETS, RULES, WEAPONS } from '../../shared/game';
import { XP_RULES, xpForLevel, UNLOCKS } from '../../shared/progression';
import { Rules } from './Arena';
import { useStore } from '../state';

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: 'Which wallets work?', a: 'Any Solana wallet that supports the Wallet Standard — for example Phantom, Solflare and Backpack. The game detects installed wallets automatically. We never ask for a seed phrase or private key; if something does, it isn\'t us.' },
  { q: 'What does signing in actually do?', a: 'Your wallet signs a short text message containing a one-time nonce. The server checks the signature against your public key and gives your browser a session. It is not a transaction: no fees, no approvals, and nothing can move from your wallet.' },
  { q: 'Which network is this on?', a: 'Development builds use Solana devnet by default. The network is shown in the header at all times. The operator sets it with SOLANA_NETWORK on the server.' },
  { q: 'Do I need $AVA or SOL to play?', a: 'No. Matchmaking, challenges, ranked play, XP and seasons are free. Connecting a wallet is not a wager and nothing is staked on matches.' },
  { q: 'Is combat fair?', a: <>Yes, by design. Every round is resolved on the server, so clients can't decide outcomes. Both players choose at the same time and can't see each other's pick until the round resolves. Random rolls come from a seed that is committed (hashed) before round 1 and revealed afterwards, so anyone can replay and verify a match. Classes share one power budget; levels and $AVA never add stats.</> },
  { q: 'How does levelling work?', a: `Every finished match gives ${XP_RULES.participation} XP for taking part plus ${XP_RULES.perRound} XP per round fought (up to ${XP_RULES.roundCap}). Wins add ${XP_RULES.win} XP and draws ${XP_RULES.draw}. Leaving a match early gives no XP. Levels unlock palettes, frames, emotes and sidegrade weapons/gadgets — alternatives with different trade-offs, not upgrades.` },
  { q: 'What if I disconnect?', a: 'You have 45 seconds to come back; reopen the site and you\'re dropped straight back into the match. While you\'re away your turns default to Defend. If you don\'t return in time the match counts as a loss and you receive no XP.' },
  { q: 'What is $AVA used for?', a: 'Optional cosmetic unlocks, visual gear, seasonal cosmetic tracks and community votes. Each use lists its status (active, preview or planned) and the exact transaction it needs on the $AVA utility page. We make no claims about price or returns.' },
  { q: 'What is live and what is demo?', a: 'Anything labelled Live comes from the game server: matchmaking, matches, spectating, the leaderboard and profiles. Anything labelled Demo is sample data or a bot running in your browser — it never pretends to be a real opponent. $AVA features stay in Preview until a mint is configured.' }
];

export function HowPage() {
  const [open, setOpen] = useState<number | null>(0);
  const cfg = useStore((s) => s.config);
  return (
    <div className="page">
      <SectionHead eyebrow="How it works" title="Wallet in." accent="Agent out. Fight on.">
        The whole loop in five steps, then the details: combat, progression, wallets and the token.
      </SectionHead>

      <ol className="how-steps">
        {[
          ['wallet', 'Connect and sign in', 'Connect a Solana wallet (shares your address only), then sign a free sign-in message. The server verifies the signature — no transaction.'],
          ['gear', 'Create your agent', 'Choose a class, weapon, gadget and palette in the workshop. Review it and confirm. Agents are saved to the game server — nothing is minted.'],
          ['sword', 'Queue or challenge', 'Join the rated queue (paired by rating, window widens as you wait) or challenge an online player by name or wallet.'],
          ['trophy', 'Fight, earn XP, climb', 'Ready up, then pick one action per round. Every finished match earns XP; wins and losses move your rating.'],
          ['star', 'Use $AVA (optional)', 'Unlock cosmetics or join community votes. Each use explains its transaction and needs your approval in the wallet.']
        ].map(([icon, t, d], i) => (
          <li key={t} className="how-step">
            <span className="how-icon"><Icon name={icon} size={22} /></span>
            <span className="mono tiny violet">STEP {i + 1}</span>
            <h2 className="h4">{t}</h2>
            <p className="small muted">{d}</p>
          </li>
        ))}
      </ol>

      <div className="split section-sm">
        <section className="panel" aria-labelledby="combat-h">
          <div className="panel-head"><h2 id="combat-h" className="h3 display">Combat</h2></div>
          <Rules />
          <div className="table-wrap">
            <table className="table small">
              <caption className="sr-only">Weapons</caption>
              <thead><tr><th scope="col">Weapon</th><th scope="col">Class</th><th scope="col" className="num">Close</th><th scope="col" className="num">Far</th><th scope="col" className="num">Energy</th><th scope="col" className="num">Crit</th></tr></thead>
              <tbody>{Object.values(WEAPONS).map((w) => <tr key={w.id}><td>{w.name}{w.level > 1 && <span className="tiny muted"> · Lv {w.level}</span>}</td><td>{CLASSES[w.classId].name}</td><td className="num">{w.close}</td><td className="num">{w.far}</td><td className="num">{w.cost}</td><td className="num">{Math.round(w.crit * 100)}%</td></tr>)}</tbody>
            </table>
          </div>
          <ul className="small gadget-list">{Object.values(GADGETS).map((g) => <li key={g.id}><i className="badge-dot" style={{ background: g.badge }} aria-hidden="true" /><strong>{g.name}</strong> — {g.blurb} <span className="muted">({g.cost || 'no'} energy, {g.cooldown}-round cooldown{g.level > 1 ? `, Lv ${g.level}` : ''})</span></li>)}</ul>
        </section>
        <section className="panel" aria-labelledby="prog-h">
          <div className="panel-head"><h2 id="prog-h" className="h3 display">Progression</h2></div>
          <ul className="xp-lines">
            <li><span>Finish a match (win, lose or draw)</span><b>+{XP_RULES.participation}</b></li>
            <li><span>Each round fought (max {XP_RULES.roundCap})</span><b>+{XP_RULES.perRound}</b></li>
            <li><span>Victory</span><b>+{XP_RULES.win}</b></li>
            <li><span>Draw</span><b>+{XP_RULES.draw}</b></li>
            <li><span>Leave before the end</span><b>0</b></li>
          </ul>
          <p className="label">Unlock track</p>
          <ul className="unlock-track">
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => (
              <li key={l}><span className="mono tiny violet">LV {l}</span><span className="tiny muted">{xpForLevel(l)} XP</span><span className="small">{UNLOCKS.filter((u) => u.level === l).map((u) => u.name).join(', ') || '—'}</span></li>
            ))}
          </ul>
          <p className="tiny muted">Ratings: Elo, start {1000}, K=40 for your first 10 matches then 24. Max {RULES.maxRounds} rounds per match.</p>
        </section>
      </div>

      <section className="section-sm" aria-labelledby="faq-h">
        <h2 id="faq-h" className="display h2">FAQ</h2>
        <div className="faq">
          {FAQ.map((f, i) => (
            <div key={f.q} className="faq-item">
              <h3><button id={`faq-b${i}`} className="faq-q" aria-expanded={open === i} aria-controls={`faq-p${i}`} onClick={() => setOpen(open === i ? null : i)}><span>{f.q}</span><span aria-hidden="true" className="faq-pm">{open === i ? '−' : '+'}</span></button></h3>
              <div id={`faq-p${i}`} role="region" aria-labelledby={`faq-b${i}`} className="faq-a" hidden={open !== i}><p>{f.a}</p></div>
            </div>
          ))}
        </div>
        <p className="tiny muted">Network on this deployment: {cfg?.network ?? 'devnet (server unreachable)'}.</p>
      </section>
    </div>
  );
}
