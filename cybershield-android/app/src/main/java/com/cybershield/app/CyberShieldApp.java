package com.cybershield.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.util.Log;

import androidx.appcompat.app.AppCompatDelegate;

import com.cybershield.app.data.AppDatabase;
import com.cybershield.app.net.ApiModule;
import com.cybershield.core.OnDeviceAnalyzer;

import java.io.PrintWriter;
import java.io.StringWriter;

/** Process-wide singletons: Retrofit API and the Room database. */
public class CyberShieldApp extends Application {

    public static final String CHANNEL_ALERTS = "cybershield.alerts";
    private static final String TAG = "CyberShield";

    private static CyberShieldApp instance;
    private AppDatabase db;
    private ApiModule api;
    private volatile OnDeviceAnalyzer analyzer;
    private volatile String lastCrash;

    private static final String PREFS = "shield_prefs";
    private static final String KEY_DARK = "dark_mode";

    public static CyberShieldApp get() {
        return instance;
    }

    public boolean isDarkMode() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_DARK, false);
    }

    public void setDarkMode(boolean dark) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_DARK, dark).apply();
        AppCompatDelegate.setDefaultNightMode(dark
                ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        AppCompatDelegate.setDefaultNightMode(isDarkMode()
                ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
        com.cybershield.app.ui.Motion.install(this);

        // Log any uncaught crash before the system handler kills us.
        Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            lastCrash = sw.toString();
            Log.e(TAG, "UNCAUGHT on " + t.getName() + "\n" + lastCrash);
            if (prev != null) prev.uncaughtException(t, e);
        });

        try {
            db = AppDatabase.create(this);
        } catch (Exception e) {
            Log.e(TAG, "Room init failed", e);
        }
        api = new ApiModule(this);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ALERTS, "Fraud alerts", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Warnings about suspicious payments, links and messages");
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    public AppDatabase db() {
        return db;
    }

    /** The on-device detection engine (built lazily on first use). */
    public OnDeviceAnalyzer analyzer() {
        if (analyzer == null) {
            synchronized (this) {
                if (analyzer == null) analyzer = new OnDeviceAnalyzer(this);
            }
        }
        return analyzer;
    }

    public ApiModule api() {
        return api;
    }

    public String lastCrash() {
        return lastCrash;
    }
}
