package com.cybershield.web.dto;

import java.time.Instant;
import java.util.List;

/** The verdict returned to clients. */
public record AnalyzeResponse(
        String reportId,
        String contentType,
        int riskScore,
        String riskLevel,      // SAFE / SUSPICIOUS / HIGH_RISK / MALICIOUS
        String priority,       // P1..P4
        String wording,        // user-facing label per the evidence ladder
        int confidence,
        boolean verified,
        boolean trusted,
        boolean initiatesPayment,
        List<String> categories,
        List<SignalDto> signals,
        String explanation,
        List<String> recommendations,
        PaymentInfo payment,   // non-null only for UPI QR
        Instant analyzedAt,
        String verdict,        // UNSAFE / FRAUD / SUSPICIOUS / UNVERIFIED / NO_KNOWN_THREATS
        String checkedHostname,
        String registrableDomain,
        String finalDestination,
        FindingsDto findings,
        List<String> checksRun,
        List<String> checksFailed,
        AiAnalysisDto aiAnalysis
) {
    public record SignalDto(String policyId, String name, String detail, String severity, int weight) {}

    public record PaymentInfo(
            String scheme,        // "UPI"
            String action,        // pay / collect / mandate
            String payeeVpa,      // shown to user, not stored server-side in plaintext
            String payeeName,
            Double amount,
            String currency,
            String note,
            boolean pullPayment
    ) {}

    public record FindingsDto(
            DimensionDto technicalThreat,
            BrandDimensionDto brandAuthenticity,
            ScamDimensionDto scamEvidence,
            ContentDimensionDto contentAdvisory
    ) {}

    public record DimensionDto(String status, String details, List<String> evidence) {}
    public record BrandDimensionDto(String status, String details, String brand, String officialDomain) {}
    public record ScamDimensionDto(String status, String details, List<String> hits) {}
    public record ContentDimensionDto(String status, String details) {}

    public record AiAnalysisDto(boolean configured, String provider, String model, String explanation) {}

    /** Backward-compatible 16-parameter constructor */
    public AnalyzeResponse(
            String reportId,
            String contentType,
            int riskScore,
            String riskLevel,
            String priority,
            String wording,
            int confidence,
            boolean verified,
            boolean trusted,
            boolean initiatesPayment,
            List<String> categories,
            List<SignalDto> signals,
            String explanation,
            List<String> recommendations,
            PaymentInfo payment,
            Instant analyzedAt
    ) {
        this(
                reportId, contentType, riskScore, riskLevel, priority, wording, confidence,
                verified, trusted, initiatesPayment, categories, signals, explanation, recommendations,
                payment, analyzedAt,
                mapLegacyVerdict(riskLevel, trusted, signals),
                "", "", "", null, List.of(), List.of(), null
        );
    }

    private static String mapLegacyVerdict(String riskLevel, boolean trusted, List<SignalDto> signals) {
        if ("MALICIOUS".equals(riskLevel)) return "UNSAFE";
        if ("HIGH_RISK".equals(riskLevel)) return "FRAUD";
        if ("SUSPICIOUS".equals(riskLevel)) return "SUSPICIOUS";
        return trusted ? "NO_KNOWN_THREATS" : "UNVERIFIED";
    }
}
