package com.cybershield.engine.policies.url;

import com.cybershield.domain.Severity;
import com.cybershield.domain.Signal;
import com.cybershield.engine.AbstractPolicy;
import com.cybershield.engine.PolicyContext;
import com.cybershield.intel.LocalIntelStore;
import org.apache.commons.text.similarity.LevenshteinDistance;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** URL-01: the host is a near-miss of a well-known brand domain (look-alike). */
@Component
public class TyposquattingPolicy extends AbstractPolicy {

    private final LocalIntelStore intel;
    private final LevenshteinDistance lev = new LevenshteinDistance(3);

    public TyposquattingPolicy(LocalIntelStore intel) {
        super("URL-01", URL_LIKE);
        this.intel = intel;
    }

    @Override
    protected List<Signal> doEvaluate(PolicyContext ctx) {
        List<Signal> out = new ArrayList<>();
        for (var u : ctx.allUrls()) {
            if (intel.isAllowedDomain(u.host())) continue;
            String base = u.baseDomain().toLowerCase(Locale.ROOT);
            String label = base.contains(".") ? base.substring(0, base.indexOf('.')) : base;
            for (String brand : intel.knownBrands()) {
                if (label.equals(brand)) continue;
                int d = safeDistance(label, brand);
                boolean isEditDistanceMatch = brand.length() >= 4 && d == 1 && Math.abs(label.length() - brand.length()) <= 1;
                // Only consider token match if brand is an isolated segment separated by hyphen (e.g. apple-login)
                boolean isTokenWithPhishingIntent = false;
                if (label.contains("-")) {
                    String[] tokens = label.split("-");
                    boolean hasBrandToken = false;
                    boolean hasPhishIntent = false;
                    for (String tok : tokens) {
                        if (tok.equals(brand)) hasBrandToken = true;
                        if (java.util.Set.of("login", "verify", "secure", "auth", "account", "banking", "wallet", "kyc", "portal", "update").contains(tok)) {
                            hasPhishIntent = true;
                        }
                    }
                    isTokenWithPhishingIntent = hasBrandToken && hasPhishIntent;
                }

                if (isEditDistanceMatch || isTokenWithPhishingIntent) {
                    out.add(signal("Look-alike domain",
                            "'" + u.host() + "' closely imitates the brand '" + brand + "'.",
                            Severity.HIGH, 30));
                    break;
                }
            }
        }
        return out;
    }

    private int safeDistance(String a, String b) {
        Integer d = lev.apply(a, b);
        return d == null || d < 0 ? Integer.MAX_VALUE : d;
    }
}
