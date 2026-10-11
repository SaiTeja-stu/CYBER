import test from 'node:test';
import assert from 'node:assert/strict';

// Test domain parsing directly
import { parseDomain, checkBrandAuthenticity } from '../src/domain.ts';
import { evaluateLocalSignals, deriveVerdict } from '../src/local.ts';

test('Case 1: Well-known official site (hdfc.bank.in and google.com)', () => {
  const parsedHdfc = parseDomain('https://hdfc.bank.in/personal');
  assert.equal(parsedHdfc.registrableDomain, 'hdfc.bank.in');
  assert.equal(parsedHdfc.publicSuffix, 'bank.in');
  assert.equal(parsedHdfc.domainLabel, 'hdfc');

  const brandHdfc = checkBrandAuthenticity(parsedHdfc);
  assert.equal(brandHdfc.kind, 'OFFICIAL');
  assert.equal(brandHdfc.brand, 'hdfc');

  const evalHdfc = evaluateLocalSignals('https://hdfc.bank.in', '', '');
  assert.equal(evalHdfc.findings.brandAuthenticity.status, 'OFFICIAL');
  assert.equal(evalHdfc.findings.technicalThreat.status, 'CLEAN');

  // Even offline, verified official domain returns SAFE_SIGNALS_FOUND
  const verdictOffline = deriveVerdict(evalHdfc.findings, 'NOT_SIGNED_IN');
  assert.equal(verdictOffline.verdict, 'SAFE_SIGNALS_FOUND');
  assert.match(verdictOffline.reason, /official/i);
  assert.match(verdictOffline.reason, /do not guarantee absolute safety/i);

  // Online check
  const verdictOnline = deriveVerdict(evalHdfc.findings, 'CONNECTED', [], 'SAFE');
  assert.equal(verdictOnline.verdict, 'SAFE_SIGNALS_FOUND');

  // Google
  const parsedGoogle = parseDomain('https://www.google.com/search?q=test');
  assert.equal(parsedGoogle.registrableDomain, 'google.com');
  assert.equal(checkBrandAuthenticity(parsedGoogle).kind, 'OFFICIAL');
});

test('Case 2: Known phishing or malware test domain', () => {
  const evalPhish = evaluateLocalSignals('https://testsafebrowsing.appspot.com/s/malware.html', '', '');
  assert.equal(evalPhish.findings.technicalThreat.status, 'MALICIOUS');
  const verdict = deriveVerdict(evalPhish.findings, 'CONNECTED');
  assert.equal(verdict.verdict, 'UNSAFE');
  assert.equal(verdict.riskLevel, 'MALICIOUS');
  assert.ok(verdict.riskScore >= 75);
});

test('Case 3: Brand lookalike & deceptive subdomains', () => {
  // A) Lookalike with phishing keyword: hdfc-verify-login.xyz
  const parsedLookalike = parseDomain('https://hdfc-verify-login.xyz');
  const brandLookalike = checkBrandAuthenticity(parsedLookalike);
  assert.equal(brandLookalike.kind, 'LOOKALIKE_DOMAIN');

  const evalLookalike = evaluateLocalSignals('https://hdfc-verify-login.xyz', '', '');
  assert.equal(evalLookalike.findings.brandAuthenticity.status, 'LOOKALIKE');
  const verdictLookalike = deriveVerdict(evalLookalike.findings, 'CONNECTED');
  assert.equal(verdictLookalike.verdict, 'FRAUD');

  // B) Deceptive subdomain: hdfc.bank-portal-update.com
  const parsedDeceptive = parseDomain('https://hdfc.bank-portal-update.com');
  const brandDeceptive = checkBrandAuthenticity(parsedDeceptive);
  assert.equal(brandDeceptive.kind, 'DECEPTIVE_SUBDOMAIN');

  const evalDeceptive = evaluateLocalSignals('https://hdfc.bank-portal-update.com', '', '');
  assert.equal(evalDeceptive.findings.brandAuthenticity.status, 'DECEPTIVE_SUBDOMAIN');
  const verdictDeceptive = deriveVerdict(evalDeceptive.findings, 'NOT_SIGNED_IN');
  assert.equal(verdictDeceptive.verdict, 'FRAUD');

  // C) Typosquat: paypa1.com
  const parsedTypo = parseDomain('https://paypa1.com');
  const brandTypo = checkBrandAuthenticity(parsedTypo);
  assert.equal(brandTypo.kind, 'LOOKALIKE_DOMAIN');
});

test('Case 4: Brand substring in legitimate non-brand domain (pineapple.com)', () => {
  const parsedPineapple = parseDomain('https://pineapple.com');
  assert.equal(parsedPineapple.registrableDomain, 'pineapple.com');
  assert.equal(parsedPineapple.domainLabel, 'pineapple');

  // MUST NOT match apple!
  const brandPineapple = checkBrandAuthenticity(parsedPineapple);
  assert.equal(brandPineapple.kind, 'UNRELATED');

  const evalPineapple = evaluateLocalSignals('https://pineapple.com', '', '');
  assert.equal(evalPineapple.findings.brandAuthenticity.status, 'UNRELATED');
  assert.equal(evalPineapple.findings.technicalThreat.status, 'CLEAN');

  // Offline: Unverified third-party (server check unavailable), NOT Fraud or Unsafe!
  const verdictOffline = deriveVerdict(evalPineapple.findings, 'NOT_SIGNED_IN');
  assert.equal(verdictOffline.verdict, 'UNVERIFIED');
  assert.doesNotMatch(verdictOffline.reason, /apple/i);

  // Online clean: No known threats detected (third party domain)
  const verdictOnline = deriveVerdict(evalPineapple.findings, 'CONNECTED', [], 'SAFE');
  assert.equal(verdictOnline.verdict, 'NO_KNOWN_THREATS');
  assert.match(verdictOnline.title, /no known threats/i);
});

test('Case 5: Streaming or piracy site without impersonation (net77.cc and 5movierulz.academy)', () => {
  const parsedNet77 = parseDomain('https://net77.cc/watch');
  assert.equal(parsedNet77.registrableDomain, 'net77.cc');
  assert.equal(parsedNet77.domainLabel, 'net77');

  const evalNet77 = evaluateLocalSignals('https://net77.cc/watch', '<html><body>Watch latest movies online</body></html>', '');
  
  // Content advisory must be flagged as STREAMING_PIRACY:
  assert.equal(evalNet77.findings.contentAdvisory.status, 'STREAMING_PIRACY');
  // Technical threat: .cc is a burner/ad-network TLD, so flagged as suspicious
  assert.equal(evalNet77.findings.technicalThreat.status, 'SUSPICIOUS');
  assert.match(evalNet77.findings.technicalThreat.details, /disposable TLD/i);

  // Both online and offline must accurately yield SUSPICIOUS verdict with elevated risk score
  const verdictOffline = deriveVerdict(evalNet77.findings, 'NOT_SIGNED_IN');
  assert.equal(verdictOffline.verdict, 'SUSPICIOUS');
  assert.ok(verdictOffline.riskScore >= 65);
  assert.match(verdictOffline.title, /piracy/i);

  const verdictOnline = deriveVerdict(evalNet77.findings, 'CONNECTED', [], 'SAFE');
  assert.equal(verdictOnline.verdict, 'SUSPICIOUS');
  assert.notEqual(verdictOnline.verdict, 'UNSAFE');

  // Test 5movierulz.academy from Screenshot 1
  const evalMovierulz = evaluateLocalSignals(
    'https://www.5movierulz.academy/',
    'MovieRulz Latest Indian Movies — Telugu, Tamil, Malayalam and Hindi films... Featured Movies Free ... Matchbox: The Movie (2026) HDRip',
    '',
    'MovieRulz | Latest Telugu, Tamil'
  );
  assert.equal(evalMovierulz.findings.contentAdvisory.status, 'STREAMING_PIRACY');
  const verdictMovierulz = deriveVerdict(evalMovierulz.findings, 'NOT_SIGNED_IN');
  assert.equal(verdictMovierulz.verdict, 'SUSPICIOUS');
  assert.ok(verdictMovierulz.riskScore >= 65);
  assert.match(verdictMovierulz.title, /piracy/i);
  assert.match(verdictMovierulz.reason, /piracy/i);
});

test('Case 5B: In-page Brand Impersonation & Deceptive Login on unauthorized domain (net77.cc posing as NetMirror / Netflix with Login Required)', () => {
  const net77Html = '<html><head><title>Home - NetMirror</title></head><body><h1>NETMIRROR</h1><p>Watch in Tamil, Telugu, Hindi</p><p>Login Required: Complete your login with just few clicks and enjoy unlimited features</p><input type="password" /></body></html>';
  const evalNetMirror = evaluateLocalSignals('https://net77.cc/home', net77Html, 'Login Required', 'Home - NetMirror');

  assert.equal(evalNetMirror.findings.brandAuthenticity.status, 'LOOKALIKE');
  assert.equal(evalNetMirror.findings.brandAuthenticity.brand, 'NETFLIX');
  assert.match(evalNetMirror.findings.brandAuthenticity.details, /NetMirror/i);
  assert.equal(evalNetMirror.findings.contentAdvisory.status, 'STREAMING_PIRACY');
  assert.equal(evalNetMirror.findings.scamEvidence.status, 'CREDENTIAL_HARVESTING');

  const verdict = deriveVerdict(evalNetMirror.findings, 'NOT_SIGNED_IN');
  assert.equal(verdict.verdict, 'FRAUD');
  assert.equal(verdict.riskLevel, 'HIGH_RISK');
  assert.ok(verdict.riskScore >= 75);
  assert.match(verdict.title, /Piracy streaming clone with deceptive login|scam or impersonation/i);
});

test('Case 5C: Disposable/Burner TLD with TDS Ad Tracking (pulsarflowtech.lol and leshenleads.cc)', () => {
  const tdsUrl = 'https://leshenleads.cc/index51.php?flow_id=81&conversion=GVDWq2Ag0ss&bid=0.000563&campaign=2589779&pubfeed=383606&subid=1435554&carrier=Excellmedia&flow_k=f3635145d4';
  const evalTds = evaluateLocalSignals(tdsUrl, '', '');

  assert.equal(evalTds.findings.technicalThreat.status, 'SUSPICIOUS');
  assert.ok(evalTds.signals.some((s) => s.policyId === 'T-TDS-REDIRECT'));
  assert.ok(evalTds.signals.some((s) => s.policyId === 'T-ABUSE-TLD'));

  const verdict = deriveVerdict(evalTds.findings, 'CONNECTED');
  assert.equal(verdict.verdict, 'SUSPICIOUS');
  assert.equal(verdict.riskLevel, 'SUSPICIOUS');
  assert.ok(verdict.riskScore >= 50);

  // Deep random hex subdomain on .lol burner TLD
  const burnerHexUrl = 'https://4fcsn.pulsarflowtech.lol/?88353527eccf1893cc';
  const evalBurner = evaluateLocalSignals(burnerHexUrl, '', '');
  assert.equal(evalBurner.findings.technicalThreat.status, 'SUSPICIOUS');
  assert.ok(evalBurner.signals.some((s) => s.policyId === 'T-ABUSE-TLD'));
  assert.ok(evalBurner.signals.some((s) => s.policyId === 'T-HEX-SUBDOMAIN'));

  const verdictBurner = deriveVerdict(evalBurner.findings, 'CONNECTED');
  assert.equal(verdictBurner.verdict, 'SUSPICIOUS');
});

test('Case 6: Backend server state failures (cold start, timeout, offline, DNS)', () => {
  const evalGeneric = evaluateLocalSignals('https://some-unknown-site.org', '', '');

  // Timeout state
  const verdictTimeout = deriveVerdict(evalGeneric.findings, 'TIMED_OUT');
  assert.equal(verdictTimeout.verdict, 'UNVERIFIED');
  assert.match(verdictTimeout.title, /timed out/i);

  // Offline / server unavailable
  const verdictUnavailable = deriveVerdict(evalGeneric.findings, 'UNAVAILABLE');
  assert.equal(verdictUnavailable.verdict, 'UNVERIFIED');
  assert.match(verdictUnavailable.title, /unavailable/i);

  // Unauthenticated / not signed in
  const verdictNotSignedIn = deriveVerdict(evalGeneric.findings, 'NOT_SIGNED_IN');
  assert.equal(verdictNotSignedIn.verdict, 'UNVERIFIED');
  assert.match(verdictNotSignedIn.title, /sign in/i);
});

test('Case 7: Subdomains, IDNs/punycode, IP-address URLs, and URL shorteners', () => {
  // IP Address
  const parsedIp = parseDomain('http://192.168.1.100/login');
  assert.equal(parsedIp.isIpAddress, true);
  const evalIp = evaluateLocalSignals('http://192.168.1.100/login', '', '');
  assert.equal(evalIp.findings.technicalThreat.status, 'SUSPICIOUS');
  assert.ok(evalIp.signals.some((s) => s.policyId === 'T-IP-HOST'));

  // Punycode (IDN homoglyph)
  const parsedPuny = parseDomain('https://xn--pple-43d.com');
  assert.equal(parsedPuny.isPunycode, true);
  const evalPuny = evaluateLocalSignals('https://xn--pple-43d.com', '', '');
  assert.equal(evalPuny.findings.technicalThreat.status, 'SUSPICIOUS');
  assert.ok(evalPuny.signals.some((s) => s.policyId === 'T-PUNYCODE'));

  // URL Shortener
  const parsedShort = parseDomain('https://bit.ly/3xY8a');
  assert.equal(parsedShort.registrableDomain, 'bit.ly');
  const evalShort = evaluateLocalSignals('https://bit.ly/3xY8a', '', '');
  assert.ok(evalShort.signals.some((s) => s.policyId === 'T-SHORTENER'));

  // Deep subdomains
  const parsedDeep = parseDomain('https://a.b.c.d.example.co.uk/path');
  assert.equal(parsedDeep.registrableDomain, 'example.co.uk');
  assert.equal(parsedDeep.publicSuffix, 'co.uk');
  assert.equal(parsedDeep.domainLabel, 'example');
  assert.equal(parsedDeep.subdomain, 'a.b.c.d');
});
