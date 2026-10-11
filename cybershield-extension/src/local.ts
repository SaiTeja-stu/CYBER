import {
  checkBrandAuthenticity,
  checkPageBrandImpersonation,
  parseDomain,
  CURATED_TRUSTED_DOMAINS,
  type ParsedDomain,
  type BrandStatus,
} from './domain';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ExtensionVerdict,
  FindingsBreakdown,
  RiskLevel,
  Signal,
} from './types';

/**
 * Local evidence-based heuristic analyzer.
 * Evaluates technical threat signals, brand authenticity, scam evidence,
 * and content advisories as four strictly distinct dimensions.
 */

const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at']);

// Burner & high-abuse domain extensions heavily utilized in ad fraud, malware distribution, and burner redirect schemes
const HIGH_ABUSE_TLDS = new Set([
  'lol', 'top', 'click', 'buzz', 'rest', 'tk', 'ml', 'ga', 'cf', 'gq',
  'monster', 'fit', 'surf', 'stream', 'cam', 'work', 'lat', 'bid', 'loan',
  'racing', 'win', 'date', 'faith', 'party', 'review', 'trade', 'webcam', 'cc', 'vip', 'cfd'
]);

// Traffic Distribution System (TDS), malvertising redirect gateway & affiliate fraud tracking parameters
const TDS_TRACKING_PARAMS = [
  'flow_id', 'pubfeed', 'carrier', 'campaign', 'conversion', 'subid', 'flow_k',
  'bid', 'clickid', 'trackid', 'aff_id', 'aff_sub', 'target_id'
];

// Safe test domains provided by threat intelligence test suites (e.g. Google Safe Browsing test, Anti-Phishing Working Group)
const KNOWN_PHISHING_TEST_DOMAINS = new Set([
  'testsafebrowsing.appspot.com',
  'malware.testing.google.test',
  'phishing.eset.com',
  'wicar.org',
]);

const SCAM_COERCION_TEXT = [
  'kyc will be blocked', 'account will be suspended', 'digital arrest', 'police warrant',
  'arrest warrant', 'immediate arrest', 'electricity will be disconnected', 'sim card will be blocked',
  'pan card expired', 'update your pan immediately', 'unauthorized transaction detected',
];

const SCAM_FINANCIAL_TEXT = [
  'you have won', 'lottery prize', 'lucky draw winner', 'claim your cash prize', 'part time job earn daily',
  'work from home earn 5000', 'guaranteed returns', 'investment double in 7 days', 'scan qr to receive money',
];

const OTP_THEFT_TEXT = [
  'share the otp', 'send the otp', 'enter your atm pin', 'share your pin', 'give your otp',
  'share otp with executive', 'tell the otp', 'forward the otp',
];

const STREAMING_PIRACY_DOMAINS = new Set([
  'net77.cc', '1337x.to', 'thepiratebay.org', 'fmovies.to', 'soap2day.to', '123movies.net',
  'yts.mx', 'tamilrockers.ws', 'movierulz.vpn', 'ibomma.link', '5movierulz.academy',
  '4movierulz.to', '7movierulz.tc', 'tamilmv.app', 'tamilyogi.best', 'netmirror.app',
]);

const PIRACY_REGEX = /(movierulz|5movierulz|4movierulz|7movierulz|tamilrockers|tamilmv|tamilyogi|isaimini|filmyzilla|filmywap|filmyhit|filmy4|9xmovies|9xflix|moviesflix|vegamovies|hdhub4u|bolly4u|khatrimaza|mkvcinemas|worldfree4u|7starhd|jiorockers|ibomma|kuttymovies|1337x|thepiratebay|piratebay|fmovies|soap2day|123movies|putlocker|tamilblasters|movies4u|moviesda|klwap|desiremovies|mp4moviez|cinevood|skymovieshd|net77|netmirror|moviezwap|jalshamoviez|hindilinks4u|extramovies|crazy4tv|filmymeet|djpunjab|okjatt|mp3juice|yts|nyaa|rarbg|limetorrents|torrentz|kickass)/i;
const PIRACY_NAME_PATTERN = /^(movies?|films?|filmy|bolly|holly|tamil|telugu|hindi|kannada|malayalam|mkv|hd|cine|cinema)[a-z0-9-]*(4u|wap|zilla|rulz|hub|flix|mad|world|mkv|hd|junction|blasters|rockers|verse|zone|point|base|4k|hit|bazaar|mp4)[a-z0-9]*$/i;
const PIRACY_TEXT = [
  '480p', '720p', '1080p', '300mb', 'dual audio', 'web-dl', 'webrip', 'hdrip', 'camrip', 'hdcam', 'bluray',
  'torrent magnet', 'torrent', 'magnet:', 'hindi dubbed', 'telugu dubbed', 'tamil dubbed', 'free download',
  'download bollywood', 'download hollywood', 'featured movies free', 'watch in tamil', 'watch in telugu',
  'stream upto 1080p', 'unlimited movies', 'private streaming server', 'latest indian movies'
];
const GAMBLING_TEXT = ['real cash rummy', 'betting exchange', 'satta matka', 'teen patti real money', 'online casino jackpot', 'ipl betting odds'];
const CRACK_TEXT = ['crack download', 'keygen.exe', 'serial key generator', 'full version free crack', 'activator patch'];

function sig(policyId: string, name: string, detail: string, severity: Signal['severity'], weight: number): Signal {
  return { policyId, name, detail, severity, weight };
}

function countHits(t: string, terms: string[]): string[] {
  return terms.filter((term) => t.includes(term));
}

export function evaluateLocalSignals(
  rawUrl: string,
  pageHtml: string,
  textSnippet: string,
  pageTitle?: string
): {
  parsed: ParsedDomain;
  brandStatus: BrandStatus;
  signals: Signal[];
  findings: FindingsBreakdown;
  checksRun: string[];
  checksFailed: string[];
} {
  const parsed = parseDomain(rawUrl);
  const brandStatus = checkBrandAuthenticity(parsed);
  const signals: Signal[] = [];
  const checksRun: string[] = [
    'Domain syntax & public suffix parsing',
    'Brand directory & lookalike evaluation',
    'Host & protocol security inspection',
  ];
  const checksFailed: string[] = [];

  const findings: FindingsBreakdown = {
    technicalThreat: {
      status: 'CLEAN',
      details: 'No technical threats, unencrypted credential submissions, or hostile payloads detected locally.',
      evidence: [],
    },
    brandAuthenticity: {
      status: 'UNRELATED',
      details: 'No claimed or impersonated brand detected in domain or subdomains.',
    },
    scamEvidence: {
      status: 'NONE',
      details: 'No coercion, OTP harvesting, or scam indicators detected.',
      hits: [],
    },
    contentAdvisory: {
      status: 'CLEAN',
      details: 'No content or legality advisories.',
    },
  };

  // 1. Technical Threat Checks
  if (KNOWN_PHISHING_TEST_DOMAINS.has(parsed.hostname) || KNOWN_PHISHING_TEST_DOMAINS.has(parsed.registrableDomain)) {
    signals.push(sig('T-PHISH-TEST', 'Known threat intelligence test domain', 'Matched known safe phishing/threat test endpoint.', 'CRITICAL', 85));
    findings.technicalThreat.status = 'MALICIOUS';
    findings.technicalThreat.details = 'Known threat intelligence test domain designed for phishing / security validation.';
    findings.technicalThreat.evidence.push(`Hostname matches ${parsed.hostname}`);
  }

  if (parsed.isIpAddress) {
    signals.push(sig('T-IP-HOST', 'IP address hostname', `Host '${parsed.hostname}' is a raw IP address rather than a domain.`, 'HIGH', 30));
    findings.technicalThreat.evidence.push(`Direct IP hostname: ${parsed.hostname}`);
    if (findings.technicalThreat.status === 'CLEAN') findings.technicalThreat.status = 'SUSPICIOUS';
  }

  if (parsed.isPunycode) {
    signals.push(sig('T-PUNYCODE', 'Punycode / Homoglyph representation', `Domain uses punycode characters '${parsed.hostname}'.`, 'HIGH', 30));
    findings.technicalThreat.evidence.push(`Punycode domain: ${parsed.hostname}`);
    if (findings.technicalThreat.status === 'CLEAN') findings.technicalThreat.status = 'SUSPICIOUS';
  }

  if (parsed.hasUserInfo) {
    signals.push(sig('T-USERINFO', 'Embedded credentials in URL', 'URL uses username@host syntax, often used to disguise actual destinations.', 'HIGH', 35));
    findings.technicalThreat.evidence.push('Embedded user credentials in authority section');
    if (findings.technicalThreat.status === 'CLEAN') findings.technicalThreat.status = 'SUSPICIOUS';
  }

  // Burner / High-abuse TLD check
  const tld = parsed.publicSuffix.toLowerCase();
  const isAbuseTld = HIGH_ABUSE_TLDS.has(tld);
  if (isAbuseTld && !CURATED_TRUSTED_DOMAINS.has(parsed.registrableDomain)) {
    signals.push(sig('T-ABUSE-TLD', 'High-abuse domain extension', `The '.${tld}' TLD is heavily associated with disposable domains, malvertising, and phishing.`, 'HIGH', 30));
    if (findings.technicalThreat.status === 'CLEAN') findings.technicalThreat.status = 'SUSPICIOUS';
    findings.technicalThreat.evidence.push(`High-abuse disposable TLD: .${tld}`);
  }

  // Traffic Distribution System (TDS) & malvertising parameter checks
  try {
    const urlObj = new URL(parsed.normalizedUrl);
    const searchParams = urlObj.searchParams;
    const tdsHits = TDS_TRACKING_PARAMS.filter((p) => searchParams.has(p));
    if (tdsHits.length >= 2 || (tdsHits.length >= 1 && (isAbuseTld || parsed.subdomain.length > 3))) {
      signals.push(sig('T-TDS-REDIRECT', 'Traffic Distribution System / Malvertising gateway', `URL contains tracking & redirect parameters characteristic of malvertising/TDS gateways: ${tdsHits.join(', ')}.`, 'HIGH', 40));
      findings.technicalThreat.status = 'SUSPICIOUS';
      findings.technicalThreat.evidence.push(`Malvertising / TDS tracking parameters: ${tdsHits.join(', ')}`);
    }
  } catch {
    // ignore parse error
  }

  // Random / algorithmic subdomain check (e.g. 4fcsn.pulsarflowtech.lol)
  if (parsed.subdomain) {
    const firstSub = parsed.subdomain.split('.')[0];
    if (/^[a-f0-9]{5,}$/i.test(firstSub) || (firstSub.length >= 5 && /\d/.test(firstSub) && /[a-z]/i.test(firstSub) && isAbuseTld)) {
      signals.push(sig('T-HEX-SUBDOMAIN', 'Generated random subdomain', `Subdomain '${firstSub}' appears algorithmically generated on burner host '${parsed.registrableDomain}'.`, 'MEDIUM', 25));
      if (findings.technicalThreat.status === 'CLEAN') findings.technicalThreat.status = 'SUSPICIOUS';
      findings.technicalThreat.evidence.push(`Generated subdomain: ${parsed.subdomain}`);
    }
  }

  if (SHORTENERS.has(parsed.registrableDomain)) {
    signals.push(sig('T-SHORTENER', 'URL shortener', `Uses URL shortening service '${parsed.registrableDomain}' which masks the true target.`, 'MEDIUM', 15));
    findings.technicalThreat.evidence.push(`URL shortener: ${parsed.registrableDomain}`);
  }

  if (parsed.protocol === 'http:' && !parsed.isIpAddress) {
    signals.push(sig('T-NO-HTTPS', 'Unencrypted HTTP', 'Traffic to this page is sent without TLS encryption.', 'MEDIUM', 15));
  }

  // Inspect page HTML if provided
  if (pageHtml) {
    checksRun.push('DOM & form target security inspection');
    const hasPassword = /<input[^>]+type=["']?password/i.test(pageHtml);
    if (hasPassword && parsed.protocol === 'http:') {
      signals.push(sig('T-PWD-HTTP', 'Password field on unencrypted HTTP', 'Passwords entered here would be transmitted in cleartext.', 'CRITICAL', 50));
      findings.technicalThreat.status = 'MALICIOUS';
      findings.technicalThreat.evidence.push('Password input on unencrypted HTTP page');
    }

    // Hostile cross-origin form action
    for (const match of pageHtml.matchAll(/<form[^>]+action=["'](https?:\/\/[^"']+)["']/gi)) {
      try {
        const actionHost = parseDomain(match[1]).registrableDomain;
        if (hasPassword && actionHost && actionHost !== parsed.registrableDomain) {
          signals.push(sig('T-HOSTILE-FORM', 'Form action posts credentials cross-domain', `Form submits to third-party domain '${actionHost}'.`, 'CRITICAL', 60));
          findings.technicalThreat.status = 'MALICIOUS';
          findings.technicalThreat.evidence.push(`Form submits credentials to external '${actionHost}'`);
          break;
        }
      } catch {
        // ignore malformed form action URL
      }
    }
  }

  if (findings.technicalThreat.status === 'SUSPICIOUS' && findings.technicalThreat.evidence.length > 0) {
    findings.technicalThreat.details = findings.technicalThreat.evidence.join('; ');
  }

  // 2. Brand Authenticity Evaluation
  // Check if in-page brand impersonation is present (e.g. Netflix brand displayed on net77.cc with login prompts)
  let effectiveBrandStatus = brandStatus;
  if (effectiveBrandStatus.kind === 'UNRELATED') {
    const pageBrand = checkPageBrandImpersonation(parsed, pageHtml || textSnippet, pageTitle);
    if (pageBrand.kind !== 'UNRELATED') {
      effectiveBrandStatus = pageBrand;
    }
  }

  switch (effectiveBrandStatus.kind) {
    case 'OFFICIAL':
      signals.push(sig('B-OFFICIAL', 'Verified official domain', `${parsed.registrableDomain} is an independently verified official domain for ${effectiveBrandStatus.brand.toUpperCase()}.`, 'TRUST', -40));
      findings.brandAuthenticity = {
        status: 'OFFICIAL',
        brand: effectiveBrandStatus.brand.toUpperCase(),
        officialDomain: effectiveBrandStatus.officialDomain,
        details: `Independently verified official domain of ${effectiveBrandStatus.brand.toUpperCase()} (${effectiveBrandStatus.officialDomain}).`,
      };
      break;

    case 'PAGE_BRAND_IMPERSONATION':
      signals.push(sig('B-PAGE-IMPERSONATION', 'In-page brand impersonation & credential prompt', effectiveBrandStatus.details, 'CRITICAL', 70));
      findings.brandAuthenticity = {
        status: 'LOOKALIKE',
        brand: effectiveBrandStatus.brand,
        officialDomain: effectiveBrandStatus.officialDomain,
        details: effectiveBrandStatus.details,
      };
      break;

    case 'DECEPTIVE_SUBDOMAIN':
      signals.push(sig('B-DECEPTIVE-SUB', 'Deceptive brand subdomain', effectiveBrandStatus.details, 'CRITICAL', 65));
      findings.brandAuthenticity = {
        status: 'DECEPTIVE_SUBDOMAIN',
        brand: effectiveBrandStatus.brand.toUpperCase(),
        officialDomain: effectiveBrandStatus.officialDomain,
        details: effectiveBrandStatus.details,
      };
      break;

    case 'LOOKALIKE_DOMAIN':
      signals.push(sig('B-LOOKALIKE', 'Brand lookalike / typosquatting', effectiveBrandStatus.details, 'CRITICAL', 60));
      findings.brandAuthenticity = {
        status: 'LOOKALIKE',
        brand: effectiveBrandStatus.brand.toUpperCase(),
        officialDomain: effectiveBrandStatus.officialDomain,
        details: effectiveBrandStatus.details,
      };
      break;

    case 'UNVERIFIED_BRAND_CLAIM':
      signals.push(sig('B-UNVERIFIED', 'Unverified brand claim', effectiveBrandStatus.details, 'MEDIUM', 25));
      findings.brandAuthenticity = {
        status: 'UNVERIFIED_CLAIM',
        brand: effectiveBrandStatus.brand.toUpperCase(),
        details: effectiveBrandStatus.details,
      };
      break;

    case 'UNRELATED':
      if (CURATED_TRUSTED_DOMAINS.has(parsed.registrableDomain)) {
        signals.push(sig('B-TRUSTED', 'Recognized authoritative domain', `${parsed.registrableDomain} is a well-known established domain.`, 'TRUST', -25));
        findings.brandAuthenticity = {
          status: 'OFFICIAL',
          details: `Recognized established public domain (${parsed.registrableDomain}).`,
        };
      } else {
        findings.brandAuthenticity = {
          status: 'UNRELATED',
          details: 'Domain does not claim or impersonate a protected brand.',
        };
      }
      break;
  }

  // 3. Scam & Social Engineering Evidence
  const textToCheck = (textSnippet + ' ' + (pageHtml ? pageHtml.slice(0, 15000) : '')).toLowerCase();
  if (textToCheck.trim().length > 0) {
    checksRun.push('Page text & urgency / scam keyword heuristics');
    const otpHits = countHits(textToCheck, OTP_THEFT_TEXT);
    const coercionHits = countHits(textToCheck, SCAM_COERCION_TEXT);
    const financialHits = countHits(textToCheck, SCAM_FINANCIAL_TEXT);

    if (otpHits.length > 0) {
      signals.push(sig('S-OTP', 'Requests OTP or PIN sharing', `Page text requests sensitive verification codes: ${otpHits.join(', ')}`, 'CRITICAL', 60));
      findings.scamEvidence = {
        status: 'CREDENTIAL_HARVESTING',
        details: `Asks users to share confidential OTPs/PINs (${otpHits.join(', ')}). Legitimate institutions never ask for these.`,
        hits: otpHits,
      };
    } else if (coercionHits.length > 0) {
      signals.push(sig('S-COERCION', 'Coercion & urgency wording', `Urgent threats used: ${coercionHits.join(', ')}`, 'HIGH', 40));
      findings.scamEvidence = {
        status: 'COERCION_URGENCY',
        details: `Uses fear or urgent coercion tactics: ${coercionHits.join(', ')}.`,
        hits: coercionHits,
      };
    } else if (financialHits.length > 0) {
      signals.push(sig('S-FINANCIAL', 'Lottery / easy money claims', `Promised winnings/returns: ${financialHits.join(', ')}`, 'HIGH', 35));
      findings.scamEvidence = {
        status: 'FINANCIAL_SCAM',
        details: `Promises unrealistic financial rewards or lottery winnings: ${financialHits.join(', ')}.`,
        hits: financialHits,
      };
    }
  }

  // 4. Content / Legality Advisory (Streaming, Piracy, Gambling, Warez)
  checksRun.push('Content classification & advisory check');
  const isPiracyTitle = PIRACY_REGEX.test(pageTitle || '') || /movierulz|netmirror|tamilrockers|1337x|thepiratebay|piratebay|123movies|fmovies|soap2day|torrent magnet|watch .* online free|free movies? online/i.test(pageTitle || '');
  const isPiracyDomain =
    STREAMING_PIRACY_DOMAINS.has(parsed.registrableDomain) ||
    PIRACY_REGEX.test(parsed.hostname) ||
    PIRACY_REGEX.test(parsed.domainLabel) ||
    PIRACY_NAME_PATTERN.test(parsed.domainLabel) ||
    isPiracyTitle;

  const piracyHits = pageHtml ? countHits(pageHtml.toLowerCase(), PIRACY_TEXT) : [];
  const gamblingHits = pageHtml ? countHits(pageHtml.toLowerCase(), GAMBLING_TEXT) : [];
  const crackHits = pageHtml ? countHits(pageHtml.toLowerCase(), CRACK_TEXT) : [];

  const combinedPageText = ((pageTitle || '') + ' ' + (pageHtml || '') + ' ' + (textSnippet || '')).toLowerCase();

  // Deceptive login / credential trap on piracy/streaming portal (e.g. NetMirror login required)
  const isDeceptivePiracyLogin =
    (isPiracyDomain || piracyHits.length >= 2) &&
    /(login required|complete your login|sign in to (watch|stream|view|download)|register to (watch|stream|view)|account required)/i.test(combinedPageText);

  if (isDeceptivePiracyLogin) {
    signals.push(
      sig(
        'S-PIRACY-LOGIN',
        'Deceptive login trap on piracy streaming portal',
        `Page requires user login/registration on unauthorized movie mirror '${parsed.hostname}'. Illicit piracy mirrors use account traps to harvest credentials or promote subscription fraud.`,
        'CRITICAL',
        65
      )
    );
    findings.scamEvidence = {
      status: 'CREDENTIAL_HARVESTING',
      details: `Deceptive 'Login Required' registration on unauthorized movie streaming mirror (${parsed.hostname}). Piracy mirrors use login prompts to harvest credentials or trick users into fraudulent subscription schemes.`,
      hits: ['login required on streaming mirror'],
    };
  }

  if (isPiracyDomain || piracyHits.length >= 2) {
    signals.push(
      sig(
        'C-PIRACY',
        'Illicit streaming / copyright piracy domain',
        `Domain '${parsed.hostname}' is an unauthorized movie/media piracy portal or torrent mirror. Piracy portals present significant security risks including malvertising, fraudulent pop-unders, deceptive redirect loops, and malicious downloads.`,
        'HIGH',
        40
      )
    );
    signals.push(
      sig(
        'C-PIRACY-FRAUD',
        'Piracy malvertising & deceptive media risk',
        'Media piracy sites frequently host deceptive "Download / Play" buttons, fake security alerts, and fraudulent registration portals.',
        'MEDIUM',
        25
      )
    );
    findings.contentAdvisory = {
      status: 'STREAMING_PIRACY',
      details: `Illicit streaming or copyright piracy portal detected (${parsed.hostname}). Known piracy hubs present elevated risk of malvertising, fraudulent redirects, deceptive download prompts, and unlicensed media distribution.`,
    };
  } else if (gamblingHits.length >= 2) {
    signals.push(sig('C-GAMBLING', 'Online gambling / betting advisory', `Detected betting and real-money gaming terminology: ${gamblingHits.join(', ')}.`, 'MEDIUM', 25));
    findings.contentAdvisory = {
      status: 'GAMBLING',
      details: 'Online betting or real-money gambling content advisory.',
    };
  } else if (crackHits.length >= 2) {
    signals.push(sig('C-CRACK', 'Software crack / keygen advisory', `Detected software crack / keygen terminology: ${crackHits.join(', ')}.`, 'HIGH', 40));
    findings.contentAdvisory = {
      status: 'CRACK_WAREZ',
      details: 'Cracked software or activator advisory. Downloadable binaries from unverified distributors carry elevated malware risk.',
    };
  }

  return { parsed, brandStatus, signals, findings, checksRun, checksFailed };
}

/**
 * Determines the final verdict based on evidence and server connection status.
 */
export function deriveVerdict(
  findings: FindingsBreakdown,
  serverStatus: 'CONNECTED' | 'NOT_SIGNED_IN' | 'UNAVAILABLE' | 'TIMED_OUT',
  serverSignals: Signal[] = [],
  serverRiskLevel?: RiskLevel
): { verdict: ExtensionVerdict; title: string; reason: string; riskLevel: RiskLevel; riskScore: number } {
  // 1. Technical Threat -> UNSAFE
  if (findings.technicalThreat.status === 'MALICIOUS' || serverRiskLevel === 'MALICIOUS' || serverSignals.some((s) => s.severity === 'CRITICAL')) {
    return {
      verdict: 'UNSAFE',
      title: 'Unsafe — technical threat detected',
      reason: findings.technicalThreat.evidence.length > 0
        ? findings.technicalThreat.evidence.join('; ')
        : 'Specific technical threat identified by threat intelligence (malware delivery or phishing payload).',
      riskLevel: 'MALICIOUS',
      riskScore: 85,
    };
  }

  // 2. Credible Impersonation / Scam -> FRAUD
  if (
    findings.brandAuthenticity.status === 'DECEPTIVE_SUBDOMAIN' ||
    findings.brandAuthenticity.status === 'LOOKALIKE' ||
    findings.scamEvidence.status === 'CREDENTIAL_HARVESTING' ||
    findings.scamEvidence.status === 'COERCION_URGENCY' ||
    serverRiskLevel === 'HIGH_RISK'
  ) {
    const reasonParts: string[] = [];
    if (findings.brandAuthenticity.status === 'DECEPTIVE_SUBDOMAIN' || findings.brandAuthenticity.status === 'LOOKALIKE') {
      reasonParts.push(findings.brandAuthenticity.details);
    }
    if (findings.scamEvidence.status !== 'NONE') {
      reasonParts.push(findings.scamEvidence.details);
    }
    return {
      verdict: 'FRAUD',
      title: 'Fraud — scam or impersonation evidence',
      reason: reasonParts.join('  ') || 'Credible evidence of brand impersonation or financial fraud.',
      riskLevel: 'HIGH_RISK',
      riskScore: 75,
    };
  }

  // 3. Content Advisory: Piracy / Illicit Streaming / Warez Crack -> SUSPICIOUS
  if (findings.contentAdvisory.status === 'STREAMING_PIRACY' || findings.contentAdvisory.status === 'CRACK_WAREZ') {
    const isCrack = findings.contentAdvisory.status === 'CRACK_WAREZ';
    const title = isCrack
      ? 'Suspicious — Cracked software / malware risk'
      : 'Suspicious — Illicit movie streaming / piracy risk';
    const hasTechIndicators = findings.technicalThreat.evidence.length > 0;
    const reason = `${findings.contentAdvisory.details}${hasTechIndicators ? ' (' + findings.technicalThreat.evidence.join('; ') + ')' : ''}`;
    return {
      verdict: 'SUSPICIOUS',
      title,
      reason,
      riskLevel: 'SUSPICIOUS',
      riskScore: hasTechIndicators ? 70 : 65,
    };
  }

  // 4. Technical Threat Warning (Burner TLD, TDS redirect, random subdomain) -> SUSPICIOUS
  if (findings.technicalThreat.status === 'SUSPICIOUS' || serverSignals.some((s) => s.weight >= 25)) {
    return {
      verdict: 'SUSPICIOUS',
      title: 'Suspicious — warning indicators detected',
      reason: findings.technicalThreat.evidence.length > 0
        ? findings.technicalThreat.evidence.join('; ')
        : 'Domain exhibits suspicious indicators (disposable/burner TLD, malvertising redirect parameters, or disguised host).',
      riskLevel: 'SUSPICIOUS',
      riskScore: 55,
    };
  }

  // 5. Unverified Brand Claim -> UNVERIFIED
  if (findings.brandAuthenticity.status === 'UNVERIFIED_CLAIM') {
    return {
      verdict: 'UNVERIFIED',
      title: 'Unverified brand claim',
      reason: findings.brandAuthenticity.details + ' Could not independently confirm whether this domain is authorized.',
      riskLevel: 'SUSPICIOUS',
      riskScore: 40,
    };
  }

  // 6. Server check unavailable / offline and NOT an authoritative known official domain -> UNVERIFIED
  if (serverStatus !== 'CONNECTED') {
    if (findings.brandAuthenticity.status === 'OFFICIAL') {
      // Known authoritative domain (e.g. hdfc.bank.in, google.com, wikipedia.org)
      return {
        verdict: 'SAFE_SIGNALS_FOUND',
        title: 'Safe signals found (Official domain verified)',
        reason: `${findings.brandAuthenticity.details} No known threats found in local checks. Note: Safe signals do not guarantee absolute safety.`,
        riskLevel: 'SAFE',
        riskScore: 5,
      };
    }

    // Third party domain without cloud threat intel:
    const statusLabel =
      serverStatus === 'NOT_SIGNED_IN'
        ? 'server check requires sign in'
        : serverStatus === 'TIMED_OUT'
        ? 'server check timed out'
        : 'server check unavailable';

    let reasonMsg = `Unverified — ${statusLabel}. Local heuristic checks ran cleanly, but authoritative cloud threat intelligence could not be reached.`;
    if (findings.contentAdvisory.status !== 'CLEAN') {
      reasonMsg += ` Advisory: ${findings.contentAdvisory.details}`;
    }

    return {
      verdict: 'UNVERIFIED',
      title: `Unverified — ${statusLabel}`,
      reason: reasonMsg,
      riskLevel: 'SUSPICIOUS',
      riskScore: 25,
    };
  }

  // 7. Connected server check - Official domain verified
  if (findings.brandAuthenticity.status === 'OFFICIAL') {
    return {
      verdict: 'SAFE_SIGNALS_FOUND',
      title: 'Safe signals found (Official domain verified)',
      reason: `${findings.brandAuthenticity.details} Checks found no known technical threats. Note: This does not guarantee absolute safety.`,
      riskLevel: 'SAFE',
      riskScore: 5,
    };
  }

  // 8. Connected server check on general third-party domain without flags -> NO_KNOWN_THREATS
  let reason = 'Checks found no known technical threats, impersonation, or scam indicators. Note: This does not guarantee absolute safety.';
  if (findings.contentAdvisory.status !== 'CLEAN') {
    reason = `No technical malware or fraud detected. Advisory: ${findings.contentAdvisory.details}`;
  }
  return {
    verdict: 'NO_KNOWN_THREATS',
    title: findings.contentAdvisory.status !== 'CLEAN' ? 'No known threats (Content advisory)' : 'No known threats detected',
    reason,
    riskLevel: 'SAFE',
    riskScore: findings.contentAdvisory.status !== 'CLEAN' ? 15 : 10,
  };
}

export function localAnalyze(req: AnalyzeRequest): AnalyzeResponse {
  const isText = req.type === 'SOCIAL' || req.type === 'SMS' || req.type === 'EMAIL';
  const url = req.type === 'WEBPAGE' && req.pageUrl ? req.pageUrl : req.content;
  const html = req.type === 'WEBPAGE' ? req.content : '';
  const text = isText ? req.content : '';

  const { signals, findings, checksRun, checksFailed } = evaluateLocalSignals(url, html, text);

  // When running locally with no server, mark server status as NOT_SIGNED_IN or UNAVAILABLE
  const serverStatus: 'NOT_SIGNED_IN' = 'NOT_SIGNED_IN';
  checksFailed.push('Cloud threat intelligence check (sign in required for server check)');

  const outcome = deriveVerdict(findings, serverStatus, [], undefined);

  return {
    reportId: 'local-' + Date.now(),
    contentType: req.type,
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
    signals,
    explanation: outcome.reason,
    recommendations: outcome.verdict === 'UNSAFE' || outcome.verdict === 'FRAUD'
      ? [
          'Do not enter passwords, OTPs, or financial details on this page.',
          'Verify the destination by typing the known official address manually.',
          'Close the tab if you were directed here via unsolicited messages or suspicious links.',
        ]
      : outcome.verdict === 'UNVERIFIED'
      ? [
          'Server verification is unavailable. Proceed with caution.',
          'Verify the domain name carefully in the browser address bar before interacting.',
          'Sign in to CyberShield to enable full cloud threat-intelligence lookups.',
        ]
      : [
          'Safe signals were detected, but always stay cautious.',
          'Ensure the URL in the address bar matches your intended destination.',
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
