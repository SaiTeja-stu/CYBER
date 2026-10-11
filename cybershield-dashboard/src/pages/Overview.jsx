import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Activity, FileText, AlertOctagon, TrendingUp, Layers, ArrowUpRight } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api.js';
import { Card, StatWidget, BarList, Spinner } from '../components/ui.jsx';
import ParticleOrb from '../components/ParticleOrb.jsx';

const PIE_COLORS = ['#ff6b00', '#22c55e', '#3b82f6', '#a855f7', '#eab308', '#94a3b8'];

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="rounded-xl border border-cyber-border bg-slate-950/95 p-3 text-xs shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-bold text-slate-100">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: data.color || data.payload.fill }} />
          <span>{data.name}</span>
        </div>
        <div className="mt-1 font-semibold text-cyber-accent">{data.value} checks</div>
      </div>
    );
  }
  return null;
};

function Hero() {
  return (
    <section className="relative mb-10 flex min-h-[440px] items-center md:min-h-[500px]">
      <ParticleOrb className="absolute inset-0 h-full w-full" />
      <div className="rise-in relative z-10 max-w-xl rounded-3xl border border-white/10 bg-paper/30 p-6 shadow-[0_8px_32px_rgb(0_0_0/0.06)] backdrop-blur-md md:p-8">

        <div className="label-mono mb-4">Overview</div>
        <h1 className="display">
          Stopping scams
          <br />
          <span className="dim">before they reach people.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">
          Every check from the SecureMe app, browser extension and this dashboard, plus the scams people report to us, in one place.
        </p>
        <Link to="/analyze" className="pill-cta mt-8">
          Check something now
          <span className="dot">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </section>
  );
}

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.stats(), api.trends()])
      .then(([s, t]) => {
        setStats(s);
        setTrends(t);
      })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <>
      <Hero />
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-400 flex items-center gap-3">
        <AlertOctagon className="h-6 w-6 shrink-0" />
        <div>
          <h4 className="font-bold">We couldn't load the latest numbers</h4>
          <p className="text-sm">{err}</p>
        </div>
      </div>
      </>
    );
  }

  if (!stats || !trends) {
    return (
      <>
      <Hero />
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
        <Spinner className="h-8 w-8" />
        <span className="text-sm text-slate-500">
          Loading the latest numbers…
        </span>
      </div>
      </>
    );
  }

  const lvl = stats.scansByRiskLevel || {};
  const perDay = Object.entries(trends.perDay || {}).map(([label, count]) => ({ label, count }));
  const perType = Object.entries(stats.scansByContentType || {}).map(([label, count]) => ({ label, count }));

  // Pie chart formatted data
  const riskPieData = [
    { name: 'Scam', value: lvl.MALICIOUS || 0, fill: '#ff5c66' },
    { name: 'High risk', value: lvl.HIGH_RISK || 0, fill: '#ff9f43' },
    { name: 'Suspicious', value: lvl.SUSPICIOUS || 0, fill: '#f5d547' },
    { name: 'Safe', value: lvl.SAFE || 0, fill: '#22c55e' },
  ].filter(d => d.value > 0);

  const typePieData = perType.map((item, idx) => ({
    name: item.label,
    value: item.count,
    fill: PIE_COLORS[idx % PIE_COLORS.length],
  }));

  return (
    <div className="space-y-10">
      <Hero />

      <div>
        <div className="label-mono mb-2">At a glance</div>
        <h2 className="display text-[clamp(1.8rem,3.4vw,2.8rem)]">
          What's happening <span className="dim">right now</span>
        </h2>
      </div>

      {/* Hero Stat Grid */}
      <div className="tile-cycle grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatWidget
          label="Checks so far"
          value={stats.totalScans}
          icon={Activity}
          subtext="Links, messages, QR codes and emails"
        />
        <StatWidget
          label="Checks this week"
          value={stats.scansLast7Days}
          tone="text-cyber-accent"
          icon={TrendingUp}
          subtext="In the last 7 days"
        />
        <StatWidget
          label="Reports to review"
          value={stats.reportsPending}
          tone="text-yellow-400"
          icon={FileText}
          subtext="Waiting for someone to look"
        />
        <StatWidget
          label="Scams confirmed"
          value={stats.reportsConfirmed}
          tone="text-red-400"
          icon={ShieldAlert}
          subtext="Now blocked for everyone"
        />
      </div>

      {/* Analytics Grid Row 1: Interactive Pie Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="How risky were the checks?" icon={ShieldAlert}>
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  isAnimationActive={true}
                >
                  {riskPieData.map((entry, index) => (
                    <Cell key={`risk-cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs font-semibold text-slate-300">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="What people checked" icon={Layers}>
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  isAnimationActive={true}
                >
                  {typePieData.map((entry, index) => (
                    <Cell key={`type-cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs font-semibold text-slate-300">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Analytics Grid Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Checks per day" icon={Activity}>
          <div className="pt-2">
            <BarList items={perDay} />
          </div>
        </Card>

        <Card title="Most common warning signs" icon={AlertOctagon}>
          <div className="pt-2">
            <BarList items={(trends.topSignals || []).map((s) => ({ label: s.label, count: s.count }))} />
          </div>
        </Card>
      </div>

      {/* Top Scam Categories */}
      <Card title="Most common kinds of scam" icon={FileText}>
        <div className="pt-2">
          <BarList items={(trends.topCategories || []).map((c) => ({ label: c.label, count: c.count }))} />
        </div>
      </Card>
    </div>
  );
}
