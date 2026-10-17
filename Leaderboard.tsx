import { useMemo, useState } from 'react';
import { useStore } from '../state';
import { api } from '../services/api';
import { useAsync } from '../hooks';
import { LeaderTable, SectionHead } from '../components/Cards';
import { DemoTag, LiveTag, StateBox, Tabs } from '../components/ui';
import { demoLeaderboard } from '../services/demo';
import type { LeaderRow } from '../../shared/types';

type Source = 'live' | 'demo';
type Sort = 'rating' | 'wins' | 'winRate' | 'recent';

export function LeaderboardPage() {
  const server = useStore((s) => s.server);
  const cfg = useStore((s) => s.config);
  const me = useStore((s) => s.me);
  const v = useStore((s) => s.dataVersion);
  const [source, setSource] = useState<Source>(server === 'offline' ? 'demo' : 'live');
  const seasons = useAsync(() => api.seasons(), [server], { enabled: server === 'online' });
  const [season, setSeason] = useState<string>('');
  const seasonId = season || cfg?.season.id || 's1';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('rating');
  const live = useAsync(() => api.leaderboard(seasonId), [seasonId, server, v], { enabled: server === 'online' && source === 'live', pollMs: 20000 });

  const rows: LeaderRow[] = useMemo(() => {
    const base = source === 'demo' ? demoLeaderboard(seasonId) : live.data ?? [];
    const ql = q.trim().toLowerCase();
    const f = base.filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.wallet.toLowerCase().startsWith(ql) || r.agent?.name.toLowerCase().includes(ql));
    const by: Record<Sort, (a: LeaderRow, b: LeaderRow) => number> = { rating: (a, b) => b.rating - a.rating, wins: (a, b) => b.wins - a.wins, winRate: (a, b) => b.winRate - a.winRate, recent: (a, b) => (b.lastMatchAt ?? 0) - (a.lastMatchAt ?? 0) };
    return [...f].sort(by[sort]);
  }, [source, live.data, q, sort, seasonId]);

  const seasonOptions = seasons.data ?? [{ id: cfg?.season.id ?? 's1', name: cfg?.season.name ?? 'Season 1', current: true }];
  return (
    <div className="page">
      <SectionHead eyebrow="Leaderboard" title="Season" accent="standings.">
        Ratings use an Elo system: everyone starts at 1000 each season, beating a higher-rated opponent earns more. Seasons reset ratings, never your level or cosmetics.
      </SectionHead>
      <div className="toolbar">
        <Tabs idPrefix="lb" label="Data source" value={source} onChange={setSource} tabs={[{ id: 'live', label: <>Live server</> }, { id: 'demo', label: <>Demo sample</> }]} />
        <label className="label inline">Season
          <select className="input input-sm" value={seasonId} onChange={(e) => setSeason(e.target.value)} disabled={source === 'demo' && false}>
            {source === 'demo' ? <><option value="s1">Season 1 (sample)</option><option value="s0">Preseason (sample)</option></> : seasonOptions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.current ? ' · current' : ''}</option>)}
          </select>
        </label>
        <label className="label inline">Sort
          <select className="input input-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="rating">Rating</option><option value="wins">Wins</option><option value="winRate">Win rate</option><option value="recent">Recent activity</option>
          </select>
        </label>
        <input className="input input-sm search" type="search" placeholder="Search player, wallet or agent" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leaderboard" />
      </div>
      <div id="lb-panel" role="tabpanel" aria-labelledby={`lb-tab-${source}`} className="panel">
        <div className="panel-head">
          {source === 'live' ? <LiveTag>Live · {seasonId}</LiveTag> : <DemoTag>Demo sample — fictional players, not real results</DemoTag>}
          <span className="small muted">{rows.length} player{rows.length === 1 ? '' : 's'}</span>
        </div>
        {source === 'live' && server === 'offline' ? <StateBox kind="offline" title="Live leaderboard unavailable">The game server is unreachable. Switch to the demo sample to see how the board looks.</StateBox>
          : source === 'live' && live.loading && !live.data ? <StateBox kind="loading" title="Loading standings…" />
          : source === 'live' && live.error ? <StateBox kind="error" title="Couldn't load the leaderboard" action={<button className="btn btn-ghost btn-sm" onClick={live.reload}>Retry</button>}>{live.error}</StateBox>
          : rows.length === 0 ? <StateBox kind="empty" title={q ? 'No players match your search' : 'No ranked matches this season yet'}>{q ? 'Try another name or wallet prefix.' : 'Finish a match in the arena to appear here.'}</StateBox>
          : <LeaderTable rows={rows.map((r, i) => ({ ...r, rank: sort === 'rating' ? r.rank : i + 1 }))} highlight={me?.wallet} link={source === 'live'} />}
      </div>
    </div>
  );
}
