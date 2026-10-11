import type { CsMessage, ExtensionVerdict, PageContext, PageVerdict } from './types';

const MAX_HTML = 60_000;

function pageContext(): PageContext {
  const selection = (window.getSelection()?.toString() || '').trim();
  let html = '';
  try {
    html = document.documentElement.outerHTML.slice(0, MAX_HTML);
  } catch {
    html = '';
  }
  return {
    url: location.href,
    title: document.title,
    html,
    selection,
    linkCount: document.querySelectorAll('a[href]').length,
  };
}

const send = <T>(msg: unknown): Promise<T | null> =>
  new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime?.lastError ? null : (res as T)));
    } catch {
      resolve(null);
    }
  });

async function isHostAllowed(): Promise<boolean> {
  const res = await send<{ allowed: boolean }>({ kind: 'CHECK_HOST_ALLOWED', hostname: location.hostname });
  return Boolean(res?.allowed);
}

async function allowHostNow(): Promise<void> {
  await send({ kind: 'SET_HOST_ALLOWED', hostname: location.hostname });
}

async function showWarning(verdict: ExtensionVerdict, score: number, reasons: string[]): Promise<void> {
  if (await isHostAllowed() || document.getElementById('cybershield-warning')) return;
  const severe = verdict === 'UNSAFE' || verdict === 'FRAUD';
  if (!severe) return; // Do not show full-page modal on unverified or safe pages

  const host = document.createElement('div');
  host.id = 'cybershield-warning';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  const title = verdict === 'UNSAFE' ? 'Unsafe Technical Threat Detected' : 'Scam or Impersonation Alert';
  root.innerHTML = `
    <style>
      :host{--bg:rgba(13,17,23,.94);--card:#161b22;--ink:#f0f6fc;--muted:#8b949e;--border:#30363d;--safe:#238636;--safe2:#2ea043;--on:#fff;--danger:#f85149;--warn:#d29922;--bar:#21262d}
      *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
      .wrap{pointer-events:auto;position:fixed}
      .full{inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
      .card{max-width:520px;margin:16px;padding:28px;border-radius:16px;background:var(--card);border:1px solid var(--border);color:var(--ink);box-shadow:0 24px 60px rgba(0,0,0,.4)}
      .icon{width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;background:rgba(248,81,73,0.15);color:var(--danger);margin-bottom:16px}
      h1{margin:0 0 6px;font-size:22px;letter-spacing:-.02em;color:var(--ink)}
      .score{font-size:13px;color:var(--muted);margin-bottom:16px}
      .score b{color:var(--danger)}
      .why-title{font-size:13px;font-weight:600;color:var(--muted);margin:0 0 6px}
      ul{padding-left:20px;margin:0 0 22px;line-height:1.55;font-size:13px}
      button{cursor:pointer;border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;margin:0 8px 8px 0}
      .safe{background:#238636;color:var(--on)}
      .safe:hover{background:#2ea043}
      .go{background:transparent;color:var(--muted);border:1px solid var(--border)}
      .go:hover{color:var(--ink);border-color:var(--muted)}
      .bar{position:fixed;top:0;left:0;right:0;background:var(--bar);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}
      .pw-box{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
      input{background:#0d1117;border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--ink);font-size:13px}
    </style>
    <div class="wrap full">
      <div class="card">
        <div class="icon">⚠️</div>
        <h1>${title}</h1>
        <div class="score">CyberShield Risk Score: <b>${score} / 100</b></div>
        <div class="why-title">Evidence Identified:</div>
        <ul>${reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
        <div>
          <button id="leave" class="safe">Leave this site (Recommended)</button>
          <button id="proceed" class="go">Proceed anyway</button>
        </div>
        <div id="pwForm" style="display:none;" class="pw-box">
          <input type="password" id="pw" placeholder="Override password" />
          <button id="unlock" class="go">Unlock</button>
          <div id="msg" style="color:var(--danger);font-size:12px;width:100%"></div>
        </div>
      </div>
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string) => root.getElementById(id) as T;
  const close = () => host.remove();

  $('leave').addEventListener('click', () => {
    location.href = 'about:blank';
  });

  $('proceed').addEventListener('click', async () => {
    const has = await send<{ set: boolean }>({ kind: 'HAS_OVERRIDE' });
    if (!has?.set) {
      await allowHostNow();
      close();
      return;
    }
    $('pwForm').style.display = 'flex';
    ($('pw') as HTMLInputElement).focus();
  });

  $('unlock')?.addEventListener('click', async () => {
    const pw = ($('pw') as HTMLInputElement).value;
    const msg = $('msg');
    msg.textContent = '';
    const r = await send<{ ok: boolean; wait?: number }>({ kind: 'VERIFY_OVERRIDE', password: pw });
    if (r?.ok) {
      await allowHostNow();
      close();
    } else {
      msg.textContent = r?.wait ? `Too many attempts. Try again in ${r.wait}s.` : 'Incorrect password.';
    }
  });

  document.documentElement.appendChild(host);
}

if (typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.onMessage) {
  try {
    chrome.runtime.onMessage.addListener((msg: CsMessage, _sender, sendResponse) => {
      if (msg.kind === 'GET_PAGE_CONTEXT') {
        sendResponse(pageContext());
      } else if (msg.kind === 'GET_SELECTION') {
        sendResponse({ selection: (window.getSelection()?.toString() || '').trim() });
      }
      return true;
    });
  } catch {
    // context may be invalidated during reload
  }
}

// Automatic check: every top-level page reports itself as it loads; risky ones are warned or blocked.
async function autoScan(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome?.runtime || !chrome.runtime.id) return;
  if (window !== window.top || !/^https?:$/.test(location.protocol) || await isHostAllowed()) return;
  const v = await send<PageVerdict>({ kind: 'PAGE_LOADED', ctx: pageContext() });
  if (v && (v.verdict === 'UNSAFE' || v.verdict === 'FRAUD')) {
    void showWarning(v.verdict, v.score, v.reasons);
  }
}
void autoScan();
