import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Flag, GraduationCap, Home, Inbox, Mail, ScanSearch, Users } from 'lucide-react';

const ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/queue', label: 'Needs review', icon: Inbox },
  { to: '/analyze', label: 'Check something', icon: ScanSearch },
  { to: '/forensics', label: 'Check an email', icon: Mail },
  { to: '/reports', label: 'Scam reports', icon: Flag },
  { to: '/education', label: 'Lessons', icon: GraduationCap },
  { to: '/users', label: 'People & data', icon: Users },
];

/** Floating glass dock at the bottom centre; a glass pill slides to the active page. */
export default function DockNav() {
  const { pathname } = useLocation();
  const barRef = useRef(null);
  const [pill, setPill] = useState(null);

  useLayoutEffect(() => {
    const place = () => {
      const bar = barRef.current;
      const active = bar?.querySelector('a.active');
      if (!bar || !active) { setPill(null); return; }
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pathname]);

  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-3">
      <div
        ref={barRef}
        className="dock pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pill && <span className="dock-pill" style={{ left: pill.left, width: pill.width }} aria-hidden />}
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
