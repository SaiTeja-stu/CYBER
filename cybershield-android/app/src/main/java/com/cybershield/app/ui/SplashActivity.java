package com.cybershield.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.cybershield.app.CyberShieldApp;
import com.cybershield.app.R;

import java.util.Locale;
import java.util.concurrent.Executors;

/**
 * The single launch / loading screen. While the "SecureMe" wordmark animates in (and loops if loading
 * runs long) and the lattice loader spins, it warms up the on-device detection engine and silently
 * refreshes the access token. Once both are done it shows a check mark, waits for the wordmark to be
 * fully visible, and hands off to {@link MainActivity}, which routes to the dashboard or sign-in.
 */
public class SplashActivity extends AppCompatActivity {

    private static final long MIN_SHOW_MS = 1100L;
    private static final long MAX_SHOW_MS = 8000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private long startedAt;
    private volatile boolean warmDone = false;
    private boolean finishing = false;
    private boolean handedOff = false;

    private SplitTextView wordmark;
    private LatticeLoaderView lattice;
    private TextView label, timer;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            timer.setText(fmt(SystemClock.elapsedRealtime() - startedAt));
            main.postDelayed(this, 100);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);
        startedAt = SystemClock.elapsedRealtime();

        View logo = findViewById(R.id.logo);
        wordmark = findViewById(R.id.wordmark);
        lattice = findViewById(R.id.lattice);
        label = findViewById(R.id.loaderLabel);
        timer = findViewById(R.id.loaderTimer);

        logo.setAlpha(0f);
        logo.setScaleX(0.9f);
        logo.setScaleY(0.9f);
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(520)
                .setInterpolator(new DecelerateInterpolator(1.6f)).start();

        wordmark.setText("SecureMe", 6, getColor(R.color.splash_ink), getColor(R.color.splash_accent));
        wordmark.start();

        lattice.setColors(getColor(R.color.splash_accent), getColor(R.color.splash_done));
        lattice.start();
        main.post(tick);

        warmUp();
        main.postDelayed(this::tryFinish, MIN_SHOW_MS);
        main.postDelayed(this::handOff, MAX_SHOW_MS);   // hard ceiling so a slow network never traps the user
    }

    /** Load the heavy stuff off the main thread. */
    private void warmUp() {
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                CyberShieldApp app = CyberShieldApp.get();
                app.analyzer();                       // forces ML model + policy load
                if (app.api().store().hasRefreshToken() && app.api().store().token() == null) {
                    main.post(() -> swapLabel("Signing you in"));
                    app.api().tryRefresh();            // silent token refresh
                }
            } catch (Throwable ignored) {
                // never block the app on warm-up failure
            } finally {
                warmDone = true;
                main.post(this::tryFinish);
            }
        });
    }

    private void tryFinish() {
        if (finishing || !warmDone || SystemClock.elapsedRealtime() - startedAt < MIN_SHOW_MS) return;
        finishing = true;
        main.removeCallbacks(tick);
        timer.setText(fmt(SystemClock.elapsedRealtime() - startedAt));
        swapLabel("Ready in");
        lattice.done();
        wordmark.finishOnHold(() -> main.postDelayed(this::handOff, 380));
    }

    private void swapLabel(String text) {
        label.animate().alpha(0f).setDuration(120).withEndAction(() -> {
            label.setText(text);
            label.animate().alpha(1f).setDuration(160).start();
        }).start();
    }

    private void handOff() {
        if (handedOff || isFinishing()) return;
        handedOff = true;
        main.removeCallbacksAndMessages(null);
        startActivity(new Intent(this, MainActivity.class));
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        finish();
    }

    private static String fmt(long ms) {
        long ds = ms / 100;
        return ds < 600
                ? String.format(Locale.US, "%.1fs", ds / 10f)
                : String.format(Locale.US, "%dm %.1fs", ds / 600, (ds % 600) / 10f);
    }

    @Override
    public void onBackPressed() {
        // ignore during the loading screen
    }
}
