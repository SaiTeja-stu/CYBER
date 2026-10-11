package com.cybershield.app.net.dto;

import java.util.ArrayList;
import java.util.List;

/** Mirrors the backend AnalyzeResponse record with unified evidence fields. */
public class AnalyzeResponse {
    public String reportId;
    public String contentType;
    public int riskScore;
    public String riskLevel;     // SAFE | SUSPICIOUS | HIGH_RISK | MALICIOUS
    public String priority;      // P1..P4
    public String wording;
    public int confidence;
    public boolean verified;
    public boolean trusted;
    public boolean initiatesPayment;
    public List<String> categories = new ArrayList<>();
    public List<Signal> signals = new ArrayList<>();
    public String explanation;
    public List<String> recommendations = new ArrayList<>();
    public PaymentInfo payment;
    public String analyzedAt;

    // Unified evidence-based taxonomy and audit breakdown
    public String verdict;       // UNSAFE | FRAUD | SUSPICIOUS | UNVERIFIED | NO_KNOWN_THREATS
    public String checkedHostname;
    public String registrableDomain;
    public String finalDestination;
    public Findings findings;
    public List<String> checksRun = new ArrayList<>();
    public List<String> checksFailed = new ArrayList<>();
    public AiAnalysis aiAnalysis;

    public boolean isBlocking() {
        return "UNSAFE".equals(verdict) || "FRAUD".equals(verdict)
                || "MALICIOUS".equals(riskLevel) || "HIGH_RISK".equals(riskLevel);
    }

    public static class Signal {
        public String policyId;
        public String name;
        public String detail;
        public String severity;  // CRITICAL | HIGH | MEDIUM | LOW | TRUST
        public int weight;
    }

    public static class PaymentInfo {
        public String scheme;
        public String action;
        public String payeeVpa;
        public String payeeName;
        public Double amount;
        public String currency;
        public String note;
        public boolean pullPayment;
    }

    public static class Findings {
        public Dimension technicalThreat;
        public BrandDimension brandAuthenticity;
        public ScamDimension scamEvidence;
        public ContentDimension contentAdvisory;
    }

    public static class Dimension {
        public String status;
        public String details;
        public List<String> evidence = new ArrayList<>();
    }

    public static class BrandDimension {
        public String status;
        public String details;
        public String brand;
        public String officialDomain;
    }

    public static class ScamDimension {
        public String status;
        public String details;
        public List<String> hits = new ArrayList<>();
    }

    public static class ContentDimension {
        public String status;
        public String details;
    }

    public static class AiAnalysis {
        public boolean configured;
        public String provider;
        public String model;
        public String explanation;
    }
}
