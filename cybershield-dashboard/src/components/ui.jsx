import { ShieldAlert, AlertTriangle, HelpCircle, ShieldCheck, Loader2 } from 'lucide-react';

export const LEVEL_META = {
  MALICIOUS: {
    label: 'Scam',
    priority: 'P1',
    icon: ShieldAlert,
    badgeCls: 'bg-cyber-rose/10 text-cyber-rose border-cyber-rose/30 shadow-rose-glow',
    dotCls: 'bg-cyber-rose',
    barCls: 'bg-cyber-rose',
    color: '#ff5c66',
  },
  HIGH_RISK: {
    label: 'High risk',
    priority: 'P2',
    icon: AlertTriangle,
    badgeCls: 'bg-cyber-amber/10 text-cyber-amber border-cyber-amber/30 shadow-amber-glow',
    dotCls: 'bg-cyber-amber',
    barCls: 'bg-cyber-amber',
    color: '#ff9f43',
  },
  SUSPICIOUS: {
    label: 'Suspicious',
    priority: 'P3',
    icon: HelpCircle,
    badgeCls: 'bg-cyber-yellow/10 text-cyber-yellow border-cyber-yellow/30',
    dotCls: 'bg-cyber-yellow',
    barCls: 'bg-cyber-yellow',
    color: '#f5d547',
  },
  SAFE: {
    label: 'Safe',
    priority: 'P4',
    icon: ShieldCheck,
    badgeCls: 'bg-cyber-emerald/10 text-cyber-emerald border-cyber-emerald/30 shadow-emerald-glow',
    dotCls: 'bg-cyber-emerald',
    barCls: 'bg-cyber-emerald',
    color: '#63e31a',
  },
};

export function RiskBadge({ level, showPriority = false }) {
  const m = LEVEL_META[level] || LEVEL_META.SAFE;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${m.badgeCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dotCls} animate-cyber-pulse`} />
      {showPriority && <span className="font-mono text-[11px] opacity-80">{m.priority}</span>}
      <Icon className="h-3.5 w-3.5" />
      <span>{m.label}</span>
    </span>
  );
}

export function ScoreRing({ score, size = 'md' }) {
  const color = score >= 75 ? '#ff5c66' : score >= 50 ? '#ff9f43' : score >= 25 ? '#f5d547' : '#63e31a';
  const dim = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-10 w-10' : 'h-16 w-16';
  const strokeWidth = size === 'lg' ? 3.5 : 3;
  const textCls = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-xs' : 'text-base';

  return (
    <div className={`relative ${dim} shrink-0 flex items-center justify-center`}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90 transform filter drop-shadow">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(var(--border))" strokeWidth={strokeWidth} />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 97.4} 97.4`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono font-bold tracking-tight text-white ${textCls}`}>{score}</span>
        {size === 'lg' && <span className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Risk</span>}
      </div>
    </div>
  );
}

export function Card({ title, children, right, icon: Icon, className = '' }) {
  return (
    <div className={`glass-card rounded-2xl p-5 ${className}`}>
      {(title || right || Icon) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {Icon && (<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyber-accent/10 text-cyber-accent"><Icon className="h-4 w-4" /></span>)}
            {title && <h3 className="text-[15px] font-semibold tracking-tight text-white">{title}</h3>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatWidget({ label, value, tone, subtext, icon: Icon }) {
  return (
    <div className="glass-card relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-slate-400">{label}</div>
          <div className={`mt-2 text-4xl font-bold tracking-tight ${tone || 'text-white'}`}>
            {value ?? 0}
          </div>
          {subtext && <div className="mt-1 text-xs text-slate-400 font-medium">{subtext}</div>}
        </div>
        {Icon && (
          <div className="rounded-2xl bg-cyber-accent/10 p-2.5 text-cyber-accent">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {/* Decorative subtle ambient glow */}
      <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-cyber-accent/5 blur-xl pointer-events-none" />
    </div>
  );
}

export function BarList({ items = [], max }) {
  const top = max || Math.max(1, ...items.map((i) => i.count ?? i.value ?? 0));
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="py-4 text-center text-xs text-slate-500">Nothing here yet.</p>}
      {items.map((i, idx) => {
        const v = i.count ?? i.value ?? 0;
        const pct = Math.round((v / top) * 100);
        return (
          <div key={idx} className="group relative flex flex-col gap-1 rounded-lg p-1.5 transition-colors hover:bg-cyber-border/30">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-medium text-slate-300 group-hover:text-cyber-accent transition-colors" title={i.label}>
                {i.label}
              </span>
              <span className="font-semibold tabular-nums text-slate-200">{v}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyber-border/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyber-accent to-cyber-indigo transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-cyber-accent ${className}`} />;
}
