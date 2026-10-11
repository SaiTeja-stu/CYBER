package com.cybershield.core;

import android.content.Context;

import com.cybershield.analyze.ContextBuilder;
import com.cybershield.analyze.ExplanationService;
import com.cybershield.domain.ContentType;
import com.cybershield.domain.RiskLevel;
import com.cybershield.domain.Signal;
import com.cybershield.domain.Verdict;
import com.cybershield.engine.DetectionEngine;
import com.cybershield.engine.Policy;
import com.cybershield.engine.RiskScorer;
import com.cybershield.engine.policies.email.AuthResultsPolicy;
import com.cybershield.engine.policies.email.DisplayNameSpoofPolicy;
import com.cybershield.engine.policies.email.ReplyToMismatchPolicy;
import com.cybershield.engine.policies.email.SenderLookAlikePolicy;
import com.cybershield.engine.policies.qr.QrPayloadShapePolicy;
import com.cybershield.engine.policies.qr.UpiCollectMandatePolicy;
import com.cybershield.engine.policies.qr.UpiPaymentPolicy;
import com.cybershield.engine.policies.text.CryptoScamPolicy;
import com.cybershield.engine.policies.text.DigitalArrestPolicy;
import com.cybershield.engine.policies.text.ImpersonationPolicy;
import com.cybershield.engine.policies.text.OtpRequestPolicy;
import com.cybershield.engine.policies.text.PrizeJobScamPolicy;
import com.cybershield.engine.policies.text.ReceiveMoneyScamPolicy;
import com.cybershield.engine.policies.text.UrgencyAndCredentialPolicy;
import com.cybershield.engine.policies.url.AllowlistUrlPolicy;
import com.cybershield.engine.policies.url.BlocklistUrlPolicy;
import com.cybershield.engine.policies.url.DeceptiveSubdomainPolicy;
import com.cybershield.engine.policies.url.InsecureTransportPolicy;
import com.cybershield.engine.policies.url.IpAddressHostPolicy;
import com.cybershield.engine.policies.url.MlUrlScorePolicy;
import com.cybershield.engine.policies.url.PunycodeHomographPolicy;
import com.cybershield.engine.policies.url.PiracyGamblingPolicy;
import com.cybershield.engine.policies.text.GamblingPromoPolicy;
import com.cybershield.engine.policies.url.SuspiciousTldPolicy;
import com.cybershield.engine.policies.url.TyposquattingPolicy;
import com.cybershield.engine.policies.url.UrlObfuscationPolicy;
import com.cybershield.engine.policies.url.UrlShortenerPolicy;
import com.cybershield.engine.policies.web.LoginFormPolicy;
import com.cybershield.engine.policies.web.PageContentPolicy;
import com.cybershield.core.ml.MlUrlClassifier;
import com.cybershield.intel.LocalIntelStore;
import com.cybershield.qr.UpiUri;
import com.cybershield.app.net.dto.AnalyzeResponse;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * The backend detection pipeline, running entirely on the phone. Produces the
 * same {@link AnalyzeResponse} shape the app used to get over REST, so nothing
 * downstream changes — and it needs no network.
 */
public final class OnDeviceAnalyzer {

    private final ContextBuilder contextBuilder = new ContextBuilder();
    private final RiskScorer scorer = new RiskScorer();
    private final ExplanationService explanations = new ExplanationService();
    private final DetectionEngine engine;
    private final LocalIntelStore intel;

    public OnDeviceAnalyzer(Context ctx) {
        this.intel = new LocalIntelStore(ctx.getApplicationContext());
        MlUrlClassifier mlUrl = new MlUrlClassifier(ctx.getApplicationContext());
        List<Policy> policies = Arrays.asList(
                // URL / link
                new TyposquattingPolicy(intel),
                new PunycodeHomographPolicy(),
                new IpAddressHostPolicy(),
                new DeceptiveSubdomainPolicy(intel),
                new UrlShortenerPolicy(intel),
                new UrlObfuscationPolicy(),
                new SuspiciousTldPolicy(intel),
                new PiracyGamblingPolicy(intel),
                new InsecureTransportPolicy(),
                new BlocklistUrlPolicy(intel),
                new AllowlistUrlPolicy(intel),
                new MlUrlScorePolicy(mlUrl, intel),
                // message / text
                new UrgencyAndCredentialPolicy(),
                new OtpRequestPolicy(),
                new GamblingPromoPolicy(),
                new ReceiveMoneyScamPolicy(),
                new ImpersonationPolicy(),
                new PrizeJobScamPolicy(),
                new CryptoScamPolicy(),
                new DigitalArrestPolicy(),
                // email headers (SPF/DKIM/DMARC, sender spoofing) — offline, no RDAP
                new DisplayNameSpoofPolicy(intel),
                new AuthResultsPolicy(),
                new ReplyToMismatchPolicy(),
                new SenderLookAlikePolicy(intel),
                // QR / UPI
                new UpiPaymentPolicy(intel),
                new UpiCollectMandatePolicy(),
                new QrPayloadShapePolicy(),
                // web page
                new LoginFormPolicy(),
                new PageContentPolicy());
        this.engine = new DetectionEngine(policies);
    }

    public AnalyzeResponse analyze(String typeName, String content, String pageUrl) {
        ContentType type = parseType(typeName);
        ContextBuilder.Built built = contextBuilder.build(type, content, pageUrl);

        List<Signal> signals = engine.run(built.context());
        Verdict v = new Verdict();
        for (Signal s : signals) v.addSignal(s);

        int score = scorer.score(signals);
        v.setRiskScore(score);
        v.setRiskLevel(scorer.level(score));
        v.setConfidence(scorer.confidence(signals, built.hadNetworkData()));

        built.context().primaryUrl().ifPresent(u -> {
            boolean nothingNegative = signals.stream().noneMatch(s -> s.weight() > 0);
            if (intel.isAllowedDomain(u.host()) && nothingNegative) v.setTrusted(true);
        });

        UpiUri upi = built.upi();
        boolean initiatesPayment = upi != null && upi.initiatesDebit();
        explanations.enrich(v, type, upi, initiatesPayment);

        return toResponse(type, v, upi, initiatesPayment, built);
    }

    private AnalyzeResponse toResponse(ContentType type, Verdict v, UpiUri upi, boolean initiatesPayment, ContextBuilder.Built built) {
        AnalyzeResponse r = new AnalyzeResponse();
        r.reportId = UUID.randomUUID().toString();
        r.contentType = type.name();
        r.riskScore = v.getRiskScore();
        r.riskLevel = v.getRiskLevel().name();
        r.priority = v.getRiskLevel().priority();
        r.wording = v.wording();
        r.confidence = v.getConfidence();
        r.verified = v.isVerified();
        r.trusted = v.isTrusted();
        r.initiatesPayment = initiatesPayment;
        r.categories = new ArrayList<>(v.getCategories());
        r.explanation = v.getExplanation();
        r.recommendations = new ArrayList<>(v.getRecommendations());

        r.signals = new ArrayList<>();
        for (Signal s : v.getSignals()) {
            AnalyzeResponse.Signal dto = new AnalyzeResponse.Signal();
            dto.policyId = s.policyId();
            dto.name = s.name();
            dto.detail = s.detail();
            dto.severity = s.severity().name();
            dto.weight = s.weight();
            r.signals.add(dto);
        }

        if (upi != null && upi.valid()) {
            AnalyzeResponse.PaymentInfo p = new AnalyzeResponse.PaymentInfo();
            p.scheme = "UPI";
            p.action = upi.action();
            p.payeeVpa = upi.payeeVpa().orElse(null);
            p.payeeName = upi.payeeName().orElse(null);
            p.amount = upi.amount().orElse(null);
            p.currency = upi.currency().orElse("INR");
            p.note = upi.note().orElse(null);
            p.pullPayment = upi.isCollectOrMandate();
            r.payment = p;
        }

        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        r.analyzedAt = iso.format(new Date());

        if (built.context().primaryUrl().isPresent()) {
            var u = built.context().primaryUrl().get();
            r.checkedHostname = u.host();
            r.registrableDomain = u.registrableDomain();
            r.finalDestination = u.original();
        }

        // Unified evidence-based findings
        AnalyzeResponse.Findings findings = new AnalyzeResponse.Findings();

        // Technical Threat
        boolean hasCrit = v.getSignals().stream().anyMatch(s -> "CRITICAL".equals(s.severity().name()) || s.policyId().equals("URL-10"));
        boolean hasSuspTech = v.getSignals().stream().anyMatch(s -> s.policyId().equals("URL-02") || s.policyId().equals("URL-04") || s.policyId().equals("URL-07"));
        AnalyzeResponse.Dimension tech = new AnalyzeResponse.Dimension();
        tech.status = hasCrit ? "MALICIOUS" : hasSuspTech ? "SUSPICIOUS" : "CLEAN";
        tech.details = hasCrit ? "Specific technical threat identified by threat intelligence."
                : hasSuspTech ? "Suspicious technical indicators detected (IP host, punycode, or obfuscation)."
                : "No malicious payloads, unencrypted credentials, or hostile redirects detected.";
        for (Signal s : v.getSignals()) {
            if (s.weight() > 0 && (s.policyId().startsWith("URL-") || s.policyId().startsWith("WEB-"))) {
                tech.evidence.add(s.name() + ": " + s.detail());
            }
        }
        findings.technicalThreat = tech;

        // Brand Authenticity
        boolean deceptiveSub = v.getSignals().stream().anyMatch(s -> s.policyId().equals("URL-05"));
        boolean lookalike = v.getSignals().stream().anyMatch(s -> s.policyId().equals("URL-01"));
        AnalyzeResponse.BrandDimension brand = new AnalyzeResponse.BrandDimension();
        brand.status = v.isTrusted() ? "OFFICIAL" : deceptiveSub ? "DECEPTIVE_SUBDOMAIN" : lookalike ? "LOOKALIKE" : "UNRELATED";
        brand.details = v.isTrusted() ? "Independently verified official domain (" + r.registrableDomain + ")."
                : deceptiveSub ? "Brand name used in a subdomain of an unrelated registered domain."
                : lookalike ? "Lookalike or typosquatting domain."
                : "Domain does not claim or impersonate an authoritative brand.";
        findings.brandAuthenticity = brand;

        // Scam Evidence
        boolean otpTheft = v.getSignals().stream().anyMatch(s -> s.policyId().equals("MSG-01") || s.name().toLowerCase(Locale.ROOT).contains("otp"));
        boolean coercion = v.getSignals().stream().anyMatch(s -> s.policyId().equals("MSG-02") || s.policyId().equals("MSG-04"));
        AnalyzeResponse.ScamDimension scam = new AnalyzeResponse.ScamDimension();
        scam.status = otpTheft ? "CREDENTIAL_HARVESTING" : coercion ? "COERCION_URGENCY" : "NONE";
        scam.details = otpTheft ? "Requests sharing confidential OTP or PIN."
                : coercion ? "Coercion or urgency tactics detected."
                : "No coercion or OTP harvesting detected.";
        findings.scamEvidence = scam;

        // Content Advisory
        AnalyzeResponse.ContentDimension contentAdv = new AnalyzeResponse.ContentDimension();
        boolean isPiracy = r.checkedHostname != null && (
                r.checkedHostname.toLowerCase(Locale.ROOT).contains("net77") ||
                r.checkedHostname.toLowerCase(Locale.ROOT).contains("netmirror") ||
                r.checkedHostname.toLowerCase(Locale.ROOT).contains("movie") ||
                r.checkedHostname.toLowerCase(Locale.ROOT).contains("pirate") ||
                r.checkedHostname.toLowerCase(Locale.ROOT).contains("tamilrockers") ||
                r.checkedHostname.toLowerCase(Locale.ROOT).contains("1337x"));
        contentAdv.status = isPiracy ? "STREAMING_PIRACY" : "CLEAN";
        contentAdv.details = isPiracy ? "Illicit movie streaming / copyright piracy pattern detected. Piracy portals carry elevated risk of malvertising, fraudulent redirects, and deceptive download prompts." : "No content or legality advisories.";
        findings.contentAdvisory = contentAdv;

        r.findings = findings;

        // Verdict
        if ("MALICIOUS".equals(v.getRiskLevel().name()) || "MALICIOUS".equals(tech.status)) {
            r.verdict = "UNSAFE";
        } else if ("HIGH_RISK".equals(v.getRiskLevel().name()) || "DECEPTIVE_SUBDOMAIN".equals(brand.status) || "LOOKALIKE".equals(brand.status) || "CREDENTIAL_HARVESTING".equals(scam.status) || "COERCION_URGENCY".equals(scam.status)) {
            r.verdict = "FRAUD";
        } else if (v.getRiskScore() >= 40 || "SUSPICIOUS".equals(tech.status) || "STREAMING_PIRACY".equals(contentAdv.status) || "CRACK_WAREZ".equals(contentAdv.status)) {
            r.verdict = "SUSPICIOUS";
        } else if (!v.isTrusted()) {
            r.verdict = "UNVERIFIED";
        } else {
            r.verdict = "NO_KNOWN_THREATS";
        }

        r.checksRun.add("On-device 22-policy rule & ML risk engine (Local)");
        r.checksRun.add("On-device brand & ccSLD domain evaluation (Local)");
        r.checksFailed.add("Cloud threat intelligence check (Offline or not signed in)");

        AnalyzeResponse.AiAnalysis ai = new AnalyzeResponse.AiAnalysis();
        ai.configured = false;
        ai.explanation = "On-device deterministic analysis. No server AI used.";
        r.aiAnalysis = ai;

        return r;
    }

    private static ContentType parseType(String name) {
        if (name == null) return ContentType.URL;
        try {
            return ContentType.valueOf(name.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return ContentType.URL;
        }
    }
}
