import { useState } from 'react';
import { useStore } from '../state';
import { readAvaBalance, utilities, type Utility } from '../services/token';
import { SectionHead } from '../components/Cards';
import { Icon, Modal, StateBox, Tag } from '../components/ui';
import { useAsync } from '../hooks';
import { shortAddr } from '../../shared/base58';

export function UtilityPage() {
  const cfg = useStore((s) => s.config);
  const account = useStore((s) => s.account);
  const [open, setOpen] = useState<Utility | null>(null);
  const list = utilities(cfg);
  const bal = useAsync(() => readAvaBalance(cfg!, account!.address), [cfg?.avaMint, account?.address], { enabled: !!(cfg?.avaMint && account) });

  return (
    <div className="page">
      <SectionHead eyebrow="$AVA utility" title="Looks, not power." accent="Optional, always.">
        $AVA is the in-game token for optional extras. Combat, ranked play, XP and seasons never require it, and nothing bought with it changes damage, HP, energy or matchmaking.
      </SectionHead>

      <div className="split">
        <section className="panel" aria-labelledby="bal-h">
          <div className="panel-head"><h2 id="bal-h" className="h3 display">Your $AVA</h2>{cfg?.avaMint ? <Tag kind="active">Mint configured</Tag> : <Tag kind="preview">Preview</Tag>}</div>
          {!cfg?.avaMint ? (
            <StateBox kind="empty" title="$AVA isn't configured on this deployment">
              The operator hasn't set <code>AVA_MINT</code>, so there's no token to read. We don't display a made-up mint or balance.
            </StateBox>
          ) : !account ? (
            <StateBox kind="empty" title="Connect a wallet to see your balance">Reading a balance needs only your public address — no signature.</StateBox>
          ) : bal.loading ? <StateBox kind="loading" title="Reading token accounts…" />
            : bal.error ? <StateBox kind="error" title="Couldn't read your balance" action={<button className="btn btn-ghost btn-sm" onClick={bal.reload}>Retry</button>}>{bal.error}</StateBox>
            : (
              <div className="balance">
                <span className="display h2">{bal.data?.amount.toLocaleString()} <span className="violet">$AVA</span></span>
                <p className="small muted">{shortAddr(account.address)} · {bal.data?.accounts} token account{bal.data?.accounts === 1 ? '' : 's'} · {cfg.network}</p>
              </div>
            )}
          <dl className="kv small">
            <div><dt>Network</dt><dd>{cfg?.network ?? 'devnet'}</dd></div>
            <div><dt>Mint</dt><dd className="mono break">{cfg?.avaMint ?? 'not configured'}</dd></div>
          </dl>
        </section>
        <section className="panel" aria-labelledby="rules-h">
          <div className="panel-head"><h2 id="rules-h" className="h3 display">Our rules for $AVA</h2></div>
          <ul className="check-list small">
            <li><Icon name="check" size={15} />Every token action is started by you, summarised first, and approved in your wallet.</li>
            <li><Icon name="check" size={15} />No staking yields, betting, wagers or prize pools.</li>
            <li><Icon name="check" size={15} />No pay-to-win: unlocks are cosmetic or community-facing only.</li>
            <li><Icon name="check" size={15} />We don't publish price predictions or promise value. $AVA can lose value.</li>
            <li><Icon name="check" size={15} />Supply, fees and any distribution details will only appear here once they're officially published — nothing is invented in this app.</li>
          </ul>
        </section>
      </div>

      <section className="section-sm" aria-labelledby="util-h">
        <h2 id="util-h" className="h3 display">Uses</h2>
        <div className="util-grid">
          {list.map((u) => (
            <article key={u.id} className={`util-card status-${u.status}`}>
              <div className="util-top"><Tag kind={u.status}>{u.status === 'active' ? 'Active' : u.status === 'preview' ? 'Preview' : 'Planned'}</Tag><span className="tiny muted">No combat effect</span></div>
              <h3 className="h4">{u.title}</h3>
              <p className="small muted">{u.summary}</p>
              <p className="tiny"><span className="label">Transaction</span> {u.tx}</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(u)}>Details</button>
            </article>
          ))}
        </div>
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && (
          <>
            <p>{open.detail}</p>
            <dl className="kv small">
              <div><dt>Status</dt><dd>{open.status}</dd></div>
              <div><dt>Transaction</dt><dd>{open.tx}</dd></div>
              <div><dt>Affects combat</dt><dd>No</dd></div>
            </dl>
            {open.needs.length > 0 && (<><p className="label">Needed to enable</p><ul className="small">{open.needs.map((n) => <li key={n}><code>{n}</code></li>)}</ul></>)}
            {open.status !== 'active' && <p className="small muted">This feature is not live. No transaction can be started from this page until it is configured and announced.</p>}
            <div className="modal-foot"><button className="btn btn-primary" onClick={() => setOpen(null)}>Got it</button></div>
          </>
        )}
      </Modal>
    </div>
  );
}
