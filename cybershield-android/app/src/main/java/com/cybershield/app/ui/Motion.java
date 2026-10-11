package com.cybershield.app.ui;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.Application;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.widget.NestedScrollView;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.WeakHashMap;

/**
 * Secure Me motion language: content "blur-fades" in from below, one block after another, and the
 * floating dock rises last. Installed once for the whole app, so no screen or layout has to change.
 */
public final class Motion {

    private static final Set<Activity> SEEN = Collections.newSetFromMap(new WeakHashMap<>());
    private static final int MAX_STAGGER = 14;
    private static final int MAX_BLURRED = 8;

    private Motion() {}

    public static void install(Application app) {
        app.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityStarted(Activity a) {
                if (a instanceof SplashActivity || a instanceof ProceedGateActivity) return;
                if (SEEN.add(a)) {
                    try { enter(a); } catch (Throwable ignored) { /* motion must never break a screen */ }
                }
            }
            @Override public void onActivityCreated(Activity a, Bundle b) {
                // recreated (theme switch, rotation): content is already familiar, don't replay the entrance
                if (b != null) SEEN.add(a);
            }
            @Override public void onActivityResumed(Activity a) { }
            @Override public void onActivityPaused(Activity a) { }
            @Override public void onActivityStopped(Activity a) { }
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) { }
            @Override public void onActivityDestroyed(Activity a) { SEEN.remove(a); }
        });
    }

    private static boolean reduced(Activity a) {
        try {
            return Settings.Global.getFloat(a.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
        } catch (Throwable t) {
            return false;
        }
    }

    private static boolean isScroll(View v) {
        return v instanceof ScrollView || v instanceof NestedScrollView;
    }

    private static boolean dockLike(View v) {
        try {
            String n = v.getResources().getResourceEntryName(v.getId()).toLowerCase();
            return n.contains("dock") || n.contains("bottombar");
        } catch (Throwable t) {
            return false;
        }
    }

    private static void addChildren(ViewGroup g, List<View> out) {
        for (int i = 0; i < g.getChildCount(); i++) {
            View c = g.getChildAt(i);
            if (c.getVisibility() == View.VISIBLE && c.getAlpha() > 0.99f) out.add(c);
        }
    }

    public static void enter(Activity a) {
        ViewGroup content = a.findViewById(android.R.id.content);
        if (content == null || content.getChildCount() == 0 || reduced(a)) return;
        View root = content.getChildAt(0);

        List<View> blocks = new ArrayList<>();
        List<View> docks = new ArrayList<>();
        if (isScroll(root)) {
            View c = ((ViewGroup) root).getChildAt(0);
            if (c instanceof ViewGroup) addChildren((ViewGroup) c, blocks); else blocks.add(root);
        } else if (root instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) root;
            for (int i = 0; i < g.getChildCount(); i++) {
                View c = g.getChildAt(i);
                if (c.getVisibility() != View.VISIBLE) continue;
                if (dockLike(c)) docks.add(c);
                else if (isScroll(c)) {
                    View inner = ((ViewGroup) c).getChildAt(0);
                    if (inner instanceof ViewGroup) addChildren((ViewGroup) inner, blocks); else blocks.add(c);
                } else if (c.getAlpha() > 0.99f) blocks.add(c);
            }
        }

        float dp = a.getResources().getDisplayMetrics().density;
        int n = Math.min(blocks.size(), MAX_STAGGER);
        for (int i = 0; i < n; i++) reveal(blocks.get(i), i, dp, i < MAX_BLURRED);
        for (int i = n; i < blocks.size(); i++) blocks.get(i).setAlpha(1f);   // long tails appear untouched
        for (View d : docks) rise(d, dp, 90 + 45 * n);
    }

    private static void reveal(View v, int index, float dp, boolean blur) {
        v.setAlpha(0f);
        v.setTranslationY(16 * dp);
        v.setScaleX(0.985f);
        v.setScaleY(0.985f);
        long delay = 70L + 55L * index;
        v.animate().alpha(1f).translationY(0f).scaleX(1f).scaleY(1f)
                .setStartDelay(delay).setDuration(460)
                .setInterpolator(new DecelerateInterpolator(1.7f))
                .withEndAction(() -> { v.setScaleX(1f); v.setScaleY(1f); }).start();
        if (blur && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ValueAnimator va = ValueAnimator.ofFloat(10f * dp, 0f);
            va.setStartDelay(delay);
            va.setDuration(460);
            va.setInterpolator(new DecelerateInterpolator(1.7f));
            va.addUpdateListener(an -> {
                float r = (float) an.getAnimatedValue();
                try {
                    v.setRenderEffect(r < 0.5f ? null : RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP));
                } catch (Throwable ignored) { }
            });
            va.start();
        }
    }

    private static void rise(View d, float dp, long delay) {
        d.setAlpha(0f);
        d.setTranslationY(70 * dp);
        d.animate().alpha(1f).translationY(0f).setStartDelay(delay).setDuration(520)
                .setInterpolator(new OvershootInterpolator(0.7f)).start();
    }

    /** Numbers count up from zero instead of just appearing. */
    public static void countUp(TextView tv, int target) {
        if (tv == null) return;
        if (target <= 0) { tv.setText(String.valueOf(target)); return; }
        ValueAnimator va = ValueAnimator.ofInt(0, target);
        va.setDuration(Math.min(900, 300 + target * 12L));
        va.setInterpolator(new DecelerateInterpolator(1.5f));
        va.addUpdateListener(an -> tv.setText(String.valueOf((int) an.getAnimatedValue())));
        va.start();
    }
}
