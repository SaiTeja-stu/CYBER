import { useState, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from './auth.jsx';
import { ThemeToggle } from './theme.jsx';
import Login from './pages/Login.jsx';
import Reset from './pages/Reset.jsx';
import Overview from './pages/Overview.jsx';
import Queue from './pages/Queue.jsx';
import AnalyzeConsole from './pages/AnalyzeConsole.jsx';
import EmailForensics from './pages/EmailForensics.jsx';
import Reports from './pages/Reports.jsx';
import Education from './pages/Education.jsx';
import Users from './pages/Users.jsx';
import Aurora from './components/Aurora.jsx';
import DockNav from './components/DockNav.jsx';
import Footer from './components/Footer.jsx';
import logoImg from './assets/logo.png';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Shell({ children }) {
  const { logout } = useAuth();
  const location = useLocation();
  const [hello, setHello] = useState(greeting);

  useEffect(() => {
    const timer = setInterval(() => setHello(greeting()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden bg-cyber-dark text-slate-100">
      <Aurora />

      {/* Top bar: brand + greeting on the left, theme switch and sign-out on the right */}
      <header className="relative z-30 flex h-20 items-center justify-between gap-4 px-5 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <img src={logoImg} alt="SecureMe" className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-cyber-border" />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold tracking-tight text-white">
                Secure<span className="text-cyber-accent">Me</span>
              </span>
              <span className="rounded-full bg-cyber-accent/10 px-2 py-0.5 text-[11px] font-semibold text-cyber-accent">Admin</span>
            </div>
            <div className="hidden truncate text-xs text-slate-400 sm:block">{hello}, here's how people are staying safe.</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <button type="button" onClick={logout} className="pill-ghost">
            <span className="hidden sm:inline">Sign out</span>
            <span className="dot">
              <LogOut className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 pt-2 md:px-8">{children}</main>

      <Footer />
      <DockNav />
    </div>
  );
}

export default function App() {
  const { isAuthed } = useAuth();
  const { pathname } = useLocation();

  if (pathname === '/reset') return <Reset />;
  if (!isAuthed) return <Login />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/analyze" element={<AnalyzeConsole />} />
        <Route path="/forensics" element={<EmailForensics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/education" element={<Education />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
