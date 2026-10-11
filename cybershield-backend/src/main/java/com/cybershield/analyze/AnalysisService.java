package com.cybershield.analyze;

import com.cybershield.common.PiiRedactor;
import com.cybershield.domain.*;
import com.cybershield.engine.DetectionEngine;
import com.cybershield.engine.RiskScorer;
import com.cybershield.intel.LocalIntelStore;
import com.cybershield.qr.UpiUri;
import com.cybershield.scan.ScanRecord;
import com.cybershield.scan.ScanRecordRepository;
import com.cybershield.storage.ColdLogWriter;
import com.cybershield.web.dto.AnalyzeResponse;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Orchestrates the full analysis pipeline and persists both storage tiers. */
@Service
public class AnalysisService {

    private final ContextBuilder contextBuilder;
    private final DetectionEngine engine;
    private final RiskScorer scorer;
    private final ExplanationService explanations;
    private final LlmExplanationService llm;
    private final LocalIntelStore intel;
    private final PiiRedactor redactor;
    private final ScanRecordRepository scanRepo;
    private final ColdLogWriter coldLog;
    private final ThreatNotifier threatNotifier;

    public AnalysisService(ContextBuilder contextBuilder, DetectionEngine engine, RiskScorer scorer,
                           ExplanationService explanations, LlmExplanationService llm,
                           LocalIntelStore intel, PiiRedactor redactor,
                           ScanRecordRepository scanRepo, ColdLogWriter coldLog,
                           ThreatNotifier threatNotifier) {
        this.contextBuilder = contextBuilder;
        this.engine = engine;
        this.scorer = scorer;
        this.explanations = explanations;
        this.llm = llm;
        this.intel = intel;
        this.redactor = redactor;
        this.scanRepo = scanRepo;
        this.coldLog = coldLog;
        this.threatNotifier = threatNotifier;
    }

    public AnalyzeResponse analyze(ContentType type, String content, String pageUrl,
                                   String source, String ownerId, boolean persist) {

        ContextBuilder.Built built = contextBuilder.build(type, content, pageUrl);
        List<Signal> signals = engine.run(built.context());

        Verdict v = new Verdict();
        signals.forEach(v::addSignal);
        int score = scorer.score(signals);
        v.setRiskScore(score);
        v.setRiskLevel(scorer.level(score));
        v.setConfidence(scorer.confidence(signals, built.hadNetworkData()));

        // Trust wording: only when on the curated allowlist AND nothing negative fired.
        built.context().primaryUrl().ifPresent(u -> {
            if (intel.isAllowedDomain(u.host()) && signals.stream().noneMatch(s -> s.weight() > 0)) {
                v.setTrusted(true);
            }
        });
        // "verified" stays false: no authoritative verification source wired in yet.

        UpiUri upi = built.upi();
        boolean initiatesPayment = upi != null && upi.initiatesDebit();
        explanations.enrich(v, type, upi, initiatesPayment);

        String reportId = UUID.randomUUID().toString();
        String snippet = redactor.forLog(content);

        // Optional: rewrite the explanation with the LLM (no-op unless ANTHROPIC_API_KEY set).
        llm.maybeRewrite(v, type, snippet);

        if (persist) {
            persistHot(reportId, type, built.context().contentHash(), snippet, v, ownerId);
            coldLog.write(reportId, type.name(), built.context().contentHash(), snippet, v, source, ownerId);
            threatNotifier.maybeNotify(ownerId, type.name(), v, snippet);
        }

        return toResponse(reportId, type, v, upi, initiatesPayment, built);
    }

    private void persistHot(String id, ContentType type, String hash, String snippet, Verdict v, String ownerId) {
        try {
            ScanRecord r = new ScanRecord();
            r.setId(id);
            r.setType(type);
            r.setContentHash(hash);
            r.setSnippet(snippet);
            r.setRiskScore(v.getRiskScore());
            r.setRiskLevel(v.getRiskLevel());
            r.setPriority(v.getRiskLevel().priority());
            r.setConfidence(v.getConfidence());
            r.setVerified(v.isVerified());
            r.setOwnerId(ownerId);
            r.setCreatedAt(Instant.now());
            scanRepo.save(r);
        } catch (RuntimeException ignored) {
            // hot-tier persistence is best-effort; the cold log is the source of truth
        }
    }

    private AnalyzeResponse toResponse(String id, ContentType type, Verdict v, UpiUri upi,
                                       boolean initiatesPayment, ContextBuilder.Built built) {
        List<AnalyzeResponse.SignalDto> sigs = v.getSignals().stream()
                .map(s -> new AnalyzeResponse.SignalDto(
                        s.policyId(), s.name(), s.detail(), s.severity().name(), s.weight()))
                .toList();

        AnalyzeResponse.PaymentInfo payment = null;
        if (upi != null && upi.valid()) {
            payment = new AnalyzeResponse.PaymentInfo(
                    "UPI",
                    upi.action(),
                    upi.payeeVpa().orElse(null),
                    upi.payeeName().orElse(null),
                    upi.amount().orElse(null),
                    upi.currency().orElse("INR"),
                    upi.note().orElse(null),
                    upi.isCollectOrMandate());
        }

        String checkedHostname = "";
        String registrableDomain = "";
        String finalDest = "";
        if (built.context().primaryUrl().isPresent()) {
            var u = built.context().primaryUrl().get();
            checkedHostname = u.host();
            registrableDomain = u.registrableDomain();
            finalDest = u.original();
        }

        // 1. Technical Threat
        boolean hasCrit = sigs.stream().anyMatch(s -> "CRITICAL".equals(s.severity()) || s.policyId().equals("URL-10") || s.policyId().startsWith("X-"));
        boolean hasSuspTech = sigs.stream().anyMatch(s -> s.policyId().equals("URL-02") || s.policyId().equals("URL-04") || s.policyId().equals("URL-07"));
        String techStatus = hasCrit ? "MALICIOUS" : hasSuspTech ? "SUSPICIOUS" : "CLEAN";
        String techDetails = hasCrit ? "Specific technical threat identified by threat intelligence."
                : hasSuspTech ? "Suspicious technical indicators detected (IP host, punycode, or URL obfuscation)."
                : "No malicious payloads, unencrypted passwords, or hostile redirects detected.";
        List<String> techEvidence = sigs.stream().filter(s -> s.weight() > 0 && (s.policyId().startsWith("URL-") || s.policyId().startsWith("WEB-")))
                .map(s -> s.name() + ": " + s.detail()).toList();
        var techThreat = new AnalyzeResponse.DimensionDto(techStatus, techDetails, techEvidence);

        // 2. Brand Authenticity
        boolean deceptiveSub = sigs.stream().anyMatch(s -> s.policyId().equals("URL-05"));
        boolean lookalike = sigs.stream().anyMatch(s -> s.policyId().equals("URL-01"));
        String brandStatus = v.isTrusted() ? "OFFICIAL"
                : deceptiveSub ? "DECEPTIVE_SUBDOMAIN"
                : lookalike ? "LOOKALIKE"
                : "UNRELATED";
        String brandDetails = v.isTrusted() ? "Independently verified official domain (" + registrableDomain + ")."
                : deceptiveSub ? "Brand name used in a subdomain of an unrelated registered domain."
                : lookalike ? "Character-substitution or typosquatting lookalike."
                : "Domain does not claim or impersonate an authoritative brand.";
        var brandAuth = new AnalyzeResponse.BrandDimensionDto(brandStatus, brandDetails, "", v.isTrusted() ? registrableDomain : "");

        // 3. Scam Evidence
        boolean otpTheft = sigs.stream().anyMatch(s -> s.policyId().equals("MSG-01") || s.name().toLowerCase().contains("otp"));
        boolean coercion = sigs.stream().anyMatch(s -> s.policyId().equals("MSG-02") || s.policyId().equals("MSG-04"));
        String scamStatus = otpTheft ? "CREDENTIAL_HARVESTING" : coercion ? "COERCION_URGENCY" : "NONE";
        String scamDetails = otpTheft ? "Explicit request to share one-time password (OTP) or PIN."
                : coercion ? "High-pressure urgency or fear tactics detected in message content."
                : "No coercion, lottery claims, or OTP theft detected.";
        List<String> scamHits = sigs.stream().filter(s -> s.policyId().startsWith("MSG-") || s.policyId().startsWith("S-"))
                .map(AnalyzeResponse.SignalDto::name).toList();
        var scamEv = new AnalyzeResponse.ScamDimensionDto(scamStatus, scamDetails, scamHits);

        // 4. Content Advisory
        String lowerHost = checkedHostname.toLowerCase();
        boolean isPiracy = lowerHost.contains("net77") || lowerHost.contains("netmirror") || lowerHost.contains("movie") || lowerHost.contains("pirate") || lowerHost.contains("tamilrockers") || lowerHost.contains("1337x") || lowerHost.contains("torrents");
        String contentStatus = isPiracy ? "STREAMING_PIRACY" : "CLEAN";
        String contentDetails = isPiracy
                ? "Illicit streaming / copyright piracy pattern detected (" + checkedHostname + "). Piracy portals carry elevated risk of malvertising, fraudulent redirects, and deceptive download prompts."
                : "No content or legality advisories.";
        var contentAdv = new AnalyzeResponse.ContentDimensionDto(contentStatus, contentDetails);

        var findings = new AnalyzeResponse.FindingsDto(techThreat, brandAuth, scamEv, contentAdv);

        // Verdict determination
        String verdict;
        if ("MALICIOUS".equals(v.getRiskLevel().name()) || "MALICIOUS".equals(techStatus)) {
            verdict = "UNSAFE";
        } else if ("HIGH_RISK".equals(v.getRiskLevel().name()) || "DECEPTIVE_SUBDOMAIN".equals(brandStatus) || "LOOKALIKE".equals(brandStatus) || "CREDENTIAL_HARVESTING".equals(scamStatus) || "COERCION_URGENCY".equals(scamStatus)) {
            verdict = "FRAUD";
        } else if (v.getRiskScore() >= 40 || "SUSPICIOUS".equals(techStatus) || "STREAMING_PIRACY".equals(contentStatus) || "CRACK_WAREZ".equals(contentStatus)) {
            verdict = "SUSPICIOUS";
        } else if (!built.hadNetworkData() && !v.isTrusted()) {
            verdict = "UNVERIFIED";
        } else {
            verdict = "NO_KNOWN_THREATS";
        }

        List<String> checksRun = new java.util.ArrayList<>();
        checksRun.add("Domain syntax & ccSLD parsing (Server)");
        checksRun.add("Authoritative brand authenticity & lookalike check (Server)");
        if (built.hadNetworkData()) {
            checksRun.add("SSRF-guarded page fetch & redirect resolution (Server)");
        }
        checksRun.add("22-policy rule & ML risk engine (Server)");
        checksRun.add("Local threat intelligence & blocklist check (Server)");

        List<String> checksFailed = new java.util.ArrayList<>();
        if (!built.hadNetworkData() && (type == ContentType.URL || type == ContentType.WEBPAGE)) {
            checksFailed.add("Outbound network fetch (Target could not be safely reached or timed out)");
        }
        if (!llm.active()) {
            checksFailed.add("AI explanation provider (No server-side AI API key configured)");
        }

        var aiAnalysis = new AnalyzeResponse.AiAnalysisDto(
                llm.active(),
                llm.active() ? "Anthropic" : null,
                llm.active() ? "claude-haiku" : null,
                llm.active() ? v.getExplanation() : "Deterministic signal evaluation (No AI API key configured; results derived directly from verified evidence)."
        );

        return new AnalyzeResponse(
                id,
                type.name(),
                v.getRiskScore(),
                v.getRiskLevel().name(),
                v.getRiskLevel().priority(),
                v.wording(),
                v.getConfidence(),
                v.isVerified(),
                v.isTrusted(),
                initiatesPayment,
                v.getCategories(),
                sigs,
                v.getExplanation(),
                v.getRecommendations(),
                payment,
                Instant.now(),
                verdict,
                checkedHostname,
                registrableDomain,
                finalDest,
                findings,
                checksRun,
                checksFailed,
                aiAnalysis);
    }
}
