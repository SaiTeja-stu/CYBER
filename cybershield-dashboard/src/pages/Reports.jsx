import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, CheckCircle, XCircle, AlertOctagon, RefreshCw, FileText } from 'lucide-react';
import { api } from '../api.js';
import { Spinner } from '../components/ui.jsx';

const TABS = [
  { id: 'PENDING', label: 'Waiting for review' },
  { id: 'CONFIRMED', label: 'Confirmed scams' },
  { id: 'REJECTED', label: 'Not scams' },
  { id: '', label: 'All reports' },
];

export default function Reports() {
  const [tab, setTab] = useState('PENDING');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setData(null);
    api.reports(tab).then(setData).catch((e) => setErr(e.message));
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, kind) {
    setBusyId(id);
    try {
      kind === 'confirm' ? await api.confirmReport(id) : await api.rejectReport(id);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ShieldAlert className="h-6 w-6 text-cyber-accent" /> Scam reports
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Scams that people reported from the app. When you confirm one, it's blocked for everyone straight away.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-soft">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Tabs Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-cyber-border bg-cyber-panel/60 p-2">
        {TABS.map((t) => (
          <button
            key={t.id || 'all'}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              tab === t.id
                ? 'bg-cyber-accent/20 text-cyber-accent border border-cyber-accent/40 shadow-cyber-glow'
                : 'text-slate-400 hover:bg-cyber-border/40 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400 flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {!data && (
        <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
          <Spinner /> <span className="text-sm">Loading reports…</span>
        </div>
      )}

      {/* Report Cards Grid */}
      <div className="space-y-4">
        {data?.items?.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-cyber-border bg-cyber-panel/40 p-8 text-center text-slate-500">
            <FileText className="h-8 w-8 text-slate-600" />
            <p className="text-sm font-medium">Nothing here right now. Nice!</p>
          </div>
        )}

        {data?.items?.map((r) => {
          const isPending = r.status === 'PENDING';
          const isConfirmed = r.status === 'CONFIRMED';
          const isRejected = r.status === 'REJECTED';

          return (
            <div
              key={r.id}
              className="glass-card rounded-2xl p-5 border border-cyber-border/80 space-y-3 transition-all hover:border-cyber-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyber-accent/10 px-2.5 py-1 text-xs font-semibold text-cyber-accent">
                    {r.type}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isConfirmed
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30 shadow-rose-glow'
                        : isRejected
                        ? 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                    }`}
                  >
                    {isConfirmed ? 'Confirmed scam' : isRejected ? 'Not a scam' : 'Waiting for review'}
                  </span>
                  {r.indicatorType && (
                    <span className="text-xs text-slate-300 bg-cyber-dark/80 px-2 py-0.5 rounded-full border border-cyber-border">
                      {r.indicatorType}: <strong className="text-cyan-300">{r.indicatorValue}</strong>
                    </span>
                  )}
                </div>

                <time className="text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleString()}
                </time>
              </div>

              {/* Payload Snippet */}
              <div className="rounded-xl border border-cyber-border bg-cyber-dark/80 p-3.5 text-sm text-slate-200 break-all leading-relaxed">
                {r.snippet || "The reporter didn't include the message."}
              </div>

              {r.note && (
                <div className="text-sm text-slate-400 italic">
                  What they said: &quot;{r.note}&quot;
                </div>
              )}

              {/* Action Buttons for Pending items */}
              {isPending && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => act(r.id, 'confirm')}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyber-rose px-4 py-2 text-sm font-semibold text-paper shadow-rose-glow transition hover:-translate-y-px disabled:opacity-50"
                  >
                    {busyId === r.id ? <Spinner className="h-3.5 w-3.5 !text-paper" /> : <CheckCircle className="h-4 w-4" />}
                    Yes, it's a scam: block it
                  </button>
                  <button type="button" onClick={() => act(r.id, 'reject')} disabled={busyId === r.id} className="btn-soft disabled:opacity-50">
                    {busyId === r.id ? <Spinner className="h-3.5 w-3.5" /> : <XCircle className="h-4 w-4" />}
                    Not a scam
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
