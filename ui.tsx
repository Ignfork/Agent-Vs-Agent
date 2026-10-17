// Shared UI primitives: accessible modal, tabs, tags, bars, state boxes, icons.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export function Modal({ open, onClose, title, children, labelledBy, wide = false, dismissable = true }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string; wide?: boolean; dismissable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    setTimeout(() => (focusables()[0] ?? el)?.focus(), 10);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose(); }}>
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">{title}</h2>
          {dismissable && <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><Icon name="x" /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label, idPrefix }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (t: T) => void; label: string; idPrefix: string }) {
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (n >= 0) { e.preventDefault(); onChange(tabs[n].id); document.getElementById(`${idPrefix}-tab-${tabs[n].id}`)?.focus(); }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} id={`${idPrefix}-tab-${t.id}`} role="tab" aria-selected={value === t.id} aria-controls={`${idPrefix}-panel`} tabIndex={value === t.id ? 0 : -1} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Tag = ({ kind, children }: { kind: 'demo' | 'live' | 'preview' | 'planned' | 'active' | 'devnet' | 'muted'; children: ReactNode }) => <span className={`tag tag-${kind}`}>{children}</span>;
export const DemoTag = ({ children = 'Demo data' }: { children?: ReactNode }) => <Tag kind="demo">{children}</Tag>;
export const LiveTag = ({ children = 'Live' }: { children?: ReactNode }) => <Tag kind="live"><span className="pulse-dot" aria-hidden="true" />{children}</Tag>;

export function Bar({ value, max, kind, label, showText = true, ghost }: { value: number; max: number; kind: 'hp' | 'energy' | 'xp' | 'stat'; label: string; showText?: boolean; ghost?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const g = ghost !== undefined ? Math.max(0, Math.min(100, (ghost / max) * 100)) : null;
  return (
    <div className={`bar bar-${kind}`}>
      <div className="bar-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
        {g !== null && g > pct && <div className="bar-ghost" style={{ width: `${g}%` }} />}
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {showText && <span className="bar-text">{Math.round(value)}<span className="dim">/{max}</span></span>}
    </div>
  );
}

export function StateBox({ kind, title, children, action }: { kind: 'loading' | 'empty' | 'error' | 'offline'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`state-box state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'loading' ? <span className="spinner" aria-hidden="true" /> : <Icon name={kind === 'empty' ? 'inbox' : kind === 'offline' ? 'plug' : 'alert'} />}
      <div><strong>{title}</strong>{children && <div className="state-body">{children}</div>}</div>
      {action}
    </div>
  );
}

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
export const secsLeft = (deadline: number | null | undefined, now: number) => (deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0);
export const timeAgo = (t: number | null) => {
  if (!t) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
};

const PATHS: Record<string, string> = {
  x: 'M6 6l12 12M18 6L6 18', wallet: 'M3 7h15a3 3 0 013 3v7a3 3 0 01-3 3H5a2 2 0 01-2-2zM3 7l2-3h11l1 3M16 14h2', play: 'M7 5l12 7-12 7z', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  sword: 'M14 4h6v6L9 21l-3-3zM5 15l4 4M3 21l3-3', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', move: 'M5 12h14M15 8l4 4-4 4M9 8l-4 4 4 4',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5', alert: 'M12 3l10 18H2zM12 10v5M12 18v.5', plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4', check: 'M4 12l5 5L20 6',
  copy: 'M8 8h12v12H8zM4 16V4h12', trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3', menu: 'M4 7h16M4 12h16M4 17h16', chevron: 'M9 6l6 6-6 6',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10', flag: 'M5 21V4h11l-2 4 2 4H5', chat: 'M4 5h16v11H9l-5 4z', gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L6 7.2 4 7l-1 3 2 1v1.8l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z'
};
export function Icon({ name, size = 18, label }: { name: keyof typeof PATHS | string; size?: number; label?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={PATHS[name] ?? PATHS.alert} />
    </svg>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <button className="btn btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone('ok'); } catch { setDone('fail'); } setTimeout(() => setDone('idle'), 1600); }}>
      <Icon name={done === 'ok' ? 'check' : 'copy'} size={14} />{done === 'ok' ? 'Copied' : done === 'fail' ? 'Copy failed' : label}
    </button>
  );
}
