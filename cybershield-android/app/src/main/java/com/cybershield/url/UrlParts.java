package com.cybershield.url;

import java.net.URI;
import java.util.Locale;
import java.util.Optional;

/**
 * A normalized, validated URL. Construction rejects anything that is not a
 * well-formed http/https URL (input-validation requirement).
 */
public final class UrlParts {

    private final String original;
    private final String scheme;
    private final String host;          // lowercased, no trailing dot
    private final int port;
    private final String path;
    private final String query;
    private final boolean hasUserInfo;  // credentials in URL (obfuscation signal)
    private final boolean schemeInferred; // caller gave a bare domain; we guessed the scheme

    private UrlParts(String original, URI uri, boolean schemeInferred) {
        this.original = original;
        this.schemeInferred = schemeInferred;
        this.scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        String h = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        this.host = h;
        this.port = uri.getPort();
        this.path = uri.getPath() == null ? "" : uri.getPath();
        this.query = uri.getRawQuery() == null ? "" : uri.getRawQuery();
        this.hasUserInfo = uri.getRawUserInfo() != null && !uri.getRawUserInfo().trim().isEmpty();
    }

    /** Parse and validate. Empty if not a usable http/https URL. */
    public static Optional<UrlParts> parse(String raw) {
        if (raw == null) return Optional.empty();
        String s = raw.trim();
        if (s.isEmpty() || s.length() > 2048) return Optional.empty();
        // add scheme for bare domains (we don't actually know http vs https)
        boolean inferred = false;
        if (!s.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) {
            s = "https://" + s;
            inferred = true;
        }
        try {
            URI uri = new URI(s);
            String scheme = uri.getScheme();
            if (scheme == null) return Optional.empty();
            scheme = scheme.toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) return Optional.empty();
            if (uri.getHost() == null || uri.getHost().trim().isEmpty()) return Optional.empty();
            return Optional.of(new UrlParts(raw.trim(), uri, inferred));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public String original() { return original; }
    public String scheme() { return scheme; }
    public String host() { return host; }
    public int port() { return port; }
    public String path() { return path; }
    public String query() { return query; }
    public boolean hasUserInfo() { return hasUserInfo; }
    public boolean isHttps() { return "https".equals(scheme); }
    public boolean schemeInferred() { return schemeInferred; }

    private static final java.util.Set<String> TWO_PART_SUFFIXES = java.util.Set.of(
            "bank.in", "co.in", "com.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in",
            "nic.in", "ac.in", "edu.in", "res.in", "gov.in", "mil.in",
            "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "gov.uk", "ac.uk", "police.uk", "nhs.uk",
            "com.au", "net.au", "org.au", "edu.au", "gov.au",
            "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
            "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
            "com.br", "net.br", "org.br", "gov.br",
            "co.za", "net.za", "org.za", "gov.za",
            "com.sg", "net.sg", "org.sg", "gov.sg",
            "gc.ca"
    );

    /** The registrable domain: accounts for multi-part ccSLDs (e.g. bank.in, co.in, gov.in). */
    public String baseDomain() {
        String[] labels = host.split("\\.");
        if (labels.length <= 2) return host;
        String last2 = labels[labels.length - 2] + "." + labels[labels.length - 1];
        if (TWO_PART_SUFFIXES.contains(last2) && labels.length >= 3) {
            return labels[labels.length - 3] + "." + last2;
        }
        return last2;
    }

    public String registrableDomain() {
        return baseDomain();
    }

    public String domainLabel() {
        String base = baseDomain();
        int dot = base.indexOf('.');
        return dot > 0 ? base.substring(0, dot) : base;
    }

    public boolean isPunycode() {
        return host.contains("xn--");
    }

    public boolean hostIsIpLiteral() {
        return host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")
                || host.startsWith("[")
                || (host.matches("^[0-9a-fA-F:]+$") && host.contains(":"));
    }
}
