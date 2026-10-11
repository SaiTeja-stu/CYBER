import { useState } from 'react';
import { Lock, User, ArrowRight, AlertOctagon, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Spinner } from '../components/ui.jsx';
import SpecularButton from '../components/SpecularButton.jsx';
import Aurora from '../components/Aurora.jsx';
import { ThemeToggle } from '../theme.jsx';
import logoImg from '../assets/logo.png';

const field =
  'w-full rounded-xl border border-cyber-border bg-cyber-card pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-cyber-accent focus:ring-2 focus:ring-cyber-accent/20';

export default function Login() {
  const { login, error } = useAuth();
  const [loginId, setLoginId] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [note, setNote] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setNote('');
    if (forgot) {
      try {
        const r = await api.forgotPassword(loginId.trim());
        setNote(r.message || "If that email is registered, we've sent a reset code to it.");
      } catch {
        setNote("We couldn't send a reset code just now. Please try again in a minute.");
      }
    } else {
      await login(loginId, password);
    }
    setBusy(false);
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-cyber-dark px-4">
      <Aurora />
      <div className="absolute right-5 top-5 z-20">
        <ThemeToggle />
      </div>

      <form onSubmit={submit} className="glass-card rise-in relative z-10 w-full max-w-md space-y-6 rounded-3xl p-8 hover:translate-y-0">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="SecureMe" className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-cyber-border" />
            <div className="leading-tight">
              <div className="text-lg font-bold tracking-tight text-white">
                Secure<span className="text-cyber-accent">Me</span>
              </div>
              <div className="text-xs font-medium text-slate-400">Admin dashboard</div>
            </div>
          </div>
          <div>
            <h1 className="text-3xl text-white">{forgot ? 'Reset your password' : 'Welcome back'}</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {forgot
                ? "Enter your account email and we'll send you a code."
                : 'Sign in to review reports and keep people safe from scams.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">{forgot ? 'Email' : 'Username or email'}</label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className={field}
                autoComplete="username"
                placeholder={forgot ? 'you@example.com' : 'admin or you@example.com'}
              />
            </div>
          </div>

          {!forgot && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={field}
                  autoComplete="current-password"
                  placeholder="Your password"
                />
              </div>
            </div>
          )}
        </div>

        {error && !forgot && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {note && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{note}</span>
          </div>
        )}

        <SpecularButton type="submit" disabled={busy} size="lg" radius={14} className="w-full">
          {busy ? <Spinner className="h-4 w-4" /> : null}
          <span>{busy ? (forgot ? 'Sending…' : 'Signing in…') : forgot ? 'Send reset code' : 'Sign in'}</span>
          {!busy && <ArrowRight className="h-4 w-4" />}
        </SpecularButton>

        <button
          type="button"
          onClick={() => {
            setForgot(!forgot);
            setNote('');
          }}
          className="w-full text-center text-sm font-medium text-slate-400 transition-colors hover:text-cyber-accent"
        >
          {forgot ? '← Back to sign in' : 'Forgot your password?'}
        </button>

        <div className="flex items-center justify-center gap-1.5 border-t border-cyber-border pt-4 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-cyber-accent" />
          Part of SecureMe, keeping people safe from scams
        </div>
      </form>
    </div>
  );
}
