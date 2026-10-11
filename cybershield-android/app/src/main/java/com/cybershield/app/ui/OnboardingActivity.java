package com.cybershield.app.ui;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.accessibility.AccessibilityManager;
import android.widget.Toast;

import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.DrawableRes;
import androidx.appcompat.app.AppCompatActivity;

import com.cybershield.app.CyberShieldApp;
import com.cybershield.app.R;
import com.cybershield.app.data.SecureStore;
import com.cybershield.app.databinding.ActivityOnboardingBinding;
import com.cybershield.app.databinding.ItemPermissionRowBinding;
import com.cybershield.app.databinding.ItemSettingRowBinding;
import com.cybershield.app.shield.FraudAccessibilityService;
import com.cybershield.app.shield.ShieldPrefs;

/**
 * "Protect my whole phone": the special-access permissions the shield needs, plus its preferences.
 * None of the permissions can be granted with a normal dialog - each card deep-links to the exact
 * system settings screen, and its state refreshes when the user comes back.
 */
public class OnboardingActivity extends AppCompatActivity {

    private ActivityOnboardingBinding b;

    private final androidx.activity.result.ActivityResultLauncher<String[]> smsPerms =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), r -> refresh());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        b = ActivityOnboardingBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());

        b.btnBack.setOnClickListener(v -> finish());

        setupRow(b.rowSms, R.drawable.ic_sms, "Scam texts", "Check new SMS for fraud as they arrive",
                () -> smsPerms.launch(new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}));
        setupRow(b.rowOverlay, R.drawable.ic_warning, "Warning pop-ups", "Show a warning on top of any app",
                () -> startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()))));
        setupRow(b.rowAccessibility, R.drawable.ic_edu_web, "Risky websites", "Warn you before a dangerous page opens",
                () -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        setupRow(b.rowNotif, R.drawable.ic_mail, "Scam emails", "Check new emails the moment they land",
                () -> startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")));

        b.tvRestricted.setOnClickListener(v -> startActivity(new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));

        ShieldPrefs shield = new ShieldPrefs(this);
        SecureStore store = CyberShieldApp.get().api().store();

        setupSetting(b.setBrowser, "Website warnings", "Watch sites you open in any browser", shield.watchBrowsers());
        setupSetting(b.setStrict, "Extra careful", "Also pause on sites we can't verify yet", shield.strictMode());
        setupSetting(b.setLock, "App lock", "Use fingerprint or face to open SecureMe", store.biometricLock());
        setupSetting(b.setDlt, "Check who really sent it", "Spot texts faking a bank or company name",
                shield.dltProtectionEnabled());
        setupSetting(b.setQuietBank, "Stay quiet for real banks", "No alarms for genuine OTPs and payment alerts",
                shield.suppressLegitBankAlerts());
        setupSetting(b.setPromo, "Flag promo texts too", "Let me know about marketing messages",
                shield.notifyOnPromo());

        b.setBrowser.toggle.setOnCheckedChangeListener((v, on) -> {
            shield.setWatchBrowsers(on);
            if (!on) b.setStrict.toggle.setChecked(false);
            setSettingEnabled(b.setStrict, on);
        });
        setSettingEnabled(b.setStrict, shield.watchBrowsers());
        b.setStrict.toggle.setOnCheckedChangeListener((v, on) -> shield.setStrictMode(on));

        b.setLock.toggle.setOnCheckedChangeListener((v, on) -> {
            // without a device lock the app could never be unlocked again
            if (on && !BiometricGate.available(this)) {
                b.setLock.toggle.setChecked(false);
                Toast.makeText(this, "Set up a fingerprint or screen lock on your phone first.",
                        Toast.LENGTH_LONG).show();
                return;
            }
            store.setBiometricLock(on);
        });

        b.setDlt.toggle.setOnCheckedChangeListener((v, on) -> shield.setDltProtectionEnabled(on));
        b.setQuietBank.toggle.setOnCheckedChangeListener((v, on) -> shield.setSuppressLegitBankAlerts(on));
        b.setPromo.toggle.setOnCheckedChangeListener((v, on) -> shield.setNotifyOnPromo(on));

        b.btnTestLegitSms.setOnClickListener(v -> {
            com.cybershield.app.sms.SmsReceiver.scan(getApplicationContext(), "VK-HDFCBK-T",
                    "₹5,000.00 debited from A/C XX1234 on 08-Sep-26. UPI ref 6251049281. Avl Bal: ₹42,150.00. "
                            + "If not done by you, immediately call 18002026161 or SMS BLOCK to 5676712.");
            Toast.makeText(this, "Real HDFC alert: SecureMe stayed quiet, as it should.", Toast.LENGTH_LONG).show();
        });
        b.btnTestSms.setOnClickListener(v -> {
            com.cybershield.app.sms.SmsReceiver.scan(getApplicationContext(), "+919812345678",
                    "Dear customer, your SBI account KYC is pending. Verify your debit card and the OTP "
                            + "at http://sbi-kyc-verify.tk now or your account will be blocked today.");
            Toast.makeText(this, "Sample scam text sent to the checker. Watch for the warning.",
                    Toast.LENGTH_SHORT).show();
        });
        b.btnTestEmail.setOnClickListener(v -> {
            String raw = "From: \"PayPal Service\" <security@paypa1-account-verify.tk>\n"
                    + "Reply-To: paypal.recovery.team@gmail.com\n"
                    + "Subject: Urgent: your account has been limited\n"
                    + "Authentication-Results: mx.google.com; spf=fail; dkim=fail; dmarc=fail\n\n"
                    + "Verify your identity now at http://paypa1-account-verify.tk/login or your account "
                    + "will be permanently suspended. Confirm your password and the OTP sent to your phone.";
            startActivity(VerdictActivity.intent(this, "EMAIL", raw, "test"));
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        boolean sms = checkSelfPermission(Manifest.permission.RECEIVE_SMS)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean overlay = Settings.canDrawOverlays(this);
        boolean acc = isAccessibilityEnabled(this);
        boolean notif = notificationAccessGranted(this);

        setRowState(b.rowSms, sms, false);
        setRowState(b.rowOverlay, overlay, false);
        setRowState(b.rowAccessibility, acc, true);   // stays tappable so it can be turned off again
        setRowState(b.rowNotif, notif, false);

        int on = (sms ? 1 : 0) + (overlay ? 1 : 0) + (acc ? 1 : 0) + (notif ? 1 : 0);
        b.tvProgress.setText(on == 4 ? "You're fully protected" : on + " of 4 turned on");
        b.tvProgressHint.setText(on == 4 ? "All set" : "Takes about a minute");
        b.progress.setProgressCompat(on, true);
    }

    // ---------------------------------------------------------------- rows

    private void setupRow(ItemPermissionRowBinding row, @DrawableRes int icon, String title, String subtitle,
                          Runnable open) {
        row.icon.setImageResource(icon);
        row.title.setText(title);
        row.subtitle.setText(subtitle);
        row.getRoot().setOnClickListener(v -> open.run());
        row.action.setOnClickListener(v -> open.run());
    }

    private void setRowState(ItemPermissionRowBinding row, boolean on, boolean tappableWhenOn) {
        int accent = getColor(R.color.cyber_emerald);
        if (on) {
            row.action.setText("On  ✓");
            row.action.setBackgroundTintList(ColorStateList.valueOf(getColor(R.color.nav_neon_soft)));
            row.action.setTextColor(accent);
        } else {
            row.action.setText("Turn on");
            row.action.setBackgroundTintList(ColorStateList.valueOf(accent));
            row.action.setTextColor(getColor(R.color.on_accent));
        }
        boolean tappable = !on || tappableWhenOn;
        row.getRoot().setClickable(tappable);
        row.action.setClickable(tappable);
    }

    private static void setupSetting(ItemSettingRowBinding row, String title, String subtitle, boolean checked) {
        row.title.setText(title);
        row.subtitle.setText(subtitle);
        row.toggle.setChecked(checked);
        row.getRoot().setOnClickListener(v -> { if (row.toggle.isEnabled()) row.toggle.toggle(); });
    }

    private static void setSettingEnabled(ItemSettingRowBinding row, boolean enabled) {
        row.toggle.setEnabled(enabled);
        row.getRoot().setAlpha(enabled ? 1f : 0.45f);
    }

    // ---------------------------------------------------------------- permission checks

    private static boolean notificationAccessGranted(Context ctx) {
        String flat = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(flat)) return false;
        String pkg = ctx.getPackageName();
        for (String s : flat.split(":")) {
            if (s != null && s.startsWith(pkg + "/")) return true;
        }
        return false;
    }

    public static boolean isAccessibilityEnabled(Context ctx) {
        AccessibilityManager am = (AccessibilityManager) ctx.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (am == null || !am.isEnabled()) return false;
        String flat = Settings.Secure.getString(ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(flat)) return false;
        String target = ctx.getPackageName() + "/" + FraudAccessibilityService.class.getName();
        for (String s : flat.split(":")) {
            if (s.equalsIgnoreCase(target)) return true;
        }
        return false;
    }
}
