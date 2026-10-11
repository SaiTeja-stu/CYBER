import { checkServerHealth, getSettings, login, logout, setSettings } from './api';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setStatus(msg: string, ok: boolean) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'ok' : 'err');
}

function setServerStatus(msg: string, ok: boolean) {
  const el = $('serverStatus');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'ok' : 'err');
}

async function refresh() {
  const s = await getSettings();
  ($('baseUrl') as HTMLInputElement).value = s.baseUrl;
  setStatus(s.token ? "You're signed in. Cloud threat intelligence is active." : "You're not signed in yet.", !!s.token);
}

$('saveUrl').addEventListener('click', async () => {
  const url = ($('baseUrl') as HTMLInputElement).value.trim();
  if (!/^https?:\/\//.test(url)) {
    setServerStatus('The address should start with https:// (or http://).', false);
    return;
  }
  await setSettings({ baseUrl: url });
  setServerStatus('Address saved.', true);
});

$('testUrl').addEventListener('click', async () => {
  const btn = $('testUrl') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  setServerStatus('Checking server health…', true);

  const res = await checkServerHealth(8000);
  btn.disabled = false;
  btn.textContent = 'Test connection';

  if (res.reachable) {
    setServerStatus('✓ Server is UP and reachable.', true);
  } else {
    setServerStatus(`✕ Unable to reach server: ${res.details || 'Network error'}`, false);
  }
});

$('login').addEventListener('click', async () => {
  const username = ($('username') as HTMLInputElement).value.trim();
  const password = ($('password') as HTMLInputElement).value;
  if (!username || !password) {
    setStatus('Please enter your username and password.', false);
    return;
  }
  const btn = $('login') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    await login(username, password);
    ($('password') as HTMLInputElement).value = '';
    setStatus("You're signed in. Server checks are active.", true);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "We couldn't sign you in. Please try again.", false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('logout').addEventListener('click', async () => {
  await logout();
  setStatus("You've signed out. Pages are checked locally in your browser.", true);
});

refresh();
