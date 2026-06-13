import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import './AdminPanel.css';

interface AdminUser {
  id: string;
  email: string;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

interface PairInfo {
  symbol: string;
  timeframe: string;
  download_running: boolean;
  sufficient_data: boolean;
  earliest_ts: number | null;
  latest_ts: number | null;
  state: { backfill_complete?: boolean; total_candles?: number } | null;
}

interface SeedResult {
  upserted?: number;
  total?: number;
  skipped?: boolean;
  existing_candles?: number;
  error?: string;
}

const WATCHED_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTY100', 'BANKEX'];

interface Props {
  onClose: () => void;
}

export function AdminPanel({ onClose }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Data management state
  const [pairInfos, setPairInfos] = useState<Record<string, PairInfo | null>>({});
  const [pair1mInfos, setPair1mInfos] = useState<Record<string, PairInfo | null>>({});
  const [pairLoading, setPairLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResults, setSeedResults] = useState<Record<string, SeedResult> | null>(null);
  const [kiteSeeding, setKiteSeeding] = useState(false);
  const [kiteResults, setKiteResults] = useState<Record<string, SeedResult> | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'data'>('users');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchPairInfos = async () => {
    setPairLoading(true);
    const d: Record<string, PairInfo | null> = {};
    const m: Record<string, PairInfo | null> = {};
    await Promise.all([
      ...WATCHED_SYMBOLS.map(async (sym) => {
        try {
          const res = await apiFetch(`/api/historical/pair-info?symbol=${sym}&timeframe=1D`);
          d[sym] = res.ok ? await res.json() : null;
        } catch { d[sym] = null; }
      }),
      ...WATCHED_SYMBOLS.map(async (sym) => {
        try {
          const res = await apiFetch(`/api/historical/pair-info?symbol=${sym}&timeframe=1m`);
          m[sym] = res.ok ? await res.json() : null;
        } catch { m[sym] = null; }
      }),
    ]);
    setPairInfos(d);
    setPair1mInfos(m);
    setPairLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'data') fetchPairInfos();
  }, [activeTab]);

  const approve = async (id: string) => {
    setBusy(id);
    await apiFetch(`/api/admin/users/${id}/approve`, { method: 'POST' });
    await fetchUsers();
    setBusy(null);
  };

  const reject = async (id: string) => {
    setBusy(id);
    await apiFetch(`/api/admin/users/${id}/reject`, { method: 'POST' });
    await fetchUsers();
    setBusy(null);
  };

  const seedAllDaily = async (force = false) => {
    setSeeding(true);
    setSeedResults(null);
    try {
      const res = await apiFetch(`/api/historical/prefetch-yf?years=4${force ? '&force=true' : ''}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSeedResults(data.results ?? {});
      }
    } catch (err) {
      setSeedResults({ error: { error: String(err) } } as any);
    } finally {
      setSeeding(false);
      // Refresh pair info after seeding
      setTimeout(fetchPairInfos, 1000);
    }
  };

  const seedKite1m = async (symbol?: string) => {
    setKiteSeeding(true);
    setKiteResults(null);
    try {
      const url = symbol
        ? `/api/historical/prefetch-kite-1m?symbol=${symbol}&days=60`
        : `/api/historical/prefetch-kite-1m?days=60`;
      const res = await apiFetch(url, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setKiteResults(data.results ?? {});
      } else {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        setKiteResults({ _error: { error: err.detail || 'Failed' } } as any);
      }
    } catch (err) {
      setKiteResults({ _error: { error: String(err) } } as any);
    } finally {
      setKiteSeeding(false);
      setTimeout(fetchPairInfos, 1500);
    }
  };

  const pending = users.filter((u) => !u.approved && !u.is_admin);
  const approved = users.filter((u) => u.approved && !u.is_admin);
  const admins = users.filter((u) => u.is_admin);

  const fmtDate = (ts: number | null) => {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  return (
    <div className="admin-backdrop" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <div>
            <div className="admin-title">Admin Panel</div>
            <div className="admin-subtitle">
              {pending.length} pending · {approved.length} approved · {users.length} total users
            </div>
          </div>
          <button className="admin-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="admin-panel-tabs">
          <button
            className={`admin-panel-tab${activeTab === 'users' ? ' active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={`admin-panel-tab${activeTab === 'data' ? ' active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            Data Management
          </button>
        </div>

        {/* Users tab */}
        {activeTab === 'users' && (
          loading ? (
            <div className="admin-loading">Loading users…</div>
          ) : (
            <div className="admin-body">
              {pending.length > 0 && (
                <section>
                  <div className="admin-section-title pending-title">
                    ⏳ Pending Approval ({pending.length})
                  </div>
                  {pending.map((u) => (
                    <div key={u.id} className="admin-row">
                      <div className="admin-user-info">
                        <span className="admin-email">{u.email}</span>
                        <span className="admin-date">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div className="admin-actions">
                        <button
                          className="admin-btn approve"
                          onClick={() => approve(u.id)}
                          disabled={busy === u.id}
                        >
                          {busy === u.id ? '…' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {approved.length > 0 && (
                <section>
                  <div className="admin-section-title approved-title">
                    ✓ Approved Users ({approved.length})
                  </div>
                  {approved.map((u) => (
                    <div key={u.id} className="admin-row">
                      <div className="admin-user-info">
                        <span className="admin-email">{u.email}</span>
                        <span className="admin-date">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div className="admin-actions">
                        <button
                          className="admin-btn revoke"
                          onClick={() => reject(u.id)}
                          disabled={busy === u.id}
                        >
                          {busy === u.id ? '…' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {admins.length > 0 && (
                <section>
                  <div className="admin-section-title admin-title-row">
                    ★ Admins
                  </div>
                  {admins.map((u) => (
                    <div key={u.id} className="admin-row">
                      <div className="admin-user-info">
                        <span className="admin-email">{u.email}</span>
                        <span className="admin-badge">Admin</span>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {users.length === 0 && (
                <div className="admin-empty">No users registered yet.</div>
              )}
            </div>
          )
        )}

        {/* Data Management tab */}
        {activeTab === 'data' && (
          <div className="admin-body">
            <section>
              <div className="admin-section-title" style={{ color: '#60a5fa' }}>
                1D Historical Data (Yahoo Finance)
              </div>
              <div className="admin-data-hint">
                Downloads 4 years of daily candles via Yahoo Finance — no Upstox auth needed.
                Skips symbols that already have sufficient data.
              </div>
              <div className="admin-data-actions">
                <button
                  className="admin-btn approve"
                  style={{ padding: '6px 16px' }}
                  onClick={() => seedAllDaily(false)}
                  disabled={seeding}
                >
                  {seeding ? 'Downloading…' : 'Download Missing 1D Data'}
                </button>
                <button
                  className="admin-btn"
                  style={{ padding: '6px 14px', marginLeft: 8 }}
                  onClick={() => seedAllDaily(true)}
                  disabled={seeding}
                >
                  Force Re-download All
                </button>
                <button
                  className="admin-btn"
                  style={{ padding: '6px 12px', marginLeft: 8, opacity: 0.7 }}
                  onClick={fetchPairInfos}
                  disabled={pairLoading}
                >
                  Refresh
                </button>
              </div>

              {/* Seed results */}
              {seedResults && (
                <div className="admin-seed-results">
                  {Object.entries(seedResults).map(([sym, r]) => (
                    <div key={sym} className="admin-seed-row">
                      <span className="admin-seed-sym">{sym}</span>
                      {r.error ? (
                        <span className="admin-seed-err">Error: {r.error}</span>
                      ) : r.skipped ? (
                        <span className="admin-seed-skip">Already had {r.existing_candles} candles — skipped</span>
                      ) : (
                        <span className="admin-seed-ok">+{r.upserted} new → {r.total} total candles</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Kite 1m section */}
            <section>
              <div className="admin-section-title" style={{ color: '#f59e0b' }}>
                1m Intraday Data (Zerodha Kite — 60 days)
              </div>
              <div className="admin-data-hint">
                Downloads up to 60 days of 1-minute candles via Kite API.
                Requires Zerodha Kite login. No source provides multi-year 1m data.
              </div>
              <div className="admin-data-actions">
                <button
                  className="admin-btn"
                  style={{ padding: '6px 16px', borderColor: '#f59e0b', color: '#f59e0b' }}
                  onClick={() => seedKite1m('BANKNIFTY')}
                  disabled={kiteSeeding}
                >
                  {kiteSeeding ? 'Downloading…' : 'BANKNIFTY 1m'}
                </button>
                <button
                  className="admin-btn"
                  style={{ padding: '6px 16px', marginLeft: 8, borderColor: '#f59e0b', color: '#f59e0b' }}
                  onClick={() => seedKite1m('BANKEX')}
                  disabled={kiteSeeding}
                >
                  {kiteSeeding ? 'Downloading…' : 'BANKEX 1m'}
                </button>
                <button
                  className="admin-btn"
                  style={{ padding: '6px 14px', marginLeft: 8 }}
                  onClick={() => seedKite1m()}
                  disabled={kiteSeeding}
                >
                  All Symbols 1m
                </button>
              </div>
              {kiteResults && (
                <div className="admin-seed-results">
                  {Object.entries(kiteResults).map(([sym, r]) => (
                    <div key={sym} className="admin-seed-row">
                      <span className="admin-seed-sym">{sym}</span>
                      {r.error ? (
                        <span className="admin-seed-err">Error: {r.error}</span>
                      ) : (
                        <span className="admin-seed-ok">+{r.upserted} new → {r.total} total candles</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="admin-section-title" style={{ color: '#a78bfa' }}>
                Symbol Status
              </div>
              {pairLoading ? (
                <div className="admin-loading" style={{ padding: '12px 20px' }}>Checking…</div>
              ) : (
                <>
                  <div className="admin-data-hint" style={{ paddingTop: 0 }}>1D (Yahoo Finance)</div>
                  <div className="admin-status-grid">
                    {WATCHED_SYMBOLS.map((sym) => {
                      const info = pairInfos[sym];
                      const candles = info?.state?.total_candles ?? 0;
                      const ok = info?.sufficient_data;
                      const running = info?.download_running;
                      return (
                        <div key={sym} className={`admin-status-card${ok ? ' ok' : ' missing'}`}>
                          <div className="admin-status-sym">{sym}</div>
                          <div className="admin-status-detail">
                            {info == null ? (
                              <span className="admin-seed-err">API error</span>
                            ) : running ? (
                              <span className="admin-seed-skip">Downloading…</span>
                            ) : ok ? (
                              <>
                                <span className="admin-seed-ok">{candles} candles</span>
                                <span className="admin-status-dates">
                                  {fmtDate(info.earliest_ts)} – {fmtDate(info.latest_ts)}
                                </span>
                              </>
                            ) : (
                              <span className="admin-seed-err">
                                {candles > 0 ? `Only ${candles} candles` : 'No data'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="admin-data-hint" style={{ paddingTop: 8 }}>1m (Kite)</div>
                  <div className="admin-status-grid">
                    {WATCHED_SYMBOLS.map((sym) => {
                      const info = pair1mInfos[sym];
                      const candles = info?.state?.total_candles ?? 0;
                      const ok = (candles ?? 0) > 100;
                      const running = info?.download_running;
                      return (
                        <div key={sym} className={`admin-status-card${ok ? ' ok' : ' missing'}`}>
                          <div className="admin-status-sym">{sym}</div>
                          <div className="admin-status-detail">
                            {info == null ? (
                              <span className="admin-seed-err">No data</span>
                            ) : running ? (
                              <span className="admin-seed-skip">Downloading…</span>
                            ) : ok ? (
                              <>
                                <span className="admin-seed-ok">{candles} candles</span>
                                <span className="admin-status-dates">
                                  {fmtDate(info.earliest_ts)} – {fmtDate(info.latest_ts)}
                                </span>
                              </>
                            ) : (
                              <span className="admin-seed-err">
                                {candles > 0 ? `Only ${candles} candles` : 'No data'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
