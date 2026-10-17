import { useEffect, useRef, useState } from 'react';
import { useStore, signedIn, setState } from '../state';
import { cancelSignIn, confirmSignIn, connect, disconnect, retryServer, signOut, startSignIn } from '../actions';
import { INSTALL_LINKS } from '../wallet/standard';
import { Icon, Modal, Tag } from './ui';
import { shortAddr } from '../../shared/base58';
import { navigate } from '../router';
import { PixelAgent } from './PixelAgent';

export function NetworkBadge() {
  const cfg = useStore((s) => s.config);
  const server = useStore((s) => s.server);
  const net = cfg?.network ?? 'devnet';
  return (
    <span className={`net-badge net-${net}`} title={server === 'offline' ? 'Game server unreachable — demo mode' : `Solana ${net}`}>
      <span className="net-dot" aria-hidden="true" />
      <span className="sr-only">Network: </span>{net === 'mainnet-beta' ? 'mainnet' : net}
      {server === 'offline' && <span className="net-off">· offline</span>}
    </span>
  );
}

export function WalletControl() {
  const status = useStore((s) => s.walletStatus);
  const account = useStore((s) => s.account);
  const isIn = useStore(signedIn);
  const me = useStore((s) => s.me);
  const step = useStore((s) => s.signIn);
  const server = useStore((s) => s.server);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [menu]);

  if (status === 'connecting') return <button className="btn btn-wallet" disabled aria-live="polite"><span className="spinner sm" aria-hidden="true" />Connecting…</button>;
  if (status === 'disconnected' || !account) return <button className="btn btn-primary btn-wallet" onClick={() => setState({ walletModal: true })}><Icon name="wallet" size={16} />Connect wallet</button>;
  const active = me?.agents.find((a) => a.id === me.activeAgentId) ?? me?.agents[0];
  return (
    <div className="wallet-wrap" ref={ref}>
      {!isIn && server === 'online' && (
        <button className="btn btn-lime btn-sm" onClick={startSignIn} disabled={step !== 'idle'}>{step === 'idle' ? 'Sign in' : 'Check wallet…'}</button>
      )}
      <button className="btn btn-wallet connected" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        {active ? <PixelAgent look={active} size={22} /> : <span className="status-dot ok" aria-hidden="true" />}
        <span className="wallet-name">{isIn && me ? me.name : shortAddr(account.address)}</span>
        <Icon name="chevron" size={14} />
      </button>
      {menu && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div className="mono small">{shortAddr(account.address)}</div>
            <div className="small">{isIn ? <Tag kind="active">Signed in</Tag> : <Tag kind="muted">Connected · not signed in</Tag>}</div>
          </div>
          {isIn && <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); navigate('/profile'); }}><Icon name="user" size={16} />Profile & rewards</button>}
          <button role="menuitem" className="menu-item" onClick={async () => { try { await navigator.clipboard.writeText(account.address); } catch { /* ignore */ } setMenu(false); }}><Icon name="copy" size={16} />Copy address</button>
          {isIn ? <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); signOut(); }}><Icon name="logout" size={16} />Sign out</button>
            : server === 'online' && <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); startSignIn(); }}><Icon name="check" size={16} />Sign in</button>}
          <button role="menuitem" className="menu-item danger" onClick={() => { setMenu(false); disconnect(); }}><Icon name="x" size={16} />Disconnect wallet</button>
        </div>
      )}
    </div>
  );
}

export function WalletModal() {
  const open = useStore((s) => s.walletModal);
  const wallets = useStore((s) => s.wallets);
  const err = useStore((s) => s.walletError);
  const status = useStore((s) => s.walletStatus);
  const cfg = useStore((s) => s.config);
  return (
    <Modal open={open} onClose={() => setState({ walletModal: false, walletError: null })} title="Connect a Solana wallet">
      <p className="muted">Connecting shares your <strong>public address</strong> only. Nothing is signed and no transaction is sent. You'll be asked separately to sign a free sign-in message.</p>
      <p className="small muted">Network: <strong>{cfg?.network ?? 'devnet'}</strong>. Agent VS Agent will never ask for your seed phrase or private key.</p>
      {wallets.length > 0 ? (
        <ul className="wallet-list">
          {wallets.map((w) => (
            <li key={w.name}>
              <button className="wallet-option" onClick={() => connect(w)} disabled={status === 'connecting'}>
                {w.icon ? <img src={w.icon} alt="" width={28} height={28} /> : <Icon name="wallet" />}
                <span>{w.name}</span><span className="small muted">Detected</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="state-box state-empty">
          <Icon name="wallet" />
          <div>
            <strong>No Solana wallet detected in this browser.</strong>
            <div className="state-body">Install a Wallet Standard compatible wallet, then reload this page:{' '}
              {INSTALL_LINKS.map((l, i) => <span key={l.name}>{i > 0 && ', '}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a></span>)}.
            </div>
          </div>
        </div>
      )}
      {err && <p className="form-error" role="alert">{err}</p>}
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={() => { setState({ walletModal: false }); navigate('/arena'); }}>Explore the demo instead</button>
      </div>
    </Modal>
  );
}

export function SignInDialog() {
  const step = useStore((s) => s.signIn);
  const err = useStore((s) => s.signInError);
  const account = useStore((s) => s.account);
  const cfg = useStore((s) => s.config);
  const server = useStore((s) => s.server);
  const busy = step === 'challenge' || step === 'signing' || step === 'verifying';
  return (
    <Modal open={step !== 'idle'} onClose={cancelSignIn} title="Sign in with your wallet" dismissable={!busy}>
      <p>Your wallet will ask you to <strong>sign a message</strong> so the game server can confirm you own this address.</p>
      <ul className="check-list">
        <li><Icon name="check" size={16} />Message signature only — <strong>not a transaction</strong></li>
        <li><Icon name="check" size={16} />No fees, no token approvals, nothing leaves your wallet</li>
        <li><Icon name="check" size={16} />Signing in does not enter you into any wager</li>
      </ul>
      <dl className="kv small">
        <div><dt>Address</dt><dd className="mono">{account ? shortAddr(account.address) : '—'}</dd></div>
        <div><dt>Domain</dt><dd className="mono">{cfg?.domain ?? '—'}</dd></div>
        <div><dt>Network</dt><dd>{cfg?.network ?? 'devnet'}</dd></div>
      </dl>
      {server === 'offline' && <p className="form-error">The game server is unreachable. <button className="link-btn" onClick={retryServer}>Retry</button></p>}
      <div aria-live="polite" className="small step-status">
        {step === 'challenge' && <><span className="spinner sm" aria-hidden="true" /> Requesting a one-time sign-in message…</>}
        {step === 'signing' && <><span className="spinner sm" aria-hidden="true" /> Waiting for you to approve the signature in your wallet…</>}
        {step === 'verifying' && <><span className="spinner sm" aria-hidden="true" /> Verifying the signature…</>}
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={cancelSignIn} disabled={busy}>Not now</button>
        <button className="btn btn-primary" onClick={confirmSignIn} disabled={busy || server !== 'online'}>{err ? 'Try again' : 'Continue to wallet'}</button>
      </div>
    </Modal>
  );
}
