/**
 * Domain parsing and brand authenticity detection.
 * 
 * - Multi-part Public Suffix List (ccSLDs like bank.in, co.in, co.uk, gov.in, etc.)
 * - Strict registrable domain and subdomain separation
 * - Curated official brand directory
 * - Elimination of naive substring matching: prevents false positives on words like "pineapple" for "apple"
 *   or "hdfc.bank.in" for "hdfc".
 */

export interface ParsedDomain {
  raw: string;
  normalizedUrl: string;
  hostname: string;
  registrableDomain: string;
  domainLabel: string;
  subdomain: string;
  publicSuffix: string;
  isIpAddress: boolean;
  isPunycode: boolean;
  hasUserInfo: boolean;
  protocol: string;
  pathname: string;
}

export type BrandStatus =
  | { kind: 'OFFICIAL'; brand: string; officialDomain: string }
  | { kind: 'DECEPTIVE_SUBDOMAIN'; brand: string; officialDomain: string; details: string }
  | { kind: 'LOOKALIKE_DOMAIN'; brand: string; officialDomain: string; details: string }
  | { kind: 'PAGE_BRAND_IMPERSONATION'; brand: string; officialDomain: string; details: string }
  | { kind: 'UNVERIFIED_BRAND_CLAIM'; brand: string; details: string }
  | { kind: 'UNRELATED' };

// Comprehensive list of two-part public suffixes / ccSLDs
const KNOWN_TWO_PART_SUFFIXES = new Set([
  // India (.in)
  'bank.in', 'co.in', 'com.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in',
  'nic.in', 'ac.in', 'edu.in', 'res.in', 'gov.in', 'mil.in',
  // UK (.uk)
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'gov.uk', 'ac.uk', 'police.uk', 'nhs.uk',
  // Australia (.au)
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // New Zealand (.nz)
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  // Japan (.jp)
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp',
  // Brazil (.br)
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  // South Africa (.za)
  'co.za', 'net.za', 'org.za', 'gov.za', 'ac.za',
  // Singapore (.sg)
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  // Canada (.ca)
  'gc.ca',
]);

// Curated authoritative brand directory
export const OFFICIAL_BRANDS: Record<string, string[]> = {
  hdfc: ['hdfcbank.com', 'hdfc.bank.in', 'hdfc.com', 'hdfcbank.net', 'hdfcsec.com', 'hdfcfund.com'],
  sbi: ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com', 'sbicard.com', 'sbimf.com', 'sbilife.co.in'],
  icici: ['icicibank.com', 'icicibank.in', 'icici.com', 'icicidirect.com', 'iciciprulife.com'],
  axis: ['axisbank.com', 'axisbank.in', 'axisbank.co.in'],
  kotak: ['kotak.com', 'kotakbank.com'],
  paytm: ['paytm.com', 'paytmbank.com'],
  phonepe: ['phonepe.com'],
  google: ['google.com', 'google.co.in', 'google.co.uk', 'gmail.com', 'youtube.com', 'gstatic.com', 'googlevideo.com'],
  microsoft: ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'msn.com', 'azure.com', 'windows.com', 'bing.com'],
  apple: ['apple.com', 'icloud.com'],
  amazon: ['amazon.com', 'amazon.in', 'amazon.co.uk', 'aws.amazon.com', 'media-amazon.com'],
  paypal: ['paypal.com', 'paypal.me'],
  netflix: ['netflix.com'],
  facebook: ['facebook.com', 'fb.com', 'meta.com'],
  instagram: ['instagram.com'],
  whatsapp: ['whatsapp.com'],
  irctc: ['irctc.co.in'],
  uidai: ['uidai.gov.in'],
  incometax: ['incometax.gov.in', 'incometaxindia.gov.in'],
  rbi: ['rbi.org.in'],
  openai: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com'],
  anthropic: ['anthropic.com', 'claude.ai'],
};

// Generic list of well-known public domains that have high trust reputation
export const CURATED_TRUSTED_DOMAINS = new Set<string>([
  'wikipedia.org',
  'github.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'cloudflare.com',
  'mozilla.org',
  'w3.org',
  'iana.org',
  'gov.in',
  'nic.in',
  'onrender.com',
  ...Object.values(OFFICIAL_BRANDS).flat(),
]);

export function parseDomain(rawUrl: string): ParsedDomain {
  let s = (rawUrl || '').trim();
  let normalized = s;
  let hasUserInfo = false;

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    normalized = 'https://' + s;
  }

  let u: URL;
  try {
    u = new URL(normalized);
    hasUserInfo = Boolean(u.username || u.password);
  } catch {
    // Fallback best-effort parser
    const clean = s.replace(/^[a-zA-Z]+:\/\//, '').split('/')[0];
    return {
      raw: rawUrl,
      normalizedUrl: normalized,
      hostname: clean.toLowerCase(),
      registrableDomain: clean.toLowerCase(),
      domainLabel: clean.toLowerCase(),
      subdomain: '',
      publicSuffix: '',
      isIpAddress: /^\d{1,3}(\.\d{1,3}){3}$/.test(clean),
      isPunycode: clean.includes('xn--'),
      hasUserInfo: false,
      protocol: 'https:',
      pathname: '/',
    };
  }

  let host = u.hostname.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);

  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[') || (host.includes(':') && /^[0-9a-fA-F:]+$/.test(host));
  const isPunycode = host.includes('xn--');

  if (isIpAddress) {
    return {
      raw: rawUrl,
      normalizedUrl: u.href,
      hostname: host,
      registrableDomain: host,
      domainLabel: host,
      subdomain: '',
      publicSuffix: '',
      isIpAddress: true,
      isPunycode: false,
      hasUserInfo,
      protocol: u.protocol,
      pathname: u.pathname,
    };
  }

  const parts = host.split('.');
  let publicSuffix = '';
  let registrableDomain = host;
  let domainLabel = host;
  let subdomain = '';

  if (parts.length >= 2) {
    const last1 = parts[parts.length - 1];
    const last2 = parts.length >= 2 ? `${parts[parts.length - 2]}.${last1}` : '';

    // Check known 2-part suffixes (e.g., bank.in, co.uk, gov.in)
    const isKnownTwoPart = KNOWN_TWO_PART_SUFFIXES.has(last2) ||
      (last1.length === 2 && /^(co|com|net|org|gov|edu|ac|nic|mil|res)\.[a-z]{2}$/.test(last2));

    if (isKnownTwoPart && parts.length >= 3) {
      publicSuffix = last2;
      registrableDomain = `${parts[parts.length - 3]}.${last2}`;
      domainLabel = parts[parts.length - 3];
      subdomain = parts.slice(0, parts.length - 3).join('.');
    } else {
      publicSuffix = last1;
      registrableDomain = `${parts[parts.length - 2]}.${last1}`;
      domainLabel = parts[parts.length - 2];
      subdomain = parts.slice(0, parts.length - 2).join('.');
    }
  }

  return {
    raw: rawUrl,
    normalizedUrl: u.href,
    hostname: host,
    registrableDomain,
    domainLabel,
    subdomain,
    publicSuffix,
    isIpAddress,
    isPunycode,
    hasUserInfo,
    protocol: u.protocol,
    pathname: u.pathname,
  };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const PHISHING_INTENT_KEYWORDS = new Set([
  'login', 'verify', 'verification', 'update', 'secure', 'security', 'auth', 'authentication',
  'account', 'banking', 'portal', 'kyc', 'support', 'help', 'recover', 'wallet', 'signin', 'logon'
]);

/**
 * Checks brand authenticity without naive substring matching.
 */
export function checkBrandAuthenticity(parsed: ParsedDomain): BrandStatus {
  if (parsed.isIpAddress) {
    return { kind: 'UNRELATED' };
  }

  const reg = parsed.registrableDomain.toLowerCase();
  const label = parsed.domainLabel.toLowerCase();
  const sub = parsed.subdomain.toLowerCase();

  for (const [brand, officialList] of Object.entries(OFFICIAL_BRANDS)) {
    // 1. Official domain check: is the registrable domain in the official list?
    if (officialList.includes(reg)) {
      return { kind: 'OFFICIAL', brand, officialDomain: officialList[0] };
    }

    // 2. Deceptive Subdomain: The registered domain is an unrelated third party,
    // but the subdomain explicitly contains the brand as a token or domain simulation
    // e.g. "hdfc.banking-portal.com" or "paypal.com.verify-user.xyz"
    if (sub.length > 0) {
      const subTokens = sub.split(/[.-]/);
      if (subTokens.includes(brand)) {
        return {
          kind: 'DECEPTIVE_SUBDOMAIN',
          brand,
          officialDomain: officialList[0],
          details: `The brand name '${brand}' is used in a subdomain of unrelated domain '${reg}'. Official domain is ${officialList[0]}.`
        };
      }
    }

    // 3. Lookalike / Typosquatting in Domain Label:
    // A) Near-miss edit distance (e.g., paypa1, micros0ft, amaz0n)
    if (brand.length >= 4 && label !== brand) {
      const dist = levenshtein(label, brand);
      if (dist === 1 && Math.abs(label.length - brand.length) <= 1) {
        return {
          kind: 'LOOKALIKE_DOMAIN',
          brand,
          officialDomain: officialList[0],
          details: `'${label}' is a character-substitution lookalike of '${brand}'. Official domain is ${officialList[0]}.`
        };
      }
    }

    // B) Isolated token combined with phishing intent keywords (e.g. "hdfc-login", "paypal-verify")
    // Note: Words like "pineapple" do NOT split into ["pine", "apple"] or match isolated brand token
    const labelTokens = label.split('-');
    if (labelTokens.includes(brand)) {
      const hasPhishingWord = labelTokens.some((tok) => PHISHING_INTENT_KEYWORDS.has(tok));
      if (hasPhishingWord) {
        return {
          kind: 'LOOKALIKE_DOMAIN',
          brand,
          officialDomain: officialList[0],
          details: `'${label}' pairs brand token '${brand}' with verification keyword. Official domain is ${officialList[0]}.`
        };
      } else {
        // Just brand token with generic non-phishing word: unverified brand claim
        return {
          kind: 'UNVERIFIED_BRAND_CLAIM',
          brand,
          details: `Site label '${label}' uses brand '${brand}', but '${reg}' is not in the official brand directory.`
        };
      }
    }
  }

  return { kind: 'UNRELATED' };
}

/**
 * Checks if the rendered page content or title claims/mimics a protected brand
 * when hosted on an unauthorized, unrelated domain.
 */
export function checkPageBrandImpersonation(
  parsed: ParsedDomain,
  pageContent: string,
  pageTitle?: string
): BrandStatus {
  if (parsed.isIpAddress) {
    return { kind: 'UNRELATED' };
  }

  const reg = parsed.registrableDomain.toLowerCase();
  const text = ((pageTitle ? pageTitle + ' ' : '') + (pageContent || '')).toLowerCase();

  if (!text || text.length < 5) {
    return { kind: 'UNRELATED' };
  }

  const hasLoginIntent = /(login|log in|sign in|signin|password|username|complete your login|login required|user verification|account access)/i.test(text);

  for (const [brand, officialList] of Object.entries(OFFICIAL_BRANDS)) {
    // If this is an official domain of the brand, it's legit
    if (officialList.includes(reg)) {
      continue;
    }

    // Look for strong brand signal in page title or prominent text
    // We match whole-word brand name e.g. "netflix", "sbi", "paypal"
    const brandRegex = new RegExp(`\\b${brand}\\b`, 'i');
    const inTitle = pageTitle ? brandRegex.test(pageTitle) : false;
    const inText = brandRegex.test(text);

    if (inTitle || inText) {
      if (hasLoginIntent) {
        return {
          kind: 'PAGE_BRAND_IMPERSONATION',
          brand: brand.toUpperCase(),
          officialDomain: officialList[0],
          details: `Page displays '${brand.toUpperCase()}' branding with login/credential prompts on unauthorized domain '${reg}'. Official domain is ${officialList[0]}.`,
        };
      }

      // If the brand is prominently in the page title or domain label claims it
      if (inTitle) {
        return {
          kind: 'UNVERIFIED_BRAND_CLAIM',
          brand: brand.toUpperCase(),
          details: `Page title claims '${brand.toUpperCase()}' branding, but '${reg}' is not an authorized official domain. Official is ${officialList[0]}.`,
        };
      }
    }

    // Explicit check for known streaming clones mimicking brand (e.g. NetMirror mimicking Netflix)
    if (brand === 'netflix') {
      const isNetMirror = /netmirror/i.test(parsed.hostname) || /netmirror/i.test(pageTitle || '') || /netmirror/i.test(text);
      if (isNetMirror && reg !== 'netflix.com') {
        if (hasLoginIntent) {
          return {
            kind: 'PAGE_BRAND_IMPERSONATION',
            brand: 'NETFLIX',
            officialDomain: 'netflix.com',
            details: `Page presents 'NetMirror' unauthorized streaming mirror mimicking Netflix with deceptive login/registration prompts on '${reg}'. Official domain is netflix.com.`,
          };
        }
        return {
          kind: 'LOOKALIKE_DOMAIN',
          brand: 'NETFLIX',
          officialDomain: 'netflix.com',
          details: `'${parsed.hostname}' presents 'NetMirror', an unauthorized mirror mimicking Netflix branding and media catalog. Official domain is netflix.com.`,
        };
      }
    }
  }

  return { kind: 'UNRELATED' };
}
