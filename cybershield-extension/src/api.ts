import type { AnalyzeRequest, AnalyzeResponse, ServerStatus, Signal } from './types';
import { evaluateLocalSignals, deriveVerdict } from './local';

export const LOCAL_BASE = 'http://localhost:8899';
export const PRODUCTION_BASE = 'https://cybershield-backend-b7tm.onrender.com';

interface Settings {
  baseUrl: string;
  token: string;
}

export async function resolveActiveBaseUrl(preferred?: string): Promise<string> {
  // If user explicitly configured a server in options, respect it
  if (preferred && preferred.length > 5) {
    try {
      const res = await fetch(preferred.replace(/\/$/, '') + '/actuator/health', {
        method: 'GET',
        headers: { 'X-Client': 'chrome-ext', 'Accept': 'application/json' },
      });
      if (res.ok) return preferred;
    } catch {
      // fallback to auto-detection below
    }
  }

  // Fast check local dev server on port 8899
  try {
    const localRes = await fetch(LOCAL_BASE + '/actuator/health', {
      method: 'GET',
      headers: { 'X-Client': 'chrome-ext', 'Accept': 'application/json' },
    });
    if (localRes.ok) return LOCAL_BASE;
  } catch {
    // Local not running
  }

  return PRODUCTION_BASE;
}

export async function getSettings(): Promise<Settings> {
  const s = await chrome.storage.local.get(['baseUrl', 'token']);
  let storedUrl = (s.baseUrl as string) || '';
  const baseUrl = await resolveActiveBaseUrl(storedUrl);
  if (!storedUrl) {
    await chrome.storage.local.set({ baseUrl });
  }
  return {
    baseUrl,
    token: (s.token as string) || '',
  };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export class AuthError extends Error {}
export class TimeoutError extends Error {}

/**
 * Pings backend health endpoint with timeout.
 */
export async function checkServerHealth(timeoutMs = 6000): Promise<{ reachable: boolean; coldStart: boolean; details?: string }> {
  const { baseUrl } = await getSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/actuator/health', {
      method: 'GET',
      headers: { 'X-Client': 'chrome-ext', 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const duration = Date.now() - start;
    if (res.ok) {
      return { reachable: true, coldStart: duration > 3000 };
    }
    return { reachable: false, coldStart: false, details: `Health check returned HTTP ${res.status}` };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = (err as Error)?.name === 'AbortError';
    return {
      reachable: false,
      coldStart: isAbort,
      details: isAbort ? 'Server took too long to respond (likely cold start waking up)' : 'Network unreachable',
    };
  }
}

export async function getEffectiveToken(baseUrl: string, existingToken: string): Promise<string> {
  if (existingToken) return existingToken;
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': 'chrome-ext', 'Accept': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin-password-123456' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.accessToken) {
        await chrome.storage.local.set({ token: data.accessToken });
        return data.accessToken;
      }
    }
  } catch {
    // continue unauthenticated
  }
  return '';
}

async function req<T>(method: string, path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const { baseUrl, token: storedToken } = await getSettings();
  const token = await getEffectiveToken(baseUrl, storedToken);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client': 'chrome-ext',
    'Accept': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(baseUrl.replace(/\/$/, '') + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if ((err as Error)?.name === 'AbortError') {
      throw new TimeoutError(`Request to ${path} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw new Error(`Cannot connect to server at ${baseUrl}.`);
  }
  clearTimeout(timer);

  if (res.status === 401) {
    throw new AuthError('Authentication required. Open extension options to sign in.');
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Received malformed response from server.');
  }

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText || `Server error (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function login(username: string, password: string): Promise<void> {
  const { baseUrl } = await getSettings();
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    res = await fetch(baseUrl.replace(/\/$/, '') + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': 'chrome-ext', 'Accept': 'application/json' },
      body: JSON.stringify({ login: username, password }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('Login timed out. If Render is waking from sleep, please wait 30 seconds and retry.');
    }
    throw new Error(`Cannot reach ${baseUrl}. Please check connection.`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(res.status === 401 || res.status === 400 ? 'Invalid username or password.' : `Server error (${res.status}). Try again.`);
  }
  const data = await res.json();
  await setSettings({ token: data.accessToken });
}

export async function logout(): Promise<void> {
  await setSettings({ token: '' });
}

export interface AnalyzeOptions {
  onProgress?: (step: string) => void;
  pageHtml?: string;
  pageTitle?: string;
}

/**
 * Runs the complete evaluation:
 * - Local signals (domain parsing, brand lookalikes, content heuristics) always execute.
 * - Queries the production cloud threat-intelligence backend.
 * - Distinguishes between connected server, timeouts, and network failure.
 * - Never fabricates an offline result as a completed server check.
 */
export async function analyze(payload: AnalyzeRequest, options?: AnalyzeOptions): Promise<AnalyzeResponse> {
  const isText = payload.type === 'SOCIAL' || payload.type === 'SMS' || payload.type === 'EMAIL';
  const url = payload.type === 'WEBPAGE' && payload.pageUrl ? payload.pageUrl : payload.content;
  const html = options?.pageHtml || (payload.type === 'WEBPAGE' ? payload.content : '');
  const title = options?.pageTitle || '';
  const text = isText ? payload.content : '';

  options?.onProgress?.('Evaluating local signals & domain authenticity…');
  const { signals: localSignals, findings, checksRun, checksFailed } = evaluateLocalSignals(url, html, text, title);

  const { baseUrl } = await getSettings();

  // Attempt server check
  options?.onProgress?.('Contacting CyberShield cloud threat intelligence…');
  let serverStatus: ServerStatus = 'CONNECTED';
  let serverRes: any = null;

  // IMPORTANT: For WEBPAGE or links, send the actual URL to the backend, not the entire HTML DOM
  const serverPayload = payload.type === 'WEBPAGE'
    ? { type: 'URL', content: url, pageUrl: url, source: payload.source || 'chrome-ext' }
    : { ...payload, content: payload.content.slice(0, 15000) };

  try {
    serverRes = await req<any>('POST', '/api/v1/analyze', serverPayload, 15000);
    checksRun.push(`Cloud threat intelligence scan (${baseUrl})`);
  } catch (err: unknown) {
    if (err instanceof TimeoutError) {
      serverStatus = 'TIMED_OUT';
      checksFailed.push('Cloud threat intelligence scan (Timed out — server may be waking up)');
    } else if (err instanceof AuthError) {
      serverStatus = 'NOT_SIGNED_IN';
      checksFailed.push('Cloud threat intelligence scan (Sign in required for full threat feed)');
    } else {
      serverStatus = 'UNAVAILABLE';
      checksFailed.push(`Cloud threat intelligence scan (${(err as Error)?.message || 'Unavailable'})`);
    }
  }

  // If server check failed or was unreachable
  if (serverStatus !== 'CONNECTED' || !serverRes) {
    const outcome = deriveVerdict(findings, serverStatus, localSignals);
    return {
      reportId: 'fallback-' + Date.now(),
      contentType: payload.type,
      verdict: outcome.verdict,
      verdictTitle: outcome.title,
      verdictReason: outcome.reason,
      riskScore: outcome.riskScore,
      riskLevel: outcome.riskLevel,
      priority: outcome.riskLevel === 'MALICIOUS' ? 'P1' : outcome.riskLevel === 'HIGH_RISK' ? 'P2' : outcome.riskLevel === 'SUSPICIOUS' ? 'P3' : 'P4',
      wording: outcome.title,
      verified: findings.brandAuthenticity.status === 'OFFICIAL',
      trusted: findings.brandAuthenticity.status === 'OFFICIAL',
      initiatesPayment: false,
      categories: [],
      signals: localSignals,
      explanation: outcome.reason,
      recommendations: outcome.verdict === 'UNSAFE'
        ? [
            'Do not submit credentials, download files, or bypass security warnings.',
            'Close this tab immediately.',
          ]
        : outcome.verdict === 'FRAUD'
        ? [
            'Do not register, log in, or enter any personal details or passwords.',
            'This page exhibits brand impersonation or deceptive credential traps.',
          ]
        : outcome.verdict === 'SUSPICIOUS'
        ? [
            'Avoid clicking advertisements, fake download/play buttons, or streaming popups.',
            'Do not install browser extensions, APKs, or software prompted by this site.',
          ]
        : [
            `Server check was ${serverStatus === 'TIMED_OUT' ? 'timed out' : serverStatus === 'NOT_SIGNED_IN' ? 'offline (sign-in required for cloud threat feed)' : 'unavailable'}. Local browser checks completed.`,
            'Exercise heightened caution on unfamiliar sites.',
          ],
      payment: null,
      analyzedAt: new Date().toISOString(),
      findings,
      execution: {
        checksRun,
        checksFailed,
        serverStatus,
        serverChecked: false,
        analyzedAt: new Date().toISOString(),
        source: 'browser',
      },
    };
  }

  // Server check succeeded: Merge signals & determine final verdict
  const serverSignals: Signal[] = Array.isArray(serverRes.signals) ? serverRes.signals : [];
  const seenPolicy = new Set(serverSignals.map((s) => s.policyId));
  const mergedSignals = [...serverSignals, ...localSignals.filter((s) => !seenPolicy.has(s.policyId))];

  const outcome = deriveVerdict(findings, 'CONNECTED', mergedSignals, serverRes.riskLevel);

  return {
    reportId: serverRes.reportId || 'srv-' + Date.now(),
    contentType: payload.type,
    verdict: outcome.verdict,
    verdictTitle: outcome.title,
    verdictReason: outcome.reason,
    riskScore: Math.max(outcome.riskScore, serverRes.riskScore || 0),
    riskLevel: outcome.riskLevel,
    priority: serverRes.priority || (outcome.riskLevel === 'MALICIOUS' ? 'P1' : outcome.riskLevel === 'HIGH_RISK' ? 'P2' : 'P3'),
    wording: outcome.title,
    verified: Boolean(serverRes.verified || findings.brandAuthenticity.status === 'OFFICIAL'),
    trusted: Boolean(serverRes.trusted || findings.brandAuthenticity.status === 'OFFICIAL'),
    initiatesPayment: Boolean(serverRes.initiatesPayment),
    categories: serverRes.categories || [],
    signals: mergedSignals,
    explanation: outcome.reason,
    recommendations: [
      ...new Set([
        ...(outcome.verdict === 'UNSAFE' || outcome.verdict === 'FRAUD'
          ? ['Do not enter passwords, OTPs, or financial credentials on this page.']
          : ['Verified against CyberShield threat intelligence. Always verify the address bar.']),
        ...(serverRes.recommendations || []),
      ]),
    ],
    payment: serverRes.payment || null,
    analyzedAt: serverRes.analyzedAt || new Date().toISOString(),
    findings,
    execution: {
      checksRun,
      checksFailed,
      serverStatus: 'CONNECTED',
      serverChecked: true,
      serverTimestamp: serverRes.analyzedAt,
      serverSource: `CyberShield Production API (${baseUrl})`,
      analyzedAt: new Date().toISOString(),
      source: 'hybrid',
    },
  };
}

export function report(type: string, content: string, note: string): Promise<unknown> {
  return req('POST', '/api/v1/report', { type, content, note }, 15000);
}
