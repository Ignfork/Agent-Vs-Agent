import { CLASSES, GADGETS, WEAPONS, type ClassId, type GadgetId, type PaletteId, type WeaponId } from '../../shared/game';
import type { LeaderRow } from '../../shared/types';
import { PixelAgent } from './PixelAgent';
import { Icon, timeAgo } from './ui';
import { shortAddr } from '../../shared/base58';

export interface AgentLike { id: string; name: string; classId: ClassId; weapon: WeaponId; gadget: GadgetId; palette: PaletteId; wins?: number; losses?: number; draws?: number; ownerName?: string }

export function AgentCard({ a, href, corner = 'a', footer, index }: { a: AgentLike; href?: string; corner?: 'a' | 'b'; footer?: React.ReactNode; index?: number }) {
  const c = CLASSES[a.classId], w = WEAPONS[a.weapon], g = GADGETS[a.gadget];
  const games = (a.wins ?? 0) + (a.losses ?? 0) + (a.draws ?? 0);
  const body = (
    <>
      <div className="agent-card-art">
        {index !== undefined && <span className="card-index mono">{String(index + 1).padStart(2, '0')}</span>}
        <PixelAgent look={a} corner={corner} size={112} />
      </div>
      <div className="agent-card-body">
        <h3 className="agent-name">{a.name}</h3>
        <p className="agent-sub mono">{c.name} · {w.name}</p>
        <p className="small muted"><i className="badge-dot" style={{ background: g.badge }} aria-hidden="true" />{g.name}{a.ownerName ? ` · ${a.ownerName}` : ''}</p>
        {games > 0 && <p className="small"><span className="up">{a.wins}W</span> · <span className="down">{a.losses}L</span>{a.draws ? ` · ${a.draws}D` : ''}</p>}
        {footer}
      </div>
    </>
  );
  return href ? <a className="agent-card" href={href}>{body}</a> : <div className="agent-card">{body}</div>;
}

export function LeaderTable({ rows, compact = false, highlight, link = true }: { rows: LeaderRow[]; compact?: boolean; highlight?: string | null; link?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Season leaderboard</caption>
        <thead>
          <tr>
            <th scope="col">#</th><th scope="col">Player</th><th scope="col">Agent</th>
            <th scope="col" className="num">Rating</th>
            {!compact && <><th scope="col" className="num">W</th><th scope="col" className="num">L</th><th scope="col" className="num">D</th></>}
            <th scope="col" className="num">Win rate</th>
            {!compact && <th scope="col">Last match</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.wallet + r.rank} className={highlight === r.wallet ? 'me' : ''}>
              <td className={`rank r${r.rank}`}>{r.rank}</td>
              <td>{link ? <a href={`#/player/${r.wallet}`}>{r.name}</a> : <span>{r.name}</span>}<span className="tiny muted mono block">Lv {r.level} · {shortAddr(r.wallet)}</span></td>
              <td>{r.agent ? <span className="agent-inline"><PixelAgent look={r.agent} size={26} />{r.agent.name}<span className="tiny muted"> {CLASSES[r.agent.classId].name}</span></span> : <span className="muted">—</span>}</td>
              <td className="num strong">{r.rating}</td>
              {!compact && <><td className="num up">{r.wins}</td><td className="num down">{r.losses}</td><td className="num">{r.draws}</td></>}
              <td className="num">{Math.round(r.winRate * 100)}%</td>
              {!compact && <td className="small muted">{timeAgo(r.lastMatchAt)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SectionHead({ eyebrow, title, accent, children, action }: { eyebrow: string; title: string; accent?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display h2">{title}{accent && <> <span className="violet">{accent}</span></>}</h2>
        {children && <div className="section-lede">{children}</div>}
      </div>
      {action}
    </div>
  );
}
export { Icon };
