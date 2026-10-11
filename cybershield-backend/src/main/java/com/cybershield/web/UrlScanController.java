package com.cybershield.web;

import com.cybershield.analyze.AnalysisService;
import com.cybershield.domain.ContentType;
import com.cybershield.intel.DomainIntelService;
import com.cybershield.scan.ScanRecord;
import com.cybershield.scan.ScanRecordRepository;
import com.cybershield.web.dto.AnalyzeResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Spec-shaped URL scanner endpoints ({@code /api/analyze-url}, {@code /api/url-scans}).
 *
 * <p>Thin adapter over the existing {@link AnalysisService} pipeline (validation →
 * normalization → 11 URL policies incl. the ML model → threat intel → risk engine).
 * It only re-shapes the verdict to snake_case + the 5-level scale the URL-scanner
 * UI expects; the engine and storage are unchanged.
 */
@RestController
@RequestMapping("/api")
public class UrlScanController {

    private final AnalysisService analysis;
    private final ScanRecordRepository scans;
    private final DomainIntelService domains;

    public UrlScanController(AnalysisService analysis, ScanRecordRepository scans,
                             DomainIntelService domains) {
        this.analysis = analysis;
        this.scans = scans;
        this.domains = domains;
    }

    public record UrlRequest(
            @NotBlank(message = "url is required")
            @Size(max = 2048, message = "url too long")
            String url) {}

    @PostMapping("/analyze-url")
    public Map<String, Object> analyzeUrl(@Valid @RequestBody UrlRequest req,
                                          @RequestHeader(value = "X-Client", required = false) String client) {
        AnalyzeResponse v = analysis.analyze(ContentType.URL, req.url(), null, client, CurrentUser.id(), true);
        return shape(req.url(), v);
    }

    @GetMapping("/url-scans")
    public Map<String, Object> myUrlScans(@RequestParam(defaultValue = "0") int page,
                                          @RequestParam(defaultValue = "20") int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 100);
        var result = scans.findByOwnerIdOrderByCreatedAtDesc(CurrentUser.id(), PageRequest.of(p, s));
        List<Map<String, Object>> items = new ArrayList<>();
        for (ScanRecord r : result.getContent()) {
            if (r.getType() != ContentType.URL) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.getId());
            row.put("domain", r.getSnippet());
            row.put("risk_score", r.getRiskScore());
            row.put("risk_level", fiveLevel(r.getRiskScore()));
            row.put("created_at", r.getCreatedAt());
            items.add(row);
        }
        return Map.of("items", items, "page", p, "size", s,
                "total_elements", result.getTotalElements(), "total_pages", result.getTotalPages());
    }

    // --- shaping -----------------------------------------------------------

    private Map<String, Object> shape(String original, AnalyzeResponse v) {
        List<Map<String, Object>> indicators = new ArrayList<>();
        for (AnalyzeResponse.SignalDto s : v.signals()) {
            if (s.weight() <= 0) continue;   // trust/negative signals aren't "indicators"
            Map<String, Object> ind = new LinkedHashMap<>();
            ind.put("type", indicatorType(s.policyId()));
            ind.put("severity", s.severity());
            ind.put("message", s.detail());
            ind.put("policy_id", s.policyId());
            indicators.add(ind);
        }

        Map<String, Object> ti = new LinkedHashMap<>();
        boolean tiHit = v.signals().stream().anyMatch(s ->
                s.policyId().equals("URL-10") || s.policyId().startsWith("X-"));
        ti.put("detected", tiHit);
        ti.put("providers", List.of());   // populated when GOOGLE_SAFE_BROWSING_KEY / URLHAUS_AUTH_KEY set

        String domain = domainOf(original);
        Map<String, Object> whois = new LinkedHashMap<>();
        domains.lookup(domain).ifPresentOrElse(d -> {
            whois.put("source", d.source());
            whois.put("registered", d.registered());
            whois.put("age_days", d.ageDays());
            whois.put("registrar", d.registrar());
            whois.put("expires", d.expires());
        }, () -> {
            whois.put("source", null);
            whois.put("note", "no public registration data (privacy-protected ccTLD, or lookup unavailable)");
        });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", original);
        out.put("normalized_url", original.matches("(?i)^https?://.*") ? original : "http://" + original);
        out.put("domain", domain);
        out.put("domain_intel", whois);
        out.put("risk_score", v.riskScore());
        out.put("risk_level", fiveLevel(v.riskScore()));
        out.put("engine_risk_level", v.riskLevel());     // internal 4-level, for reference
        out.put("confidence", round2(v.confidence() / 100.0));
        out.put("verified", v.verified());
        out.put("trusted", v.trusted());
        out.put("wording", v.wording());
        out.put("indicators", indicators);
        out.put("threat_intelligence", ti);
        out.put("explanation", v.explanation());
        out.put("recommendations", v.recommendations());
        out.put("verdict", v.verdict());
        out.put("checked_hostname", v.checkedHostname());
        out.put("registrable_domain", v.registrableDomain());
        out.put("final_destination", v.finalDestination());
        out.put("findings", v.findings());
        out.put("checks_run", v.checksRun());
        out.put("checks_failed", v.checksFailed());
        out.put("ai_analysis", v.aiAnalysis());
        out.put("report_id", v.reportId());
        out.put("analyzed_at", v.analyzedAt());
        return out;
    }

    /** Spec's 5-level scale, mapped from the 0-100 score. */
    static String fiveLevel(int score) {
        if (score <= 20) return "SAFE";
        if (score <= 40) return "LOW_RISK";
        if (score <= 59) return "SUSPICIOUS";
        if (score < 80) return "HIGH_RISK";
        return "CRITICAL";          // matches the engine's MALICIOUS floor (80)
    }

    private static String indicatorType(String policyId) {
        return switch (policyId) {
            case "URL-01" -> "TYPOSQUATTING";
            case "URL-02" -> "HOMOGRAPH_DOMAIN";
            case "URL-04" -> "IP_ADDRESS_URL";
            case "URL-05" -> "DECEPTIVE_SUBDOMAIN";
            case "URL-06" -> "URL_SHORTENER";
            case "URL-07" -> "URL_OBFUSCATION";
            case "URL-08" -> "SUSPICIOUS_TLD";
            case "URL-09" -> "INSECURE_TRANSPORT";
            case "URL-10" -> "THREAT_INTELLIGENCE";
            case "URL-13" -> "ML_URL_RISK";
            case "DNS-01" -> "DOMAIN_AGE";
            case "WEB-01" -> "CREDENTIAL_FORM";
            case "WEB-04" -> "MALICIOUS_PAGE_CONTENT";
            default -> policyId.startsWith("X-") ? "COMMUNITY_REPORT"
                    : policyId.startsWith("MSG") ? "SOCIAL_ENGINEERING" : "SUSPICIOUS_URL";
        };
    }

    private static String domainOf(String url) {
        try {
            String s = url.matches("(?i)^https?://.*") ? url : "http://" + url;
            String host = java.net.URI.create(s).getHost();
            return host == null ? "" : host.toLowerCase();
        } catch (RuntimeException e) {
            return "";
        }
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
