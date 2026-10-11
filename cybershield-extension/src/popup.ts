import { analyze, report } from './api';
import type { AnalyzeResponse, ContentType, PageContext } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function show(id: string, on: boolean) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !on);
}

let lastAnalyzed: { type: ContentType; content: string } | null = null;
let coldStartTimer: any = null;

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pageContext(tabId: number): Promise<PageContext | null> {
  try {
    return await chrome.tabs.sendMessage(tabId, { kind: 'GET_PAGE_CONTEXT' });
  } catch {
    return null; // content script not accessible on chrome:// or special tabs
  }
}

function updateStatus(dotClass: 'active' | 'pending' | 'offline', text: string) {
  const dot = $('statusDot')?.querySelector('.dot');
  if (dot) {
    dot.className = `dot ${dotClass}`;
  }
  const statusText = $('statusText');
  if (statusText) {
    statusText.textContent = text;
  }
}

function render(r: AnalyzeResponse) {
  if (coldStartTimer) clearTimeout(coldStartTimer);
  show('loadingBox', false);
  show('errorBox', false);
  show('resultBox', true);

  // Status header
  if (r.execution.serverChecked) {
    updateStatus('active', 'Cloud + Browser Verified');
  } else if (r.execution.serverStatus === 'NOT_SIGNED_IN') {
    updateStatus('offline', 'Browser checks only');
  } else if (r.execution.serverStatus === 'TIMED_OUT') {
    updateStatus('pending', 'Server check timed out');
  } else {
    updateStatus('offline', 'Server check unavailable');
  }

  // Verdict Hero
  const hero = $('verdictHero');
  const badge = $('verdictBadge');
  const score = $('verdictScore');
  const title = $('verdictTitle');
  const reason = $('verdictReason');
  const caveat = $('verdictCaveat');

  const verdictClass =
    r.verdict === 'UNSAFE'
      ? 'unsafe'
      : r.verdict === 'FRAUD'
      ? 'fraud'
      : r.verdict === 'SUSPICIOUS'
      ? 'suspicious'
      : r.verdict === 'UNVERIFIED'
      ? 'unverified'
      : r.verdict === 'NO_KNOWN_THREATS'
      ? 'no-threats'
      : 'safe';

  hero.className = `verdict-hero ${verdictClass}`;
  badge.className = `verdict-badge ${verdictClass}`;
  badge.textContent =
    r.verdict === 'UNSAFE'
      ? 'Unsafe'
      : r.verdict === 'FRAUD'
      ? 'Fraud'
      : r.verdict === 'SUSPICIOUS'
      ? 'Suspicious'
      : r.verdict === 'UNVERIFIED'
      ? 'Unverified'
      : r.verdict === 'NO_KNOWN_THREATS'
      ? 'No known threats'
      : 'Official Verified';

  score.textContent = `Risk Score: ${r.riskScore} / 100`;
  title.textContent = r.verdictTitle;
  reason.textContent = r.verdictReason;

  if (r.verdict === 'SAFE_SIGNALS_FOUND') {
    caveat.textContent = 'Independently verified official brand domain. Note: Absolute safety cannot be guaranteed.';
  } else if (r.verdict === 'NO_KNOWN_THREATS') {
    caveat.textContent = 'Note: Checks found no known threats on this domain. This is not a guarantee of safety.';
  } else if (r.verdict === 'SUSPICIOUS') {
    if (r.findings.contentAdvisory.status === 'STREAMING_PIRACY') {
      caveat.textContent = 'Illicit movie streaming / piracy portal. High risk of deceptive ads, malvertising, and fake download buttons. Exercise extreme caution.';
    } else {
      caveat.textContent = 'Warning signals detected (e.g. disposable domain, redirect tracking, or unverified claims). Exercise extreme caution.';
    }
  } else if (r.verdict === 'UNVERIFIED') {
    caveat.textContent = 'Authoritative cloud checks were unavailable or inconclusive. Treat content as untrusted.';
  } else if (r.verdict === 'FRAUD' && r.findings.contentAdvisory.status === 'STREAMING_PIRACY') {
    caveat.textContent = 'Illicit piracy mirror with deceptive registration or brand cloning. Never submit passwords, payment cards, or credentials.';
  } else {
    caveat.textContent = 'Evidence-based threat identification. Avoid interacting or entering credentials on this page.';
  }

  // Findings Breakdown: 1. Technical Threat
  const pillThreat = $('pillThreat');
  const descThreat = $('descThreat');
  if (r.findings.technicalThreat.status === 'MALICIOUS') {
    pillThreat.className = 'dim-pill pill-bad';
    pillThreat.textContent = 'Malicious';
  } else if (r.findings.technicalThreat.status === 'SUSPICIOUS') {
    pillThreat.className = 'dim-pill pill-warn';
    pillThreat.textContent = 'Suspicious';
  } else {
    pillThreat.className = 'dim-pill pill-clean';
    pillThreat.textContent = 'Clean';
  }
  descThreat.textContent = r.findings.technicalThreat.details;

  // 2. Brand Authenticity
  const pillBrand = $('pillBrand');
  const descBrand = $('descBrand');
  if (r.findings.brandAuthenticity.status === 'OFFICIAL') {
    pillBrand.className = 'dim-pill pill-clean';
    pillBrand.textContent = 'Official';
  } else if (
    r.findings.brandAuthenticity.status === 'LOOKALIKE' ||
    r.findings.brandAuthenticity.status === 'DECEPTIVE_SUBDOMAIN'
  ) {
    pillBrand.className = 'dim-pill pill-bad';
    pillBrand.textContent = 'Impersonation';
  } else if (r.findings.brandAuthenticity.status === 'UNVERIFIED_CLAIM') {
    pillBrand.className = 'dim-pill pill-warn';
    pillBrand.textContent = 'Unverified';
  } else {
    pillBrand.className = 'dim-pill pill-neutral';
    pillBrand.textContent = 'Unrelated';
  }
  descBrand.textContent = r.findings.brandAuthenticity.details;

  // 3. Scam Evidence
  const pillScam = $('pillScam');
  const descScam = $('descScam');
  if (r.findings.scamEvidence.status === 'CREDENTIAL_HARVESTING') {
    pillScam.className = 'dim-pill pill-bad';
    pillScam.textContent = 'Credential Theft';
  } else if (r.findings.scamEvidence.status === 'COERCION_URGENCY') {
    pillScam.className = 'dim-pill pill-bad';
    pillScam.textContent = 'Coercion / Urgency';
  } else if (r.findings.scamEvidence.status === 'FINANCIAL_SCAM') {
    pillScam.className = 'dim-pill pill-warn';
    pillScam.textContent = 'Financial Scam';
  } else {
    pillScam.className = 'dim-pill pill-clean';
    pillScam.textContent = 'None detected';
  }
  descScam.textContent = r.findings.scamEvidence.details;

  // 4. Content Advisory
  const pillContent = $('pillContent');
  const descContent = $('descContent');
  if (r.findings.contentAdvisory.status === 'STREAMING_PIRACY') {
    pillContent.className = 'dim-pill pill-warn';
    pillContent.textContent = 'Streaming / Piracy';
  } else if (r.findings.contentAdvisory.status === 'GAMBLING') {
    pillContent.className = 'dim-pill pill-warn';
    pillContent.textContent = 'Gambling';
  } else if (r.findings.contentAdvisory.status === 'CRACK_WAREZ') {
    pillContent.className = 'dim-pill pill-warn';
    pillContent.textContent = 'Cracked Software';
  } else {
    pillContent.className = 'dim-pill pill-clean';
    pillContent.textContent = 'Clean';
  }
  descContent.textContent = r.findings.contentAdvisory.details;

  // Audit List (Checks Run vs Failed)
  const auditList = $('auditList');
  auditList.innerHTML = '';
  r.execution.checksRun.forEach((check) => {
    const li = document.createElement('li');
    li.className = 'audit-item';
    li.innerHTML = `<span class="audit-icon audit-ok">✓</span><span>${check}</span>`;
    auditList.appendChild(li);
  });
  r.execution.checksFailed.forEach((fail) => {
    const li = document.createElement('li');
    li.className = 'audit-item';
    li.innerHTML = `<span class="audit-icon audit-fail">⚠</span><span>${fail}</span>`;
    auditList.appendChild(li);
  });
  const timeLi = document.createElement('li');
  timeLi.className = 'audit-item';
  const timeFormatted = new Date(r.analyzedAt).toLocaleTimeString();
  timeLi.innerHTML = `<span class="audit-icon" style="color:var(--text-secondary)">⏱</span><span style="color:var(--text-secondary)">Timestamp: ${timeFormatted} (${r.execution.source})</span>`;
  auditList.appendChild(timeLi);

  // Recommendations
  const recsList = $('recsList');
  recsList.innerHTML = '';
  r.recommendations.forEach((rec) => {
    const li = document.createElement('li');
    li.textContent = rec;
    recsList.appendChild(li);
  });

  // Action buttons
  show('reportBtn', true);
}

function renderError(e: unknown) {
  if (coldStartTimer) clearTimeout(coldStartTimer);
  show('loadingBox', false);
  show('resultBox', false);
  show('errorBox', true);
  updateStatus('offline', 'Check failed');

  $('errorTitle').textContent = 'Unable to complete check';
  $('errorMessage').textContent = e instanceof Error ? e.message : 'An unexpected error occurred.';
}

async function run() {
  updateStatus('pending', 'Checking…');
  show('errorBox', false);
  show('resultBox', false);
  show('loadingBox', true);
  $('loadingTitle').textContent = 'Checking this page…';
  $('loadingSub').textContent = 'Parsing domain syntax and checking brand directory';

  coldStartTimer = setTimeout(() => {
    $('loadingTitle').textContent = 'Connecting to CyberShield server…';
    $('loadingSub').textContent = 'Server may be waking from sleep on Render (can take up to 45 seconds). Please wait…';
  }, 4000);

  const tab = await activeTab();
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    renderError(new Error("This page cannot be checked (e.g. browser internal page)."));
    return;
  }

  $('targetUrl').textContent = tab.url;

  const ctx = await pageContext(tab.id);
  const selection = ctx?.selection?.trim() || '';
  show('scanSelectionBtn', selection.length > 0);

  const type: ContentType = 'URL';
  const content = tab.url;
  lastAnalyzed = { type, content };

  try {
    const r = await analyze({ type, content, pageUrl: tab.url, source: 'popup' }, {
      pageHtml: ctx?.html || '',
      pageTitle: ctx?.title || tab.title || '',
      onProgress: (step) => {
        $('loadingSub').textContent = step;
      },
    });
    render(r);
  } catch (e) {
    renderError(e);
  }
}

$('recheckBtn').addEventListener('click', run);
$('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('scanSelectionBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  const ctx = await pageContext(tab.id);
  const sel = ctx?.selection?.trim();
  if (!sel) return;

  show('loadingBox', true);
  show('resultBox', false);
  updateStatus('pending', 'Scanning selection…');
  lastAnalyzed = { type: 'SOCIAL', content: sel };
  try {
    render(await analyze({ type: 'SOCIAL', content: sel, source: 'popup-selection' }));
  } catch (e) {
    renderError(e);
  }
});

$('reportBtn').addEventListener('click', async () => {
  if (!lastAnalyzed) return;
  const btn = $('reportBtn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Reporting…';
  try {
    await report(lastAnalyzed.type, lastAnalyzed.content, 'reported from extension');
    btn.textContent = 'Reported ✓';
  } catch (e) {
    btn.textContent = 'Sign in required to report';
    btn.disabled = false;
  }
});

run();
