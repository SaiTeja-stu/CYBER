import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Search, ListFilter, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { api } from '../api.js';
import { RiskBadge, ScoreRing, Spinner } from '../components/ui.jsx';

const FILTERS = [
  { id: '', label: 'Everything' },
  { id: 'MALICIOUS', label: 'Scams' },
  { id: 'HIGH_RISK', label: 'High risk' },
  { id: 'SUSPICIOUS', label: 'Suspicious' },
  { id: 'SAFE', label: 'Safe' },
];

export default function Queue() {
  const [level, setLevel] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .recentScans(level ? `?level=${level}&size=50` : '?size=50')
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [level]);

  useEffect(() => {
    load();
  }, [load]);

  const items = (data?.items || []).filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (item.snippet && item.snippet.toLowerCase().includes(q)) ||
      (item.type && item.type.toLowerCase().includes(q)) ||
      (item.reportId && item.reportId.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ListFilter className="h-6 w-6 text-cyber-accent" /> Needs review
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            The latest things people checked, riskiest first. Tap one to see the details.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-cyber-border bg-cyber-card/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:border-cyber-accent hover:bg-cyber-border/40 disabled:opacity-50 shadow-cyber-glow"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyber-accent' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-cyber-border bg-cyber-panel/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Severity Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setLevel(f.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                level === f.id
                  ? 'bg-cyber-accent/20 text-cyber-accent border border-cyber-accent/40 shadow-cyber-glow'
                  : 'text-slate-400 hover:bg-cyber-border/40 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by text, type or ID…"
            className="w-full rounded-xl border border-cyber-border bg-cyber-dark/80 pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyber-accent focus:ring-1 focus:ring-cyber-accent"
          />
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">{err}</div>
      )}

      {loading && !data && (
        <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
          <Spinner /> <span className="text-sm">Loading the latest checks…</span>
        </div>
      )}

      {/* Queue Item List */}
      <div className="space-y-3">
        {!loading && items.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-cyber-border bg-cyber-panel/40 p-8 text-center text-slate-500">
            <ShieldAlert className="h-8 w-8 text-slate-600" />
            <p className="text-sm font-medium">Nothing to review here right now.</p>
            <p className="text-xs">New checks from the app and this dashboard will show up here.</p>
          </div>
        )}

        {items.map((s) => {
          const isExpanded = expandedId === s.reportId;
          return (
            <div
              key={s.reportId}
              className={`glass-card overflow-hidden rounded-2xl border transition-all ${
                isExpanded ? 'border-cyber-accent/50 bg-cyber-card/90 shadow-cyber-glow' : 'border-cyber-border/70'
              }`}
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : s.reportId)}
                className="flex cursor-pointer items-center gap-4 p-4"
              >
                <ScoreRing score={s.riskScore} size="md" />

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={s.riskLevel} />
                    <span className="rounded-lg border border-cyber-border bg-cyber-dark/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-300">
                      {s.type}
                    </span>
                    <span className="text-xs text-slate-400">{s.confidence}% sure</span>
                  </div>
                  <p className="truncate font-mono text-xs text-slate-200" title={s.snippet}>
                    {s.snippet || 'No preview available'}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 text-right">
                  <time className="font-mono text-[11px] text-slate-400">
                    {new Date(s.analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-cyber-accent hover:underline">
                    {isExpanded ? 'Hide details' : 'Details'} <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
              </div>

              {/* Expanded Inspection Drawer */}
              {isExpanded && (
                <div className="border-t border-cyber-border/60 bg-cyber-dark/60 p-4 text-sm space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs text-slate-400">
                    <div>
                      <span className="block text-slate-500">Reference</span>
                      <span className="text-slate-200">{s.reportId}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500">From a verified sender?</span>
                      <span className={s.verified ? 'text-emerald-400' : 'text-slate-400'}>
                        {s.verified ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Asks for a payment?</span>
                      <span className={s.initiatesPayment ? 'text-amber-400' : 'text-slate-400'}>
                        {s.initiatesPayment ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Checked at</span>
                      <span className="text-slate-200">{new Date(s.analyzedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-slate-500 mb-1">What was checked</span>
                    <div className="rounded-xl border border-cyber-border bg-cyber-panel/90 p-3 text-slate-200 whitespace-pre-wrap break-all">
                      {s.snippet}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
