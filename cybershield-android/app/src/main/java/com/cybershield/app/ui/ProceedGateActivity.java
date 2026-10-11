package com.cybershield.app.ui;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.fragment.app.FragmentActivity;

import com.cybershield.app.data.Repository;
import com.cybershield.app.shield.OverlayService;
import com.cybershield.app.shield.ShieldPrefs;

/**
 * Friction gate for "continue anyway" on a Secure Me warning. The user must confirm with their fingerprint /
 * face / device PIN before the block is lifted, so nobody can tap straight through a warning (and a child or
 * someone borrowing the phone can't either).
 *
 * <p>Some OEM builds report {@link BiometricGate#available} as false even when the device has a real PIN,
 * pattern or password set (a known androidx.biometric quirk combining BIOMETRIC_STRONG with
 * DEVICE_CREDENTIAL). When that happens we fall back to the system's own "confirm device credential" screen
 * instead of silently letting the user through - a warning must always require some confirmation.
 *
 * <p>On success: the site is allowed for 30 minutes, a dangerous-site block is reopened in the browser, and - for
 * high / very-high risk - the site address (no query string) and score are reported to the Secure Me dashboard.
 */
public class ProceedGateActivity extends FragmentActivity {

    private static final long ALLOW_MS = 30L * 60 * 1000;
    private static final int REPORT_MIN_SCORE = 50;

    private String host;
    private String url;
    private String pkg;
    private int score;
    private boolean reopen;

    private ActivityResultLauncher<Intent> credentialLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setFinishOnTouchOutside(false);
        Intent in = getIntent();
        host = in == null ? null : in.getStringExtra(OverlayService.EX_HOST);
        url = in == null ? null : in.getStringExtra(OverlayService.EX_URL);
        pkg = in == null ? null : in.getStringExtra(OverlayService.EX_PKG);
        score = in == null ? 0 : in.getIntExtra(OverlayService.EX_SCORE, 0);
        reopen = in != null && in.getBooleanExtra(OverlayService.EX_HARD, false);   // hard block replaced the page

        credentialLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (result.getResultCode() == Activity.RESULT_OK) {
                proceed();
            } else {
                Toast.makeText(this, "Not confirmed - staying on the safe side.", Toast.LENGTH_SHORT).show();
                finishAndRemoveTask();   // warning overlay stays up
            }
        });

        boolean deviceHasLock = isDeviceSecure(this);

        if (!BiometricGate.available(this)) {
            if (deviceHasLock) {
                // BiometricPrompt is unavailable on this OEM build but a real screen lock exists:
                // fall back to the system's own PIN / pattern / password confirmation screen.
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                Intent confirm = km == null ? null : km.createConfirmDeviceCredentialIntent(
                        "Continue to this site?",
                        "Secure Me flagged it (risk " + score + "/100). Confirm to proceed anyway.");
                if (confirm != null) {
                    credentialLauncher.launch(confirm);
                    return;
                }
            }
            // No screen lock at all: a warning can never be bypassed without something to confirm with,
            // whether it replaced the page (hard) or not (soft) - always block, never proceed silently.
            Toast.makeText(this, "Set a screen lock (PIN, pattern or fingerprint) to continue past a "
                    + "Secure Me warning.", Toast.LENGTH_LONG).show();
            finishAndRemoveTask();
            return;
        }

        BiometricGate.prompt(this,
                "Continue to this site?",
                "Secure Me flagged it (risk " + score + "/100). Confirm to proceed anyway.",
                new BiometricGate.Result() {
                    @Override public void onUnlocked() { proceed(); }
                    @Override public void onFailedOrCancelled() {
                        Toast.makeText(ProceedGateActivity.this,
                                "Not confirmed - staying on the safe side.", Toast.LENGTH_SHORT).show();
                        finishAndRemoveTask();   // warning overlay stays up
                    }
                });
    }

    private static boolean isDeviceSecure(Context ctx) {
        try {
            KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
            return km != null && km.isDeviceSecure();
        } catch (Exception e) {
            return false;
        }
    }

    private void proceed() {
        new ShieldPrefs(this).allowHost(host, ALLOW_MS);
        stopService(new Intent(this, OverlayService.class));   // removes the warning overlay

        // tell the dashboard the user chose to go on (address without query string, plus the score)
        if (score >= REPORT_MIN_SCORE && url != null) {
            String note = "AUTO-REPORT: user continued past a Secure Me warning (risk " + score
                    + "/100) after confirming with fingerprint / PIN.";
            new Repository(getApplicationContext()).report("URL", stripQuery(url), note);
        }

        // a dangerous-site block replaced the page: open the site again, now that the user has agreed
        if (reopen && url != null) {
            try {
                Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (pkg != null && !pkg.isEmpty()) open.setPackage(pkg);
                startActivity(open);
            } catch (Exception ignored) {
            }
        }
        // own task (see manifest) + remove it, so Android returns to the browser, not to Secure Me
        finishAndRemoveTask();
    }

    private static String stripQuery(String u) {
        int q = u.indexOf('?');
        int h = u.indexOf('#');
        int cut = q < 0 ? h : (h < 0 ? q : Math.min(q, h));
        String s = cut < 0 ? u : u.substring(0, cut);
        return s.length() > 300 ? s.substring(0, 300) : s;
    }
}
