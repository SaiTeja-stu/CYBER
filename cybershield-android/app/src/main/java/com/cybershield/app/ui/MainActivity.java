package com.cybershield.app.ui;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.cybershield.app.CyberShieldApp;
import com.cybershield.app.R;
import com.cybershield.app.data.AuthRepository;
import com.cybershield.app.data.ScanEntity;
import com.cybershield.app.data.SecureStore;
import com.cybershield.app.databinding.ActivityMainBinding;

import java.util.List;
import java.util.concurrent.Executors;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/** In-app dashboard: stats, quick checks, recent activity, education, protection. */
public class MainActivity extends AppCompatActivity {

    private ActivityMainBinding b;
    private SecureStore store;
    private RecentAdapter recentAdapter;
    private EduAdapter eduAdapter;
    private boolean unlocked = false;
    private boolean isAdmin = false;
    private ThemeTransition.Reveal themeReveal;

    private final Handler main = new Handler(Looper.getMainLooper());

    private final androidx.activity.result.ActivityResultLauncher<String> cameraPerm =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) startActivity(new Intent(this, ScanQrActivity.class));
            });
    private final androidx.activity.result.ActivityResultLauncher<String> notifPerm =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), g -> {});

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = CyberShieldApp.get().api().store();
        // survive the recreate triggered by the theme toggle without re-prompting for biometrics
        if (savedInstanceState != null) unlocked = savedInstanceState.getBoolean("unlocked", false);
        b = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());

        themeReveal = ThemeTransition.cover(this, b.getRoot());
        if (themeReveal != null) main.postDelayed(this::startThemeReveal, 450);   // fallback if stats are slow

        b.swTheme.setChecked(CyberShieldApp.get().isDarkMode());
        b.swTheme.setOnCheckedChangeListener((v, dark) -> {
            v.setEnabled(false);
            ThemeTransition.capture(this, v, () -> CyberShieldApp.get().setDarkMode(dark));
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS);
        }

        recentAdapter = new RecentAdapter();
        b.recent.setLayoutManager(new LinearLayoutManager(this));
        b.recent.setAdapter(recentAdapter);

        eduAdapter = new EduAdapter(m -> startActivity(
                EduDetailActivity.intent(this, m, store.eduLang())));
        b.education.setLayoutManager(new LinearLayoutManager(this));
        b.education.setAdapter(eduAdapter);

        b.btnScanQr.setOnClickListener(v -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                startActivity(new Intent(this, ScanQrActivity.class));
            } else {
                cameraPerm.launch(Manifest.permission.CAMERA);
            }
        });

        b.btnAnalyze.setOnClickListener(v -> {
            String t = b.editText.getText() == null ? "" : b.editText.getText().toString().trim();
            if (t.isEmpty()) return;
            String type = t.toLowerCase().startsWith("upi://") ? "QR"
                    : (t.startsWith("http://") || t.startsWith("https://")) ? "URL" : "SMS";
            VerdictActivity.start(this, type, t, "dashboard");
            b.editText.setText("");
        });

        b.btnForensics.setOnClickListener(v -> startActivity(new Intent(this, ForensicsActivity.class)));

        b.btnOverview.setOnClickListener(v -> startActivity(new Intent(this, OverviewActivity.class)));
        b.btnAllHistory.setOnClickListener(v -> startActivity(new Intent(this, HistoryActivity.class)));
        b.btnProtection.setOnClickListener(v -> startActivity(new Intent(this, OnboardingActivity.class)));

        b.btnSignOut.setOnClickListener(v -> signOut());
        b.btnLockSignOut.setOnClickListener(v -> signOut());
        b.btnUnlock.setOnClickListener(v -> promptUnlock());

        setupBottomNav();

        loadEducation();
    }

    @Override
    protected void onSaveInstanceState(@androidx.annotation.NonNull Bundle out) {
        super.onSaveInstanceState(out);
        out.putBoolean("unlocked", unlocked);
    }

    @Override
    protected void onResume() {
        super.onResume();
        b.customBottomBar.travelTo(0);   // coming back from Vault/Reports/Academy: slide home to Shield
        requestBatteryExemption();

        // Any session at all (access OR long-lived refresh token) is enough to proceed;
        // an expired access token is silently refreshed on the first API call.
        if (!store.hasSession()) {
            startActivity(new Intent(this, AuthActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
            finish();
            return;
        }

        if (store.biometricLock() && BiometricGate.available(this) && !unlocked) {
            showLock("Unlock with your fingerprint or screen lock.");
            promptUnlock();
        } else {
            unlocked = true;
            hideLock();
            ensureFreshSession();
            refreshRole();
        }

        refreshStats();
    }

    private void setupBottomNav() {
        b.customBottomBar.setup(
                new View[]{b.tabShield, b.tabVault, b.tabReports, b.tabAcademy},
                new android.widget.ImageView[]{b.iconShield, b.iconVault, b.iconReports, b.iconAcademy},
                new android.widget.TextView[]{b.textShield, b.textVault, b.textReports, b.textAcademy},
                getColor(R.color.nav_neon), getColor(R.color.nav_neon_idle),
                getColor(R.color.nav_neon_soft), getColor(R.color.nav_neon_edge),
                this::openTab);
        b.btnCenterScan.setOnClickListener(v -> startActivity(new Intent(this, AnalyzeConsoleActivity.class)));
    }

    private void openTab(int index) {
        switch (index) {
            case 0: b.scroll.smoothScrollTo(0, 0); break;
            case 1: startActivity(new Intent(this, QueueActivity.class).putExtra("admin", isAdmin)); break;
            case 2: startActivity(new Intent(this, isAdmin ? ReportsActivity.class : HistoryActivity.class)); break;
            case 3: startActivity(new Intent(this, EducationListActivity.class)); break;
        }
    }

    /** Ask the backend whether this account is an admin; show overview button if so. */
    private void refreshRole() {
        if (!store.hasAccount()) {           // offline / guest — no admin features
            isAdmin = false;
            b.btnOverview.setVisibility(View.GONE);
            return;
        }
        CyberShieldApp.get().api().api().me().enqueue(new Callback<>() {
            @Override public void onResponse(@androidx.annotation.NonNull Call<java.util.Map<String, Object>> call,
                                             @androidx.annotation.NonNull Response<java.util.Map<String, Object>> resp) {
                Object admin = resp.isSuccessful() && resp.body() != null ? resp.body().get("admin") : null;
                isAdmin = Boolean.TRUE.equals(admin);
                b.btnOverview.setVisibility(isAdmin ? View.VISIBLE : View.GONE);
            }
            @Override public void onFailure(@androidx.annotation.NonNull Call<java.util.Map<String, Object>> call,
                                            @androidx.annotation.NonNull Throwable t) { /* keep last known role */ }
        });
    }

    private void promptUnlock() {
        BiometricGate.prompt(this, new BiometricGate.Result() {
            @Override public void onUnlocked() {
                unlocked = true;
                hideLock();
                ensureFreshSession();   // mint a fresh access token for this session
                refreshRole();
                refreshStats();
            }
            @Override public void onFailedOrCancelled() {
                showLock("Couldn't verify. Try again, or sign out.");
            }
        });
    }

    /** If the short-lived access token is missing/expired, get a new one from the refresh token. */
    private void ensureFreshSession() {
        if (store.token() != null || !store.hasAccount()) { loadEducation(); return; }
        Executors.newSingleThreadExecutor().execute(() -> {
            String fresh = CyberShieldApp.get().api().tryRefresh();
            main.post(() -> {
                if (fresh == null && !store.hasSession()) {
                    startActivity(new Intent(this, AuthActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
                    finish();
                } else {
                    loadEducation();
                }
            });
        });
    }

    private void showLock(String msg) {
        b.lockMsg.setText(msg);
        b.lockOverlay.setVisibility(View.VISIBLE);
    }

    private void hideLock() {
        b.lockOverlay.setVisibility(View.GONE);
    }

    private void signOut() {
        new AuthRepository().logout();
        unlocked = false;
        startActivity(new Intent(this, AuthActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
        finish();
    }

    private void refreshStats() {
        Executors.newSingleThreadExecutor().execute(() -> {
            List<ScanEntity> rows;
            try {
                rows = CyberShieldApp.get().db().scanDao().recent();
            } catch (Exception e) {
                rows = java.util.Collections.emptyList();
            }
            int total = rows.size();
            int threats = 0;
            for (ScanEntity s : rows) {
                if ("MALICIOUS".equals(s.riskLevel) || "HIGH_RISK".equals(s.riskLevel)) threats++;
            }
            List<ScanEntity> recent = rows.subList(0, Math.min(6, rows.size()));
            final int ft = total, fth = threats;
            main.post(() -> {
                if (themeReveal != null) {
                    // mid theme switch: show final values and let the reveal carry the motion
                    b.statChecks.setText(String.valueOf(ft));
                    b.statThreats.setText(String.valueOf(fth));
                } else {
                    Motion.countUp(b.statChecks, ft);
                    Motion.countUp(b.statThreats, fth);
                }
                recentAdapter.set(recent);
                b.recentEmpty.setVisibility(recent.isEmpty() ? View.VISIBLE : View.GONE);
                // reveal once the list has laid out, so nothing shifts during the animation
                if (themeReveal != null) b.getRoot().post(this::startThemeReveal);
            });
        });
    }

    private void startThemeReveal() {
        if (themeReveal == null) return;
        themeReveal.start();
        themeReveal = null;
    }

    private void loadEducation() {
        eduAdapter.set(com.cybershield.app.data.EducationCatalog.bundled(this, store.eduLang()));   // offline-first
        if (!"en".equals(store.eduLang())) return;   // te/hi are bundled-only
        CyberShieldApp.get().api().api().educationModules().enqueue(new Callback<>() {
            @Override
            public void onResponse(@androidx.annotation.NonNull Call<List<EduAdapter.Module>> call,
                                   @androidx.annotation.NonNull Response<List<EduAdapter.Module>> resp) {
                if (resp.isSuccessful() && resp.body() != null && !resp.body().isEmpty()
                        && "en".equals(store.eduLang())) {
                    eduAdapter.set(resp.body());
                }
            }
            @Override
            public void onFailure(@androidx.annotation.NonNull Call<List<EduAdapter.Module>> call,
                                  @androidx.annotation.NonNull Throwable t) { /* bundled copy stays */ }
        });
    }

    /** Once: ask Android not to put Secure Me to sleep, so protection keeps running in the background. */
    private void requestBatteryExemption() {
        try {
            android.content.SharedPreferences sp = getSharedPreferences("shield_prefs", MODE_PRIVATE);
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            if (sp.getBoolean("asked_battery", false)) return;
            sp.edit().putBoolean("asked_battery", true).apply();
            startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    android.net.Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
        }
    }
}
