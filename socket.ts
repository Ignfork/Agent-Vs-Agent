// Arena socket: one WebSocket per tab, re-authenticated automatically after
// network hiccups (exponential backoff). The server owns all match state; this
// class only relays intents and events.
import type { ClientMsg, ServerMsg } from '../../shared/types';
import { wsUrl } from './api';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
type Handler = (m: ServerMsg) => void;

export class ArenaSocket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  status: SocketStatus = 'idle';
  constructor(private onMsg: Handler, private onStatus: (s: SocketStatus) => void) {}

  start(token: string | null) {
    this.token = token; this.stopped = false; this.retries = 0; this.open();
  }
  /** Attach (or clear) the session token on an open socket. */
  setToken(token: string | null) {
    this.token = token;
    if (token) this.send({ t: 'auth', token });
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.ws?.close(); this.ws = null; this.set('closed');
  }
  send(m: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m)); return true;
  }
  private set(s: SocketStatus) { this.status = s; this.onStatus(s); }
  private open() {
    this.set(this.retries ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(wsUrl()); } catch { return this.retry(); }
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0; this.set('open');
      if (this.token) ws.send(JSON.stringify({ t: 'auth', token: this.token }));
      if (this.ping) clearInterval(this.ping);
      this.ping = setInterval(() => this.send({ t: 'ping' }), 20_000);
    };
    ws.onmessage = (e) => { try { this.onMsg(JSON.parse(e.data)); } catch { /* ignore malformed */ } };
    ws.onclose = (e) => {
      if (this.ping) clearInterval(this.ping);
      if (this.ws !== ws) return;
      if (e.code === 4000) { this.stopped = true; this.set('closed'); return; } // replaced by another tab
      this.retry();
    };
  }
  private retry() {
    if (this.stopped) return;
    this.set('reconnecting');
    const delay = Math.min(15_000, 500 * 2 ** this.retries++);
    this.timer = setTimeout(() => this.open(), delay);
  }
}
