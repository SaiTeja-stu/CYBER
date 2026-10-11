import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

const WORK = [
  { to: '/', label: 'Home' },
  { to: '/queue', label: 'Needs review' },
  { to: '/analyze', label: 'Check something' },
  { to: '/reports', label: 'Scam reports' },
];
const MORE = [
  { to: '/forensics', label: 'Check an email' },
  { to: '/education', label: 'Lessons' },
  { to: '/users', label: 'People & data' },
];

export default function Footer() {
  return (
    <footer className="relative z-10 mx-auto mt-24 w-full max-w-7xl px-6 pb-36 pt-10 md:px-8">
      <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-cyber-accent">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-semibold">SecureMe Admin</span>
          </div>
          <p className="mt-3 max-w-sm text-2xl font-semibold leading-snug tracking-tight text-white">
            Helping people spot scams <span className="text-slate-500">before they lose a rupee.</span>
          </p>
        </div>

        <div>
          <div className="mb-4 text-xs font-semibold text-slate-400">Daily work</div>
          <ul className="space-y-3 text-sm text-slate-200">
            {WORK.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors hover:text-cyber-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-4 text-xs font-semibold text-slate-400">More</div>
          <ul className="space-y-3 text-sm text-slate-200">
            {MORE.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors hover:text-cyber-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-16 flex flex-col justify-between gap-2 border-t border-cyber-border pt-5 text-xs text-slate-500 md:flex-row">
        <span>© 2026 SecureMe · Admin dashboard</span>
        <span>Scam? Call 1930 or report at cybercrime.gov.in</span>
      </div>
    </footer>
  );
}
