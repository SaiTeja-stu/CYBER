// test/domain_and_verdict.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

// src/domain.ts
var KNOWN_TWO_PART_SUFFIXES = /* @__PURE__ */ new Set([
  // India (.in)
  "bank.in",
  "co.in",
  "com.in",
  "net.in",
  "org.in",
  "gen.in",
  "firm.in",
  "ind.in",
  "nic.in",
  "ac.in",
  "edu.in",
  "res.in",
  "gov.in",
  "mil.in",
  // UK (.uk)
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "net.uk",
  "gov.uk",
  "ac.uk",
  "police.uk",
  "nhs.uk",
  // Australia (.au)
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "asn.au",
  "id.au",
  // New Zealand (.nz)
  "co.nz",
  "net.nz",
  "org.nz",
  "govt.nz",
  "ac.nz",
  // Japan (.jp)
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "go.jp",
  "ed.jp",
  // Brazil (.br)
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  // South Africa (.za)
  "co.za",
  "net.za",
  "org.za",
  "gov.za",
  "ac.za",
  // Singapore (.sg)
  "com.sg",
  "net.sg",
  "org.sg",
  "gov.sg",
  "edu.sg",
  // Canada (.ca)
  "gc.ca"
]);
var OFFICIAL_BRANDS = {
  hdfc: ["hdfcbank.com", "hdfc.bank.in", "hdfc.com", "hdfcbank.net", "hdfcsec.com", "hdfcfund.com"],
  sbi: ["sbi.co.in", "onlinesbi.sbi", "onlinesbi.com", "sbicard.com", "sbimf.com", "sbilife.co.in"],
  icici: ["icicibank.com", "icicibank.in", "icici.com", "icicidirect.com", "iciciprulife.com"],
  axis: ["axisbank.com", "axisbank.in", "axisbank.co.in"],
  kotak: ["kotak.com", "kotakbank.com"],
  paytm: ["paytm.com", "paytmbank.com"],
  phonepe: ["phonepe.com"],
  google: ["google.com", "google.co.in", "google.co.uk", "gmail.com", "youtube.com", "gstatic.com", "googlevideo.com"],
  microsoft: ["microsoft.com", "live.com", "office.com", "outlook.com", "msn.com", "azure.com", "windows.com", "bing.com"],
  apple: ["apple.com", "icloud.com"],
  amazon: ["amazon.com", "amazon.in", "amazon.co.uk", "aws.amazon.com", "media-amazon.com"],
  paypal: ["paypal.com", "paypal.me"],
  netflix: ["netflix.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  instagram: ["instagram.com"],
  whatsapp: ["whatsapp.com"],
  irctc: ["irctc.co.in"],
  uidai: ["uidai.gov.in"],
  incometax: ["incometax.gov.in", "incometaxindia.gov.in"],
  rbi: ["rbi.org.in"],
  openai: ["openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com"],
  anthropic: ["anthropic.com", "claude.ai"]
};
var CURATED_TRUSTED_DOMAINS = /* @__PURE__ */ new Set([
  "wikipedia.org",
  "github.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "cloudflare.com",
  "mozilla.org",
  "w3.org",
  "iana.org",
  "gov.in",
  "nic.in",
  "onrender.com",
  ...Object.values(OFFICIAL_BRANDS).flat()
]);
function parseDomain(rawUrl) {
  let s = (rawUrl || "").trim();
  let normalized = s;
  let hasUserInfo = false;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    normalized = "https://" + s;
  }
  let u;
  try {
    u = new URL(normalized);
    hasUserInfo = Boolean(u.username || u.password);
  } catch {
    const clean = s.replace(/^[a-zA-Z]+:\/\//, "").split("/")[0];
    return {
      raw: rawUrl,
      normalizedUrl: normalized,
      hostname: clean.toLowerCase(),
      registrableDomain: clean.toLowerCase(),
      domainLabel: clean.toLowerCase(),
      subdomain: "",
      publicSuffix: "",
      isIpAddress: /^\d{1,3}(\.\d{1,3}){3}$/.test(clean),
      isPunycode: clean.includes("xn--"),
      hasUserInfo: false,
      protocol: "https:",
      pathname: "/"
    };
  }
  let host = u.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("[") || host.includes(":") && /^[0-9a-fA-F:]+$/.test(host);
  const isPunycode = host.includes("xn--");
  if (isIpAddress) {
    return {
      raw: rawUrl,
      normalizedUrl: u.href,
      hostname: host,
      registrableDomain: host,
      domainLabel: host,
      subdomain: "",
      publicSuffix: "",
      isIpAddress: true,
      isPunycode: false,
      hasUserInfo,
      protocol: u.protocol,
      pathname: u.pathname
    };
  }
  const parts = host.split(".");
  let publicSuffix = "";
  let registrableDomain = host;
  let domainLabel = host;
  let subdomain = "";
  if (parts.length >= 2) {
    const last1 = parts[parts.length - 1];
    const last2 = parts.length >= 2 ? `${parts[parts.length - 2]}.${last1}` : "";
    const isKnownTwoPart = KNOWN_TWO_PART_SUFFIXES.has(last2) || last1.length === 2 && /^(co|com|net|org|gov|edu|ac|nic|mil|res)\.[a-z]{2}$/.test(last2);
    if (isKnownTwoPart && parts.length >= 3) {
      publicSuffix = last2;
      registrableDomain = `${parts[parts.length - 3]}.${last2}`;
      domainLabel = parts[parts.length - 3];
      subdomain = parts.slice(0, parts.length - 3).join(".");
    } else {
      publicSuffix = last1;
      registrableDomain = `${parts[parts.length - 2]}.${last1}`;
      domainLabel = parts[parts.length - 2];
      subdomain = parts.slice(0, parts.length - 2).join(".");
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
    pathname: u.pathname
  };
}
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
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
var PHISHING_INTENT_KEYWORDS = /* @__PURE__ */ new Set([
  "login",
  "verify",
  "verification",
  "update",
  "secure",
  "security",
  "auth",
  "authentication",
  "account",
  "banking",
  "portal",
  "kyc",
  "support",
  "help",
  "recover",
  "wallet",
  "signin",
  "logon"
]);
function checkBrandAuthenticity(parsed) {
  if (parsed.isIpAddress) {
    return { kind: "UNRELATED" };
  }
  const reg = parsed.registrableDomain.toLowerCase();
  const label = parsed.domainLabel.toLowerCase();
  const sub = parsed.subdomain.toLowerCase();
  for (const [brand, officialList] of Object.entries(OFFICIAL_BRANDS)) {
    if (officialList.includes(reg)) {
      return { kind: "OFFICIAL", brand, officialDomain: officialList[0] };
    }
    if (sub.length > 0) {
      const subTokens = sub.split(/[.-]/);
      if (subTokens.includes(brand)) {
        return {
          kind: "DECEPTIVE_SUBDOMAIN",
          brand,
          officialDomain: officialList[0],
          details: `The brand name '${brand}' is used in a subdomain of unrelated domain '${reg}'. Official domain is ${officialList[0]}.`
        };
      }
    }
    if (brand.length >= 4 && label !== brand) {
      const dist = levenshtein(label, brand);
      if (dist === 1 && Math.abs(label.length - brand.length) <= 1) {
        return {
          kind: "LOOKALIKE_DOMAIN",
          brand,
          officialDomain: officialList[0],
          details: `'${label}' is a character-substitution lookalike of '${brand}'. Official domain is ${officialList[0]}.`
        };
      }
    }
    const labelTokens = label.split("-");
    if (labelTokens.includes(brand)) {
      const hasPhishingWord = labelTokens.some((tok) => PHISHING_INTENT_KEYWORDS.has(tok));
      if (hasPhishingWord) {
        return {
          kind: "LOOKALIKE_DOMAIN",
          brand,
          officialDomain: officialList[0],
          details: `'${label}' pairs brand token '${brand}' with verification keyword. Official domain is ${officialList[0]}.`
        };
      } else {
        return {
          kind: "UNVERIFIED_BRAND_CLAIM",
          brand,
          details: `Site label '${label}' uses brand '${brand}', but '${reg}' is not in the official brand directory.`
        };
      }
    }
  }
  return { kind: "UNRELATED" };
}
function checkPageBrandImpersonation(parsed, pageContent, pageTitle) {
  if (parsed.isIpAddress) {
    return { kind: "UNRELATED" };
  }
  const reg = parsed.registrableDomain.toLowerCase();
  const text = ((pageTitle ? pageTitle + " " : "") + (pageContent || "")).toLowerCase();
  if (!text || text.length < 5) {
    return { kind: "UNRELATED" };
  }
  const hasLoginIntent = /(login|log in|sign in|signin|password|username|complete your login|login required|user verification|account access)/i.test(text);
  for (const [brand, officialList] of Object.entries(OFFICIAL_BRANDS)) {
    if (officialList.includes(reg)) {
      continue;
    }
    const brandRegex = new RegExp(`\\b${brand}\\b`, "i");
    const inTitle = pageTitle ? brandRegex.test(pageTitle) : false;
    const inText = brandRegex.test(text);
    if (inTitle || inText) {
      if (hasLoginIntent) {
        return {
          kind: "PAGE_BRAND_IMPERSONATION",
          brand: brand.toUpperCase(),
          officialDomain: officialList[0],
          details: `Page displays '${brand.toUpperCase()}' branding with login/credential prompts on unauthorized domain '${reg}'. Official domain is ${officialList[0]}.`
        };
      }
      if (inTitle) {
        return {
          kind: "UNVERIFIED_BRAND_CLAIM",
          brand: brand.toUpperCase(),
          details: `Page title claims '${brand.toUpperCase()}' branding, but '${reg}' is not an authorized official domain. Official is ${officialList[0]}.`
        };
      }
    }
    if (brand === "netflix") {
      const isNetMirror = /netmirror/i.test(parsed.hostname) || /netmirror/i.test(pageTitle || "") || /netmirror/i.test(text);
      if (isNetMirror && reg !== "netflix.com") {
        if (hasLoginIntent) {
          return {
            kind: "PAGE_BRAND_IMPERSONATION",
            brand: "NETFLIX",
            officialDomain: "netflix.com",
            details: `Page presents 'NetMirror' unauthorized streaming mirror mimicking Netflix with deceptive login/registration prompts on '${reg}'. Official domain is netflix.com.`
          };
        }
        return {
          kind: "LOOKALIKE_DOMAIN",
          brand: "NETFLIX",
          officialDomain: "netflix.com",
          details: `'${parsed.hostname}' presents 'NetMirror', an unauthorized mirror mimicking Netflix branding and media catalog. Official domain is netflix.com.`
        };
      }
    }
  }
  return { kind: "UNRELATED" };
}

// src/local.ts
var SHORTENERS = /* @__PURE__ */ new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at"]);
var HIGH_ABUSE_TLDS = /* @__PURE__ */ new Set([
  "lol",
  "top",
  "click",
  "buzz",
  "rest",
  "tk",
  "ml",
  "ga",
  "cf",
  "gq",
  "monster",
  "fit",
  "surf",
  "stream",
  "cam",
  "work",
  "lat",
  "bid",
  "loan",
  "racing",
  "win",
  "date",
  "faith",
  "party",
  "review",
  "trade",
  "webcam",
  "cc",
  "vip",
  "cfd"
]);
var TDS_TRACKING_PARAMS = [
  "flow_id",
  "pubfeed",
  "carrier",
  "campaign",
  "conversion",
  "subid",
  "flow_k",
  "bid",
  "clickid",
  "trackid",
  "aff_id",
  "aff_sub",
  "target_id"
];
var KNOWN_PHISHING_TEST_DOMAINS = /* @__PURE__ */ new Set([
  "testsafebrowsing.appspot.com",
  "malware.testing.google.test",
  "phishing.eset.com",
  "wicar.org"
]);
var SCAM_COERCION_TEXT = [
  "kyc will be blocked",
  "account will be suspended",
  "digital arrest",
  "police warrant",
  "arrest warrant",
  "immediate arrest",
  "electricity will be disconnected",
  "sim card will be blocked",
  "pan card expired",
  "update your pan immediately",
  "unauthorized transaction detected"
];
var SCAM_FINANCIAL_TEXT = [
  "you have won",
  "lottery prize",
  "lucky draw winner",
  "claim your cash prize",
  "part time job earn daily",
  "work from home earn 5000",
  "guaranteed returns",
  "investment double in 7 days",
  "scan qr to receive money"
];
var OTP_THEFT_TEXT = [
  "share the otp",
  "send the otp",
  "enter your atm pin",
  "share your pin",
  "give your otp",
  "share otp with executive",
  "tell the otp",
  "forward the otp"
];
var STREAMING_PIRACY_DOMAINS = /* @__PURE__ */ new Set([
  "net77.cc",
  "1337x.to",
  "thepiratebay.org",
  "fmovies.to",
  "soap2day.to",
  "123movies.net",
  "yts.mx",
  "tamilrockers.ws",
  "movierulz.vpn",
  "ibomma.link",
  "5movierulz.academy",
  "4movierulz.to",
  "7movierulz.tc",
  "tamilmv.app",
  "tamilyogi.best",
  "netmirror.app"
]);
var PIRACY_REGEX = /(movierulz|5movierulz|4movierulz|7movierulz|tamilrockers|tamilmv|tamilyogi|isaimini|filmyzilla|filmywap|filmyhit|filmy4|9xmovies|9xflix|moviesflix|vegamovies|hdhub4u|bolly4u|khatrimaza|mkvcinemas|worldfree4u|7starhd|jiorockers|ibomma|kuttymovies|1337x|thepiratebay|piratebay|fmovies|soap2day|123movies|putlocker|tamilblasters|movies4u|moviesda|klwap|desiremovies|mp4moviez|cinevood|skymovieshd|net77|netmirror|moviezwap|jalshamoviez|hindilinks4u|extramovies|crazy4tv|filmymeet|djpunjab|okjatt|mp3juice|yts|nyaa|rarbg|limetorrents|torrentz|kickass)/i;
var PIRACY_NAME_PATTERN = /^(movies?|films?|filmy|bolly|holly|tamil|telugu|hindi|kannada|malayalam|mkv|hd|cine|cinema)[a-z0-9-]*(4u|wap|zilla|rulz|hub|flix|mad|world|mkv|hd|junction|blasters|rockers|verse|zone|point|base|4k|hit|bazaar|mp4)[a-z0-9]*$/i;
var PIRACY_TEXT = [
  "480p",
  "720p",
  "1080p",
  "300mb",
  "dual audio",
  "web-dl",
  "webrip",
  "hdrip",
  "camrip",
  "hdcam",
  "bluray",
  "torrent magnet",
  "torrent",
  "magnet:",
  "hindi dubbed",
  "telugu dubbed",
  "tamil dubbed",
  "free download",
  "download bollywood",
  "download hollywood",
  "featured movies free",
  "watch in tamil",
  "watch in telugu",
  "stream upto 1080p",
  "unlimited movies",
  "private streaming server",
  "latest indian movies"
];
var GAMBLING_TEXT = ["real cash rummy", "betting exchange", "satta matka", "teen patti real money", "online casino jackpot", "ipl betting odds"];
var CRACK_TEXT = ["crack download", "keygen.exe", "serial key generator", "full version free crack", "activator patch"];
function sig(policyId, name, detail, severity, weight) {
  return { policyId, name, detail, severity, weight };
}
function countHits(t, terms) {
  return terms.filter((term) => t.includes(term));
}
function evaluateLocalSignals(rawUrl, pageHtml, textSnippet, pageTitle) {
  const parsed = parseDomain(rawUrl);
  const brandStatus = checkBrandAuthenticity(parsed);
  const signals = [];
  const checksRun = [
    "Domain syntax & public suffix parsing",
    "Brand directory & lookalike evaluation",
    "Host & protocol security inspection"
  ];
  const checksFailed = [];
  const findings = {
    technicalThreat: {
      status: "CLEAN",
      details: "No technical threats, unencrypted credential submissions, or hostile payloads detected locally.",
      evidence: []
    },
    brandAuthenticity: {
      status: "UNRELATED",
      details: "No claimed or impersonated brand detected in domain or subdomains."
    },
    scamEvidence: {
      status: "NONE",
      details: "No coercion, OTP harvesting, or scam indicators detected.",
      hits: []
    },
    contentAdvisory: {
      status: "CLEAN",
      details: "No content or legality advisories."
    }
  };
  if (KNOWN_PHISHING_TEST_DOMAINS.has(parsed.hostname) || KNOWN_PHISHING_TEST_DOMAINS.has(parsed.registrableDomain)) {
    signals.push(sig("T-PHISH-TEST", "Known threat intelligence test domain", "Matched known safe phishing/threat test endpoint.", "CRITICAL", 85));
    findings.technicalThreat.status = "MALICIOUS";
    findings.technicalThreat.details = "Known threat intelligence test domain designed for phishing / security validation.";
    findings.technicalThreat.evidence.push(`Hostname matches ${parsed.hostname}`);
  }
  if (parsed.isIpAddress) {
    signals.push(sig("T-IP-HOST", "IP address hostname", `Host '${parsed.hostname}' is a raw IP address rather than a domain.`, "HIGH", 30));
    findings.technicalThreat.evidence.push(`Direct IP hostname: ${parsed.hostname}`);
    if (findings.technicalThreat.status === "CLEAN") findings.technicalThreat.status = "SUSPICIOUS";
  }
  if (parsed.isPunycode) {
    signals.push(sig("T-PUNYCODE", "Punycode / Homoglyph representation", `Domain uses punycode characters '${parsed.hostname}'.`, "HIGH", 30));
    findings.technicalThreat.evidence.push(`Punycode domain: ${parsed.hostname}`);
    if (findings.technicalThreat.status === "CLEAN") findings.technicalThreat.status = "SUSPICIOUS";
  }
  if (parsed.hasUserInfo) {
    signals.push(sig("T-USERINFO", "Embedded credentials in URL", "URL uses username@host syntax, often used to disguise actual destinations.", "HIGH", 35));
    findings.technicalThreat.evidence.push("Embedded user credentials in authority section");
    if (findings.technicalThreat.status === "CLEAN") findings.technicalThreat.status = "SUSPICIOUS";
  }
  const tld = parsed.publicSuffix.toLowerCase();
  const isAbuseTld = HIGH_ABUSE_TLDS.has(tld);
  if (isAbuseTld && !CURATED_TRUSTED_DOMAINS.has(parsed.registrableDomain)) {
    signals.push(sig("T-ABUSE-TLD", "High-abuse domain extension", `The '.${tld}' TLD is heavily associated with disposable domains, malvertising, and phishing.`, "HIGH", 30));
    if (findings.technicalThreat.status === "CLEAN") findings.technicalThreat.status = "SUSPICIOUS";
    findings.technicalThreat.evidence.push(`High-abuse disposable TLD: .${tld}`);
  }
  try {
    const urlObj = new URL(parsed.normalizedUrl);
    const searchParams = urlObj.searchParams;
    const tdsHits = TDS_TRACKING_PARAMS.filter((p) => searchParams.has(p));
    if (tdsHits.length >= 2 || tdsHits.length >= 1 && (isAbuseTld || parsed.subdomain.length > 3)) {
      signals.push(sig("T-TDS-REDIRECT", "Traffic Distribution System / Malvertising gateway", `URL contains tracking & redirect parameters characteristic of malvertising/TDS gateways: ${tdsHits.join(", ")}.`, "HIGH", 40));
      findings.technicalThreat.status = "SUSPICIOUS";
      findings.technicalThreat.evidence.push(`Malvertising / TDS tracking parameters: ${tdsHits.join(", ")}`);
    }
  } catch {
  }
  if (parsed.subdomain) {
    const firstSub = parsed.subdomain.split(".")[0];
    if (/^[a-f0-9]{5,}$/i.test(firstSub) || firstSub.length >= 5 && /\d/.test(firstSub) && /[a-z]/i.test(firstSub) && isAbuseTld) {
      signals.push(sig("T-HEX-SUBDOMAIN", "Generated random subdomain", `Subdomain '${firstSub}' appears algorithmically generated on burner host '${parsed.registrableDomain}'.`, "MEDIUM", 25));
      if (findings.technicalThreat.status === "CLEAN") findings.technicalThreat.status = "SUSPICIOUS";
      findings.technicalThreat.evidence.push(`Generated subdomain: ${parsed.subdomain}`);
    }
  }
  if (SHORTENERS.has(parsed.registrableDomain)) {
    signals.push(sig("T-SHORTENER", "URL shortener", `Uses URL shortening service '${parsed.registrableDomain}' which masks the true target.`, "MEDIUM", 15));
    findings.technicalThreat.evidence.push(`URL shortener: ${parsed.registrableDomain}`);
  }
  if (parsed.protocol === "http:" && !parsed.isIpAddress) {
    signals.push(sig("T-NO-HTTPS", "Unencrypted HTTP", "Traffic to this page is sent without TLS encryption.", "MEDIUM", 15));
  }
  if (pageHtml) {
    checksRun.push("DOM & form target security inspection");
    const hasPassword = /<input[^>]+type=["']?password/i.test(pageHtml);
    if (hasPassword && parsed.protocol === "http:") {
      signals.push(sig("T-PWD-HTTP", "Password field on unencrypted HTTP", "Passwords entered here would be transmitted in cleartext.", "CRITICAL", 50));
      findings.technicalThreat.status = "MALICIOUS";
      findings.technicalThreat.evidence.push("Password input on unencrypted HTTP page");
    }
    for (const match of pageHtml.matchAll(/<form[^>]+action=["'](https?:\/\/[^"']+)["']/gi)) {
      try {
        const actionHost = parseDomain(match[1]).registrableDomain;
        if (hasPassword && actionHost && actionHost !== parsed.registrableDomain) {
          signals.push(sig("T-HOSTILE-FORM", "Form action posts credentials cross-domain", `Form submits to third-party domain '${actionHost}'.`, "CRITICAL", 60));
          findings.technicalThreat.status = "MALICIOUS";
          findings.technicalThreat.evidence.push(`Form submits credentials to external '${actionHost}'`);
          break;
        }
      } catch {
      }
    }
  }
  if (findings.technicalThreat.status === "SUSPICIOUS" && findings.technicalThreat.evidence.length > 0) {
    findings.technicalThreat.details = findings.technicalThreat.evidence.join("; ");
  }
  let effectiveBrandStatus = brandStatus;
  if (effectiveBrandStatus.kind === "UNRELATED") {
    const pageBrand = checkPageBrandImpersonation(parsed, pageHtml || textSnippet, pageTitle);
    if (pageBrand.kind !== "UNRELATED") {
      effectiveBrandStatus = pageBrand;
    }
  }
  switch (effectiveBrandStatus.kind) {
    case "OFFICIAL":
      signals.push(sig("B-OFFICIAL", "Verified official domain", `${parsed.registrableDomain} is an independently verified official domain for ${effectiveBrandStatus.brand.toUpperCase()}.`, "TRUST", -40));
      findings.brandAuthenticity = {
        status: "OFFICIAL",
        brand: effectiveBrandStatus.brand.toUpperCase(),
        officialDomain: effectiveBrandStatus.officialDomain,
        details: `Independently verified official domain of ${effectiveBrandStatus.brand.toUpperCase()} (${effectiveBrandStatus.officialDomain}).`
      };
      break;
    case "PAGE_BRAND_IMPERSONATION":
      signals.push(sig("B-PAGE-IMPERSONATION", "In-page brand impersonation & credential prompt", effectiveBrandStatus.details, "CRITICAL", 70));
      findings.brandAuthenticity = {
        status: "LOOKALIKE",
        brand: effectiveBrandStatus.brand,
        officialDomain: effectiveBrandStatus.officialDomain,
        details: effectiveBrandStatus.details
      };
      break;
    case "DECEPTIVE_SUBDOMAIN":
      signals.push(sig("B-DECEPTIVE-SUB", "Deceptive brand subdomain", effectiveBrandStatus.details, "CRITICAL", 65));
      findings.brandAuthenticity = {
        status: "DECEPTIVE_SUBDOMAIN",
        brand: effectiveBrandStatus.brand.toUpperCase(),
        officialDomain: effectiveBrandStatus.officialDomain,
        details: effectiveBrandStatus.details
      };
      break;
    case "LOOKALIKE_DOMAIN":
      signals.push(sig("B-LOOKALIKE", "Brand lookalike / typosquatting", effectiveBrandStatus.details, "CRITICAL", 60));
      findings.brandAuthenticity = {
        status: "LOOKALIKE",
        brand: effectiveBrandStatus.brand.toUpperCase(),
        officialDomain: effectiveBrandStatus.officialDomain,
        details: effectiveBrandStatus.details
      };
      break;
    case "UNVERIFIED_BRAND_CLAIM":
      signals.push(sig("B-UNVERIFIED", "Unverified brand claim", effectiveBrandStatus.details, "MEDIUM", 25));
      findings.brandAuthenticity = {
        status: "UNVERIFIED_CLAIM",
        brand: effectiveBrandStatus.brand.toUpperCase(),
        details: effectiveBrandStatus.details
      };
      break;
    case "UNRELATED":
      if (CURATED_TRUSTED_DOMAINS.has(parsed.registrableDomain)) {
        signals.push(sig("B-TRUSTED", "Recognized authoritative domain", `${parsed.registrableDomain} is a well-known established domain.`, "TRUST", -25));
        findings.brandAuthenticity = {
          status: "OFFICIAL",
          details: `Recognized established public domain (${parsed.registrableDomain}).`
        };
      } else {
        findings.brandAuthenticity = {
          status: "UNRELATED",
          details: "Domain does not claim or impersonate a protected brand."
        };
      }
      break;
  }
  const textToCheck = (textSnippet + " " + (pageHtml ? pageHtml.slice(0, 15e3) : "")).toLowerCase();
  if (textToCheck.trim().length > 0) {
    checksRun.push("Page text & urgency / scam keyword heuristics");
    const otpHits = countHits(textToCheck, OTP_THEFT_TEXT);
    const coercionHits = countHits(textToCheck, SCAM_COERCION_TEXT);
    const financialHits = countHits(textToCheck, SCAM_FINANCIAL_TEXT);
    if (otpHits.length > 0) {
      signals.push(sig("S-OTP", "Requests OTP or PIN sharing", `Page text requests sensitive verification codes: ${otpHits.join(", ")}`, "CRITICAL", 60));
      findings.scamEvidence = {
        status: "CREDENTIAL_HARVESTING",
        details: `Asks users to share confidential OTPs/PINs (${otpHits.join(", ")}). Legitimate institutions never ask for these.`,
        hits: otpHits
      };
    } else if (coercionHits.length > 0) {
      signals.push(sig("S-COERCION", "Coercion & urgency wording", `Urgent threats used: ${coercionHits.join(", ")}`, "HIGH", 40));
      findings.scamEvidence = {
        status: "COERCION_URGENCY",
        details: `Uses fear or urgent coercion tactics: ${coercionHits.join(", ")}.`,
        hits: coercionHits
      };
    } else if (financialHits.length > 0) {
      signals.push(sig("S-FINANCIAL", "Lottery / easy money claims", `Promised winnings/returns: ${financialHits.join(", ")}`, "HIGH", 35));
      findings.scamEvidence = {
        status: "FINANCIAL_SCAM",
        details: `Promises unrealistic financial rewards or lottery winnings: ${financialHits.join(", ")}.`,
        hits: financialHits
      };
    }
  }
  checksRun.push("Content classification & advisory check");
  const isPiracyTitle = PIRACY_REGEX.test(pageTitle || "") || /movierulz|netmirror|tamilrockers|1337x|thepiratebay|piratebay|123movies|fmovies|soap2day|torrent magnet|watch .* online free|free movies? online/i.test(pageTitle || "");
  const isPiracyDomain = STREAMING_PIRACY_DOMAINS.has(parsed.registrableDomain) || PIRACY_REGEX.test(parsed.hostname) || PIRACY_REGEX.test(parsed.domainLabel) || PIRACY_NAME_PATTERN.test(parsed.domainLabel) || isPiracyTitle;
  const piracyHits = pageHtml ? countHits(pageHtml.toLowerCase(), PIRACY_TEXT) : [];
  const gamblingHits = pageHtml ? countHits(pageHtml.toLowerCase(), GAMBLING_TEXT) : [];
  const crackHits = pageHtml ? countHits(pageHtml.toLowerCase(), CRACK_TEXT) : [];
  const combinedPageText = ((pageTitle || "") + " " + (pageHtml || "") + " " + (textSnippet || "")).toLowerCase();
  const isDeceptivePiracyLogin = (isPiracyDomain || piracyHits.length >= 2) && /(login required|complete your login|sign in to (watch|stream|view|download)|register to (watch|stream|view)|account required)/i.test(combinedPageText);
  if (isDeceptivePiracyLogin) {
    signals.push(
      sig(
        "S-PIRACY-LOGIN",
        "Deceptive login trap on piracy streaming portal",
        `Page requires user login/registration on unauthorized movie mirror '${parsed.hostname}'. Illicit piracy mirrors use account traps to harvest credentials or promote subscription fraud.`,
        "CRITICAL",
        65
      )
    );
    findings.scamEvidence = {
      status: "CREDENTIAL_HARVESTING",
      details: `Deceptive 'Login Required' registration on unauthorized movie streaming mirror (${parsed.hostname}). Piracy mirrors use login prompts to harvest credentials or trick users into fraudulent subscription schemes.`,
      hits: ["login required on streaming mirror"]
    };
  }
  if (isPiracyDomain || piracyHits.length >= 2) {
    signals.push(
      sig(
        "C-PIRACY",
        "Illicit streaming / copyright piracy domain",
        `Domain '${parsed.hostname}' is an unauthorized movie/media piracy portal or torrent mirror. Piracy portals present significant security risks including malvertising, fraudulent pop-unders, deceptive redirect loops, and malicious downloads.`,
        "HIGH",
        40
      )
    );
    signals.push(
      sig(
        "C-PIRACY-FRAUD",
        "Piracy malvertising & deceptive media risk",
        'Media piracy sites frequently host deceptive "Download / Play" buttons, fake security alerts, and fraudulent registration portals.',
        "MEDIUM",
        25
      )
    );
    findings.contentAdvisory = {
      status: "STREAMING_PIRACY",
      details: `Illicit streaming or copyright piracy portal detected (${parsed.hostname}). Known piracy hubs present elevated risk of malvertising, fraudulent redirects, deceptive download prompts, and unlicensed media distribution.`
    };
  } else if (gamblingHits.length >= 2) {
    signals.push(sig("C-GAMBLING", "Online gambling / betting advisory", `Detected betting and real-money gaming terminology: ${gamblingHits.join(", ")}.`, "MEDIUM", 25));
    findings.contentAdvisory = {
      status: "GAMBLING",
      details: "Online betting or real-money gambling content advisory."
    };
  } else if (crackHits.length >= 2) {
    signals.push(sig("C-CRACK", "Software crack / keygen advisory", `Detected software crack / keygen terminology: ${crackHits.join(", ")}.`, "HIGH", 40));
    findings.contentAdvisory = {
      status: "CRACK_WAREZ",
      details: "Cracked software or activator advisory. Downloadable binaries from unverified distributors carry elevated malware risk."
    };
  }
  return { parsed, brandStatus, signals, findings, checksRun, checksFailed };
}
function deriveVerdict(findings, serverStatus, serverSignals = [], serverRiskLevel) {
  if (findings.technicalThreat.status === "MALICIOUS" || serverRiskLevel === "MALICIOUS" || serverSignals.some((s) => s.severity === "CRITICAL")) {
    return {
      verdict: "UNSAFE",
      title: "Unsafe \u2014 technical threat detected",
      reason: findings.technicalThreat.evidence.length > 0 ? findings.technicalThreat.evidence.join("; ") : "Specific technical threat identified by threat intelligence (malware delivery or phishing payload).",
      riskLevel: "MALICIOUS",
      riskScore: 85
    };
  }
  if (findings.brandAuthenticity.status === "DECEPTIVE_SUBDOMAIN" || findings.brandAuthenticity.status === "LOOKALIKE" || findings.scamEvidence.status === "CREDENTIAL_HARVESTING" || findings.scamEvidence.status === "COERCION_URGENCY" || serverRiskLevel === "HIGH_RISK") {
    const reasonParts = [];
    if (findings.brandAuthenticity.status === "DECEPTIVE_SUBDOMAIN" || findings.brandAuthenticity.status === "LOOKALIKE") {
      reasonParts.push(findings.brandAuthenticity.details);
    }
    if (findings.scamEvidence.status !== "NONE") {
      reasonParts.push(findings.scamEvidence.details);
    }
    return {
      verdict: "FRAUD",
      title: "Fraud \u2014 scam or impersonation evidence",
      reason: reasonParts.join("  ") || "Credible evidence of brand impersonation or financial fraud.",
      riskLevel: "HIGH_RISK",
      riskScore: 75
    };
  }
  if (findings.contentAdvisory.status === "STREAMING_PIRACY" || findings.contentAdvisory.status === "CRACK_WAREZ") {
    const isCrack = findings.contentAdvisory.status === "CRACK_WAREZ";
    const title = isCrack ? "Suspicious \u2014 Cracked software / malware risk" : "Suspicious \u2014 Illicit movie streaming / piracy risk";
    const hasTechIndicators = findings.technicalThreat.evidence.length > 0;
    const reason2 = `${findings.contentAdvisory.details}${hasTechIndicators ? " (" + findings.technicalThreat.evidence.join("; ") + ")" : ""}`;
    return {
      verdict: "SUSPICIOUS",
      title,
      reason: reason2,
      riskLevel: "SUSPICIOUS",
      riskScore: hasTechIndicators ? 70 : 65
    };
  }
  if (findings.technicalThreat.status === "SUSPICIOUS" || serverSignals.some((s) => s.weight >= 25)) {
    return {
      verdict: "SUSPICIOUS",
      title: "Suspicious \u2014 warning indicators detected",
      reason: findings.technicalThreat.evidence.length > 0 ? findings.technicalThreat.evidence.join("; ") : "Domain exhibits suspicious indicators (disposable/burner TLD, malvertising redirect parameters, or disguised host).",
      riskLevel: "SUSPICIOUS",
      riskScore: 55
    };
  }
  if (findings.brandAuthenticity.status === "UNVERIFIED_CLAIM") {
    return {
      verdict: "UNVERIFIED",
      title: "Unverified brand claim",
      reason: findings.brandAuthenticity.details + " Could not independently confirm whether this domain is authorized.",
      riskLevel: "SUSPICIOUS",
      riskScore: 40
    };
  }
  if (serverStatus !== "CONNECTED") {
    if (findings.brandAuthenticity.status === "OFFICIAL") {
      return {
        verdict: "SAFE_SIGNALS_FOUND",
        title: "Safe signals found (Official domain verified)",
        reason: `${findings.brandAuthenticity.details} No known threats found in local checks. Note: Safe signals do not guarantee absolute safety.`,
        riskLevel: "SAFE",
        riskScore: 5
      };
    }
    const statusLabel = serverStatus === "NOT_SIGNED_IN" ? "server check requires sign in" : serverStatus === "TIMED_OUT" ? "server check timed out" : "server check unavailable";
    let reasonMsg = `Unverified \u2014 ${statusLabel}. Local heuristic checks ran cleanly, but authoritative cloud threat intelligence could not be reached.`;
    if (findings.contentAdvisory.status !== "CLEAN") {
      reasonMsg += ` Advisory: ${findings.contentAdvisory.details}`;
    }
    return {
      verdict: "UNVERIFIED",
      title: `Unverified \u2014 ${statusLabel}`,
      reason: reasonMsg,
      riskLevel: "SUSPICIOUS",
      riskScore: 25
    };
  }
  if (findings.brandAuthenticity.status === "OFFICIAL") {
    return {
      verdict: "SAFE_SIGNALS_FOUND",
      title: "Safe signals found (Official domain verified)",
      reason: `${findings.brandAuthenticity.details} Checks found no known technical threats. Note: This does not guarantee absolute safety.`,
      riskLevel: "SAFE",
      riskScore: 5
    };
  }
  let reason = "Checks found no known technical threats, impersonation, or scam indicators. Note: This does not guarantee absolute safety.";
  if (findings.contentAdvisory.status !== "CLEAN") {
    reason = `No technical malware or fraud detected. Advisory: ${findings.contentAdvisory.details}`;
  }
  return {
    verdict: "NO_KNOWN_THREATS",
    title: findings.contentAdvisory.status !== "CLEAN" ? "No known threats (Content advisory)" : "No known threats detected",
    reason,
    riskLevel: "SAFE",
    riskScore: findings.contentAdvisory.status !== "CLEAN" ? 15 : 10
  };
}

// test/domain_and_verdict.test.mjs
test("Case 1: Well-known official site (hdfc.bank.in and google.com)", () => {
  const parsedHdfc = parseDomain("https://hdfc.bank.in/personal");
  assert.equal(parsedHdfc.registrableDomain, "hdfc.bank.in");
  assert.equal(parsedHdfc.publicSuffix, "bank.in");
  assert.equal(parsedHdfc.domainLabel, "hdfc");
  const brandHdfc = checkBrandAuthenticity(parsedHdfc);
  assert.equal(brandHdfc.kind, "OFFICIAL");
  assert.equal(brandHdfc.brand, "hdfc");
  const evalHdfc = evaluateLocalSignals("https://hdfc.bank.in", "", "");
  assert.equal(evalHdfc.findings.brandAuthenticity.status, "OFFICIAL");
  assert.equal(evalHdfc.findings.technicalThreat.status, "CLEAN");
  const verdictOffline = deriveVerdict(evalHdfc.findings, "NOT_SIGNED_IN");
  assert.equal(verdictOffline.verdict, "SAFE_SIGNALS_FOUND");
  assert.match(verdictOffline.reason, /official/i);
  assert.match(verdictOffline.reason, /do not guarantee absolute safety/i);
  const verdictOnline = deriveVerdict(evalHdfc.findings, "CONNECTED", [], "SAFE");
  assert.equal(verdictOnline.verdict, "SAFE_SIGNALS_FOUND");
  const parsedGoogle = parseDomain("https://www.google.com/search?q=test");
  assert.equal(parsedGoogle.registrableDomain, "google.com");
  assert.equal(checkBrandAuthenticity(parsedGoogle).kind, "OFFICIAL");
});
test("Case 2: Known phishing or malware test domain", () => {
  const evalPhish = evaluateLocalSignals("https://testsafebrowsing.appspot.com/s/malware.html", "", "");
  assert.equal(evalPhish.findings.technicalThreat.status, "MALICIOUS");
  const verdict = deriveVerdict(evalPhish.findings, "CONNECTED");
  assert.equal(verdict.verdict, "UNSAFE");
  assert.equal(verdict.riskLevel, "MALICIOUS");
  assert.ok(verdict.riskScore >= 75);
});
test("Case 3: Brand lookalike & deceptive subdomains", () => {
  const parsedLookalike = parseDomain("https://hdfc-verify-login.xyz");
  const brandLookalike = checkBrandAuthenticity(parsedLookalike);
  assert.equal(brandLookalike.kind, "LOOKALIKE_DOMAIN");
  const evalLookalike = evaluateLocalSignals("https://hdfc-verify-login.xyz", "", "");
  assert.equal(evalLookalike.findings.brandAuthenticity.status, "LOOKALIKE");
  const verdictLookalike = deriveVerdict(evalLookalike.findings, "CONNECTED");
  assert.equal(verdictLookalike.verdict, "FRAUD");
  const parsedDeceptive = parseDomain("https://hdfc.bank-portal-update.com");
  const brandDeceptive = checkBrandAuthenticity(parsedDeceptive);
  assert.equal(brandDeceptive.kind, "DECEPTIVE_SUBDOMAIN");
  const evalDeceptive = evaluateLocalSignals("https://hdfc.bank-portal-update.com", "", "");
  assert.equal(evalDeceptive.findings.brandAuthenticity.status, "DECEPTIVE_SUBDOMAIN");
  const verdictDeceptive = deriveVerdict(evalDeceptive.findings, "NOT_SIGNED_IN");
  assert.equal(verdictDeceptive.verdict, "FRAUD");
  const parsedTypo = parseDomain("https://paypa1.com");
  const brandTypo = checkBrandAuthenticity(parsedTypo);
  assert.equal(brandTypo.kind, "LOOKALIKE_DOMAIN");
});
test("Case 4: Brand substring in legitimate non-brand domain (pineapple.com)", () => {
  const parsedPineapple = parseDomain("https://pineapple.com");
  assert.equal(parsedPineapple.registrableDomain, "pineapple.com");
  assert.equal(parsedPineapple.domainLabel, "pineapple");
  const brandPineapple = checkBrandAuthenticity(parsedPineapple);
  assert.equal(brandPineapple.kind, "UNRELATED");
  const evalPineapple = evaluateLocalSignals("https://pineapple.com", "", "");
  assert.equal(evalPineapple.findings.brandAuthenticity.status, "UNRELATED");
  assert.equal(evalPineapple.findings.technicalThreat.status, "CLEAN");
  const verdictOffline = deriveVerdict(evalPineapple.findings, "NOT_SIGNED_IN");
  assert.equal(verdictOffline.verdict, "UNVERIFIED");
  assert.doesNotMatch(verdictOffline.reason, /apple/i);
  const verdictOnline = deriveVerdict(evalPineapple.findings, "CONNECTED", [], "SAFE");
  assert.equal(verdictOnline.verdict, "NO_KNOWN_THREATS");
  assert.match(verdictOnline.title, /no known threats/i);
});
test("Case 5: Streaming or piracy site without impersonation (net77.cc and 5movierulz.academy)", () => {
  const parsedNet77 = parseDomain("https://net77.cc/watch");
  assert.equal(parsedNet77.registrableDomain, "net77.cc");
  assert.equal(parsedNet77.domainLabel, "net77");
  const evalNet77 = evaluateLocalSignals("https://net77.cc/watch", "<html><body>Watch latest movies online</body></html>", "");
  assert.equal(evalNet77.findings.contentAdvisory.status, "STREAMING_PIRACY");
  assert.equal(evalNet77.findings.technicalThreat.status, "SUSPICIOUS");
  assert.match(evalNet77.findings.technicalThreat.details, /disposable TLD/i);
  const verdictOffline = deriveVerdict(evalNet77.findings, "NOT_SIGNED_IN");
  assert.equal(verdictOffline.verdict, "SUSPICIOUS");
  assert.ok(verdictOffline.riskScore >= 65);
  assert.match(verdictOffline.title, /piracy/i);
  const verdictOnline = deriveVerdict(evalNet77.findings, "CONNECTED", [], "SAFE");
  assert.equal(verdictOnline.verdict, "SUSPICIOUS");
  assert.notEqual(verdictOnline.verdict, "UNSAFE");
  const evalMovierulz = evaluateLocalSignals(
    "https://www.5movierulz.academy/",
    "MovieRulz Latest Indian Movies \u2014 Telugu, Tamil, Malayalam and Hindi films... Featured Movies Free ... Matchbox: The Movie (2026) HDRip",
    "",
    "MovieRulz | Latest Telugu, Tamil"
  );
  assert.equal(evalMovierulz.findings.contentAdvisory.status, "STREAMING_PIRACY");
  const verdictMovierulz = deriveVerdict(evalMovierulz.findings, "NOT_SIGNED_IN");
  assert.equal(verdictMovierulz.verdict, "SUSPICIOUS");
  assert.ok(verdictMovierulz.riskScore >= 65);
  assert.match(verdictMovierulz.title, /piracy/i);
  assert.match(verdictMovierulz.reason, /piracy/i);
});
test("Case 5B: In-page Brand Impersonation & Deceptive Login on unauthorized domain (net77.cc posing as NetMirror / Netflix with Login Required)", () => {
  const net77Html = '<html><head><title>Home - NetMirror</title></head><body><h1>NETMIRROR</h1><p>Watch in Tamil, Telugu, Hindi</p><p>Login Required: Complete your login with just few clicks and enjoy unlimited features</p><input type="password" /></body></html>';
  const evalNetMirror = evaluateLocalSignals("https://net77.cc/home", net77Html, "Login Required", "Home - NetMirror");
  assert.equal(evalNetMirror.findings.brandAuthenticity.status, "LOOKALIKE");
  assert.equal(evalNetMirror.findings.brandAuthenticity.brand, "NETFLIX");
  assert.match(evalNetMirror.findings.brandAuthenticity.details, /NetMirror/i);
  assert.equal(evalNetMirror.findings.contentAdvisory.status, "STREAMING_PIRACY");
  assert.equal(evalNetMirror.findings.scamEvidence.status, "CREDENTIAL_HARVESTING");
  const verdict = deriveVerdict(evalNetMirror.findings, "NOT_SIGNED_IN");
  assert.equal(verdict.verdict, "FRAUD");
  assert.equal(verdict.riskLevel, "HIGH_RISK");
  assert.ok(verdict.riskScore >= 75);
  assert.match(verdict.title, /Piracy streaming clone with deceptive login|scam or impersonation/i);
});
test("Case 5C: Disposable/Burner TLD with TDS Ad Tracking (pulsarflowtech.lol and leshenleads.cc)", () => {
  const tdsUrl = "https://leshenleads.cc/index51.php?flow_id=81&conversion=GVDWq2Ag0ss&bid=0.000563&campaign=2589779&pubfeed=383606&subid=1435554&carrier=Excellmedia&flow_k=f3635145d4";
  const evalTds = evaluateLocalSignals(tdsUrl, "", "");
  assert.equal(evalTds.findings.technicalThreat.status, "SUSPICIOUS");
  assert.ok(evalTds.signals.some((s) => s.policyId === "T-TDS-REDIRECT"));
  assert.ok(evalTds.signals.some((s) => s.policyId === "T-ABUSE-TLD"));
  const verdict = deriveVerdict(evalTds.findings, "CONNECTED");
  assert.equal(verdict.verdict, "SUSPICIOUS");
  assert.equal(verdict.riskLevel, "SUSPICIOUS");
  assert.ok(verdict.riskScore >= 50);
  const burnerHexUrl = "https://4fcsn.pulsarflowtech.lol/?88353527eccf1893cc";
  const evalBurner = evaluateLocalSignals(burnerHexUrl, "", "");
  assert.equal(evalBurner.findings.technicalThreat.status, "SUSPICIOUS");
  assert.ok(evalBurner.signals.some((s) => s.policyId === "T-ABUSE-TLD"));
  assert.ok(evalBurner.signals.some((s) => s.policyId === "T-HEX-SUBDOMAIN"));
  const verdictBurner = deriveVerdict(evalBurner.findings, "CONNECTED");
  assert.equal(verdictBurner.verdict, "SUSPICIOUS");
});
test("Case 6: Backend server state failures (cold start, timeout, offline, DNS)", () => {
  const evalGeneric = evaluateLocalSignals("https://some-unknown-site.org", "", "");
  const verdictTimeout = deriveVerdict(evalGeneric.findings, "TIMED_OUT");
  assert.equal(verdictTimeout.verdict, "UNVERIFIED");
  assert.match(verdictTimeout.title, /timed out/i);
  const verdictUnavailable = deriveVerdict(evalGeneric.findings, "UNAVAILABLE");
  assert.equal(verdictUnavailable.verdict, "UNVERIFIED");
  assert.match(verdictUnavailable.title, /unavailable/i);
  const verdictNotSignedIn = deriveVerdict(evalGeneric.findings, "NOT_SIGNED_IN");
  assert.equal(verdictNotSignedIn.verdict, "UNVERIFIED");
  assert.match(verdictNotSignedIn.title, /sign in/i);
});
test("Case 7: Subdomains, IDNs/punycode, IP-address URLs, and URL shorteners", () => {
  const parsedIp = parseDomain("http://192.168.1.100/login");
  assert.equal(parsedIp.isIpAddress, true);
  const evalIp = evaluateLocalSignals("http://192.168.1.100/login", "", "");
  assert.equal(evalIp.findings.technicalThreat.status, "SUSPICIOUS");
  assert.ok(evalIp.signals.some((s) => s.policyId === "T-IP-HOST"));
  const parsedPuny = parseDomain("https://xn--pple-43d.com");
  assert.equal(parsedPuny.isPunycode, true);
  const evalPuny = evaluateLocalSignals("https://xn--pple-43d.com", "", "");
  assert.equal(evalPuny.findings.technicalThreat.status, "SUSPICIOUS");
  assert.ok(evalPuny.signals.some((s) => s.policyId === "T-PUNYCODE"));
  const parsedShort = parseDomain("https://bit.ly/3xY8a");
  assert.equal(parsedShort.registrableDomain, "bit.ly");
  const evalShort = evaluateLocalSignals("https://bit.ly/3xY8a", "", "");
  assert.ok(evalShort.signals.some((s) => s.policyId === "T-SHORTENER"));
  const parsedDeep = parseDomain("https://a.b.c.d.example.co.uk/path");
  assert.equal(parsedDeep.registrableDomain, "example.co.uk");
  assert.equal(parsedDeep.publicSuffix, "co.uk");
  assert.equal(parsedDeep.domainLabel, "example");
  assert.equal(parsedDeep.subdomain, "a.b.c.d");
});
