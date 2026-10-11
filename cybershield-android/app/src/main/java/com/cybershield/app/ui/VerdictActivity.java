package com.cybershield.app.ui;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.cybershield.app.data.Repository;
import com.cybershield.app.databinding.ActivityVerdictBinding;
import com.cybershield.app.engine.LocalVerdict;
import com.cybershield.app.geo.LocationHelper;
import com.cybershield.app.net.dto.AnalyzeResponse;
import com.cybershield.app.net.dto.IncidentReportResponse;

/**
 * Shows the on-device verdict instantly, then replaces it with the authoritative
 * server verdict when it arrives. Works offline (local verdict stands).
 */
public class VerdictActivity extends AppCompatActivity {

    private static final String EX_TYPE = "type";
    private static final String EX_CONTENT = "content";
    private static final String EX_SOURCE = "source";

    private static final int RC_LOCATION = 4201;

    private ActivityVerdictBinding b;
    private SignalAdapter adapter;
    private String type, content, source;
    private String lastRiskTier = "SUSPICIOUS";
    private int lastRiskScore = 0;

    public static Intent intent(Context ctx, String type, String content, String source) {
        Intent i = new Intent(ctx, VerdictActivity.class);
        i.putExtra(EX_TYPE, type);
        i.putExtra(EX_CONTENT, content);
        i.putExtra(EX_SOURCE, source);
        return i;
    }

    public static void start(Context ctx, String type, String content, String source) {
        Intent i = intent(ctx, type, content, source);
        if (!(ctx instanceof AppCompatActivity)) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        b = ActivityVerdictBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());

        type = getIntent().getStringExtra(EX_TYPE);
        content = getIntent().getStringExtra(EX_CONTENT);
        source = getIntent().getStringExtra(EX_SOURCE);
        if (type == null || content == null) { finish(); return; }

        adapter = new SignalAdapter();
        b.signals.setLayoutManager(new LinearLayoutManager(this));
        b.signals.setAdapter(adapter);

        b.btnDone.setOnClickListener(v -> finish());
        b.btnReport.setOnClickListener(v -> {
            new Repository(this).report(type, content, "reported from app");
            b.btnReport.setEnabled(false);
            lodgeGeoTaggedIncident();
        });

        new Repository(this).analyze(type, content, source, new Repository.Callback() {
            @Override public void onLocal(LocalVerdict local) { renderLocal(local); }
            @Override public void onServer(AnalyzeResponse server) { renderServer(server); }
            @Override public void onServerError(String message) {
                Toast.makeText(VerdictActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void renderLocal(LocalVerdict v) {
        lastRiskTier = v.level.name();
        lastRiskScore = v.score;
        b.badge.setText(v.priority() + " · on-device check");
        pill(colorForLevel(v.level.name()));
        b.score.setText(String.valueOf(v.score));
        b.score.setTextColor(colorForLevel(v.level.name()));
        b.donut.set(v.score, v.level.name(), 0, v.reasons == null ? 0 : v.reasons.size());
        b.wording.setText("Preliminary — confirming with the server…");
        b.paymentWarn.setVisibility(v.initiatesPayment ? View.VISIBLE : View.GONE);
        adapter.setReasons(v.reasons);
        b.explanation.setText(v.reasons.isEmpty()
                ? "No obvious problems found on-device. Waiting for the full check."
                : "");
        b.recsTitle.setVisibility(View.GONE);
    }

    private void renderServer(AnalyzeResponse r) {
        lastRiskTier = r.riskLevel;
        lastRiskScore = r.riskScore;

        String verdict = r.verdict;
        if (verdict == null || verdict.isEmpty()) {
            boolean noSignals = r.riskScore == 0
                    && (r.signals == null || r.signals.stream().noneMatch(s -> s.weight > 0));
            boolean unverifiedClean = "SAFE".equals(r.riskLevel) && !r.trusted && noSignals;
            verdict = "MALICIOUS".equals(r.riskLevel) ? "UNSAFE"
                    : "HIGH_RISK".equals(r.riskLevel) ? "FRAUD"
                    : "SUSPICIOUS".equals(r.riskLevel) ? "SUSPICIOUS"
                    : unverifiedClean ? "UNVERIFIED" : "NO_KNOWN_THREATS";
        }

        String badgeText;
        int color;
        switch (verdict) {
            case "UNSAFE" -> {
                badgeText = "UNSAFE · TECHNICAL THREAT";
                color = Color.parseColor("#E5484D");
            }
            case "FRAUD" -> {
                badgeText = "FRAUD · SCAM/IMPERSONATION";
                color = Color.parseColor("#F08A3C");
            }
            case "SUSPICIOUS" -> {
                badgeText = "SUSPICIOUS · CAUTION";
                color = Color.parseColor("#D4A20B");
            }
            case "NO_KNOWN_THREATS" -> {
                badgeText = "NO KNOWN THREATS DETECTED";
                color = Color.parseColor("#16A34A");
            }
            default -> { // UNVERIFIED
                badgeText = "UNVERIFIED";
                color = Color.parseColor("#8A908D");
            }
        }

        b.badge.setText(badgeText);
        pill(color);
        b.score.setText(String.valueOf(r.riskScore));
        b.score.setTextColor(color);

        int warnCount = 0;
        if (r.signals != null) for (AnalyzeResponse.Signal s : r.signals) if (s.weight > 0) warnCount++;
        b.donut.set(r.riskScore, r.riskLevel, 0, warnCount);

        if ("NO_KNOWN_THREATS".equals(verdict)) {
            b.wording.setText("Checks found no known threat. Note: This does not guarantee absolute safety.");
        } else if ("UNVERIFIED".equals(verdict)) {
            b.wording.setText("Evidence is insufficient or cloud checks were unavailable. Proceed with caution.");
        } else if ("UNSAFE".equals(verdict)) {
            b.wording.setText("High-risk technical threat identified. Avoid visiting this destination.");
        } else if ("FRAUD".equals(verdict)) {
            b.wording.setText("Credible evidence of brand impersonation or financial fraud.");
        } else {
            b.wording.setText(r.wording == null ? "Concerning signals detected." : "“" + r.wording + "”");
        }

        b.paymentWarn.setVisibility(r.initiatesPayment ? View.VISIBLE : View.GONE);
        if (r.payment != null) {
            b.paymentBox.setVisibility(View.VISIBLE);
            b.payPayee.setText("To: " + safe(r.payment.payeeName) + "  (" + safe(r.payment.payeeVpa) + ")");
            b.payAmount.setText("Amount: " + (r.payment.amount == null ? "not set" : r.payment.amount + " " + r.payment.currency)
                    + (r.payment.pullPayment ? "  ·  PULL request" : ""));
        }

        StringBuilder exp = new StringBuilder();
        if (r.checkedHostname != null && !r.checkedHostname.isEmpty()) {
            exp.append("Host checked: ").append(r.checkedHostname);
            if (r.registrableDomain != null && !r.registrableDomain.isEmpty()) {
                exp.append(" (").append(r.registrableDomain).append(")");
            }
            exp.append("\n\n");
        }
        if (r.explanation != null && !r.explanation.isEmpty()) {
            exp.append(r.explanation).append("\n\n");
        }
        if (r.findings != null && r.findings.contentAdvisory != null && !"CLEAN".equals(r.findings.contentAdvisory.status)) {
            exp.append("Advisory: ").append(r.findings.contentAdvisory.details).append("\n\n");
        }
        if (r.checksRun != null && !r.checksRun.isEmpty()) {
            exp.append("Checks evaluated: ").append(String.join(", ", r.checksRun));
        }
        if (r.checksFailed != null && !r.checksFailed.isEmpty()) {
            exp.append("\nUnavailable checks: ").append(String.join(", ", r.checksFailed));
        }

        b.explanation.setText(exp.toString().trim());
        adapter.set(r.signals);

        b.recsTitle.setVisibility(View.VISIBLE);
        StringBuilder sb = new StringBuilder();
        if (r.recommendations != null) for (String rec : r.recommendations) sb.append("•  ").append(rec).append('\n');
        b.recs.setText(sb.toString().trim());
    }

    /** Grabs a GPS fix (asking for permission if needed) then lodges the incident report. */
    private void lodgeGeoTaggedIncident() {
        if (!LocationHelper.hasPermission(this)) {
            Toast.makeText(this, "Getting your location to route this to the right Cyber Crime station…", Toast.LENGTH_SHORT).show();
            LocationHelper.requestPermission(this, RC_LOCATION);
            return;
        }
        LocationHelper.fetchCurrentLocation(this, new LocationHelper.Callback() {
            @Override public void onLocation(Double lat, Double lon, Float accuracyMeters, String provider) {
                submitIncident(lat, lon, accuracyMeters, provider);
            }
            @Override public void onUnavailable(String reason) {
                submitIncident(null, null, null, "UNAVAILABLE: " + reason);
            }
        });
    }

    private void submitIncident(Double lat, Double lon, Float accuracyMeters, String provider) {
        new Repository(this).reportIncident(type, content, lastRiskTier, lastRiskScore,
                lat, lon, accuracyMeters, provider, new Repository.IncidentCallback() {
                    @Override public void onLodged(IncidentReportResponse resp) {
                        new AlertDialog.Builder(VerdictActivity.this)
                                .setTitle("Incident draft prepared")
                                .setMessage("Reference: " + resp.incidentId
                                        + "\nJurisdiction: " + resp.jurisdictionStation
                                        + "\nHelpline: " + resp.helpline)
                                .setPositiveButton("OK", null)
                                .show();
                    }
                    @Override public void onFailed(String message) {
                        Toast.makeText(VerdictActivity.this, message, Toast.LENGTH_SHORT).show();
                    }
                });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RC_LOCATION) {
            boolean granted = LocationHelper.hasPermission(this);
            if (granted) {
                lodgeGeoTaggedIncident();
            } else {
                Toast.makeText(this, "Location permission denied — reporting without GPS tag.", Toast.LENGTH_SHORT).show();
                submitIncident(null, null, null, "PERMISSION_DENIED");
            }
        }
    }

    private static String safe(String s) {
        return s == null ? "—" : s;
    }

    /** Rounded pill badge, tinted + faint translucent fill. */
    private void pill(int color) {
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setColor((color & 0x00FFFFFF) | 0x33000000);           // ~20% fill
        d.setStroke(Math.round(getResources().getDisplayMetrics().density), color);
        d.setCornerRadius(999f);
        b.badge.setBackground(d);
        b.badge.setTextColor(color);
    }

    private int colorForLevel(String level) {
        if (level == null) return Color.parseColor("#9F9F9F");
        switch (level) {
            case "MALICIOUS": return Color.parseColor("#E5484D");
            case "HIGH_RISK": return Color.parseColor("#F08A3C");
            case "SUSPICIOUS": return Color.parseColor("#F5C451");
            case "SAFE": return Color.parseColor("#1BD671");
            default: return Color.parseColor("#9F9F9F");
        }
    }
}
