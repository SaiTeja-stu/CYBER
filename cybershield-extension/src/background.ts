import { analyze, AuthError } from './api';
import type { AnalyzeResponse, BgMessage, ExtensionVerdict, PageContext, PageVerdict } from './types';

const VERDICT_BADGE: Record<ExtensionVerdict, { text: string; color: string }> = {
  UNSAFE: { text: '✕', color: '#EF4444' },
  FRAUD: { text: '!', color: '#F97316' },
  SUSPICIOUS: { text: '▲', color: '#EAB308' },
  UNVERIFIED: { text: '?', color: '#6B7280' },
  NO_KNOWN_THREATS: { text: 'i', color: '#3B82F6' },
  SAFE_SIGNALS_FOUND: { text: '✓', color: '#10B981' },
};

// In-memory set of explicitly user-allowed hosts (session-isolated, immune to webpage DOM/sessionStorage tampering)
const allowedHosts = new Map<string, number>();
const ALLOW_DURATION_MS = 30 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'scan-selection',
    title: 'Secure Me: check selected text',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'scan-link',
    title: 'Secure Me: check this link',
    contexts: ['link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  try {
    if (info.menuItemId === 'scan-selection' && info.selectionText) {
      notify(await analyze({ type: 'SOCIAL', content: info.selectionText, source: 'context-menu' }), 'Selected text');
    } else if (info.menuItemId === 'scan-link' && info.linkUrl) {
      notify(await analyze({ type: 'URL', content: info.linkUrl, source: 'context-menu' }), info.linkUrl);
    }
  } catch (e) {
    notifyError(e);
  }
});

// ---- override password (parental-control style) ----
const enc = new TextEncoder();
let failedTries = 0;
let lockedUntil = 0;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 150_000 }, key, 256);
  return toB64(bits);
}
async function hasOverride(): Promise<boolean> {
  const { override } = await chrome.storage.local.get('override');
  return !!override;
}
async function setOverride(password: string): Promise<boolean> {
  if (password.length < 4) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ override: { salt: toB64(salt), hash: await derive(password, salt) } });
  return true;
}
async function verifyOverride(password: string): Promise<{ ok: boolean; wait?: number }> {
  const now = Date.now();
  if (now < lockedUntil) return { ok: false, wait: Math.ceil((lockedUntil - now) / 1000) };
  const { override } = await chrome.storage.local.get('override');
  if (!override) return { ok: false };
  const ok = (await derive(password, fromB64(override.salt))) === override.hash;
  if (ok) {
    failedTries = 0;
    return { ok: true };
  }
  if (++failedTries >= 5) {
    failedTries = 0;
    lockedUntil = now + 60_000;
  }
  return { ok: false };
}

// ---- automatic page check: pages report themselves when they load ----
async function checkPage(ctx: PageContext, tabId: number | undefined): Promise<PageVerdict> {
  const r = await analyze(
    ctx.html.length > 40
      ? { type: 'WEBPAGE', content: ctx.html, pageUrl: ctx.url, source: 'auto' }
      : { type: 'URL', content: ctx.url, source: 'auto' },
    { pageHtml: ctx.html, pageTitle: ctx.title }
  );
  if (tabId !== undefined) {
    const badge = VERDICT_BADGE[r.verdict];
    chrome.action.setBadgeText({ tabId, text: badge.text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  }
  const reasons = [r.verdictTitle, r.verdictReason];
  return { verdict: r.verdict, level: r.riskLevel, score: r.riskScore, reasons };
}

chrome.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
  (async () => {
    switch (msg.kind) {
      case 'PAGE_LOADED':
        if (!/^https?:/.test(msg.ctx.url)) return sendResponse(null);
        return sendResponse(await checkPage(msg.ctx, sender.tab?.id));
      case 'CHECK_HOST_ALLOWED': {
        const exp = allowedHosts.get(msg.hostname) || 0;
        return sendResponse({ allowed: exp > Date.now() });
      }
      case 'SET_HOST_ALLOWED': {
        allowedHosts.set(msg.hostname, Date.now() + ALLOW_DURATION_MS);
        return sendResponse({ ok: true });
      }
      case 'HAS_OVERRIDE':
        return sendResponse({ set: await hasOverride() });
      case 'SET_OVERRIDE':
        return sendResponse({ ok: await setOverride(msg.password) });
      case 'VERIFY_OVERRIDE':
        return sendResponse(await verifyOverride(msg.password));
    }
  })().catch(() => sendResponse(null));
  return true; // async response
});

// After installing / reloading the extension, put the content script into tabs that are already open.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const t of tabs) {
    if (t.id === undefined) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] });
    } catch {
      /* restricted page (Chrome Web Store, etc.) */
    }
  }
});

function notify(r: AnalyzeResponse, subject: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${r.verdictTitle} (${r.riskScore}/100)`,
    message: `${subject}\n\n${r.verdictReason}`.slice(0, 400),
    priority: r.verdict === 'UNSAFE' || r.verdict === 'FRAUD' ? 2 : 1,
  });
}

function notifyError(e: unknown): void {
  const msg = e instanceof AuthError ? e.message : e instanceof Error ? e.message : 'Check failed';
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'CyberShield', message: msg });
}
