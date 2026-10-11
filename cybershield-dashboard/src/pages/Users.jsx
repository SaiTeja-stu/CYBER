import { useEffect, useState, useCallback } from 'react';
import { Users as UsersIcon, Database, HardDrive, ShieldCheck, RefreshCw, AlertOctagon, FileText } from 'lucide-react';
import { api } from '../api.js';
import { Card, Spinner } from '../components/ui.jsx';

const fmtBytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const fmtTime = (t) => (t ? new Date(t.includes('T') ? t : t.replace(' ', 'T') + 'Z').toLocaleString() : '-');

export default function Users() {
  const [users, setUsers] = useState(null);
  const [store, setStore] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setErr('');
    setUsers(null);
    setStore(null);
    api.users().then(setUsers).catch((e) => setErr(e.message));
    api.storage().then(setStore).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white">
            <UsersIcon className="h-6 w-6 text-cyber-accent" /> People &amp; data
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Everyone who uses SecureMe, what they've done, and exactly where their data is kept.
            Emails and IP addresses are partly hidden. Passwords and one-time codes are never shown.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-soft">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          <AlertOctagon className="h-4 w-4 shrink-0" /> <span>{err}</span>
        </div>
      )}

      {/* Where the data lives */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recent data (database)" icon={Database}>
          {!store ? (
            <Spinner />
          ) : (
            <dl className="space-y-2 text-xs">
              <div><dt className="text-slate-400">Engine</dt><dd className="font-mono text-slate-100">{store.database.engine}</dd></div>
              <div><dt className="text-slate-400">File</dt><dd className="break-all font-mono text-cyan-300">{store.database.file}</dd></div>
              <div><dt className="text-slate-400">Size</dt><dd className="font-mono text-slate-100">{fmtBytes(store.database.sizeBytes)}</dd></div>
              <div><dt className="text-slate-400">Kept for</dt><dd className="font-mono text-slate-100">{store.database.retentionDays} days, then pruned</dd></div>
            </dl>
          )}
        </Card>
        <Card title="Older data (archive)" icon={HardDrive}>
          {!store ? (
            <Spinner />
          ) : (
            <dl className="space-y-2 text-xs">
              <div><dt className="text-slate-400">Format</dt><dd className="text-slate-100">{store.archive.format}</dd></div>
              <div><dt className="text-slate-400">Folder</dt><dd className="break-all font-mono text-cyan-300">{store.archive.directory}</dd></div>
              <div><dt className="text-slate-400">Files / size</dt><dd className="font-mono text-slate-100">{store.archive.files} files, {fmtBytes(store.archive.sizeBytes)}</dd></div>
            </dl>
          )}
        </Card>
        <Card title="How we protect privacy" icon={ShieldCheck}>
          {!store ? (
            <Spinner />
          ) : (
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-slate-300">
              {store.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="What's stored" icon={FileText}>
        {!store ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr className="border-b border-cyber-border/60">
                  <th className="py-2 pr-4 font-semibold">Where</th>
                  <th className="py-2 pr-4 font-semibold">How many</th>
                  <th className="py-2 font-semibold">What it holds</th>
                </tr>
              </thead>
              <tbody>
                {store.tables.map((t) => (
                  <tr key={t.table} className="border-b border-cyber-border/30 align-top">
                    <td className="py-2 pr-4 font-mono text-cyan-300">{t.table}</td>
                    <td className="py-2 pr-4 font-mono text-slate-100">{t.rows}</td>
                    <td className="py-2 text-slate-300">{t.holds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Users */}
      <Card title={`People${users ? ` (${users.total})` : ''}`} icon={UsersIcon}>
        {!users ? (
          <div className="flex h-24 items-center justify-center gap-2 text-slate-400">
            <Spinner /> <span className="text-sm">Loading people…</span>
          </div>
        ) : users.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Nobody has signed up yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="text-slate-400">
                <tr className="border-b border-cyber-border/60">
                  <th className="py-2 pr-3 font-semibold">ID</th>
                  <th className="py-2 pr-3 font-semibold">Username</th>
                  <th className="py-2 pr-3 font-semibold">Email</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Email verified</th>
                  <th className="py-2 pr-3 font-semibold">Terms accepted</th>
                  <th className="py-2 pr-3 font-semibold">Joined</th>
                  <th className="py-2 pr-3 font-semibold">Last sign-in</th>
                  <th className="py-2 pr-3 font-semibold">Checks</th>
                  <th className="py-2 font-semibold">Reports</th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((u) => (
                  <tr key={u.id} className="border-b border-cyber-border/30 align-top">
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">{u.id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 font-semibold text-slate-100">{u.username}</td>
                    <td className="py-2 pr-3 font-mono text-slate-300">{u.email}</td>
                    <td className="py-2 pr-3 text-cyan-300">{u.role.replace('ROLE_', '') === 'ADMIN' ? 'Admin' : 'User'}</td>
                    <td className="py-2 pr-3">{u.emailVerified ? <span className="text-emerald-400">Yes</span> : <span className="text-yellow-400">No</span>}</td>
                    <td className="py-2 pr-3 text-slate-300">{u.termsVersion ? `v${u.termsVersion}, ${fmtTime(u.termsAcceptedAt)}` : '-'}</td>
                    <td className="py-2 pr-3 text-slate-300">{fmtTime(u.createdAt)}</td>
                    <td className="py-2 pr-3 text-slate-300">{fmtTime(u.lastLoginAt)}<div className="font-mono text-[10px] text-slate-500">{u.lastLoginIp}</div></td>
                    <td className="py-2 pr-3 font-mono text-slate-100">{u.scans}</td>
                    <td className="py-2 font-mono text-slate-100">{u.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
