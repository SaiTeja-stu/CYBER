package com.cybershield.app.ui;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewAnimationUtils;
import android.view.ViewGroup;
import android.view.Window;
import android.view.animation.PathInterpolator;
import android.widget.ImageView;

/**
 * Light/dark switch as one continuous motion: the old frame is snapshotted, kept on screen while the
 * activity recreates in the new theme, and the new theme is revealed in a circle from the toggle.
 */
final class ThemeTransition {

    private static final long MAX_SNAPSHOT_AGE_MS = 2000;

    private static Bitmap snapshot;
    private static long snapshotAt;
    private static int originX, originY;

    private ThemeTransition() {}

    /** Snapshot the current window, then run {@code apply} (which should trigger the recreate). */
    static void capture(Activity a, View origin, Runnable apply) {
        Window w = a.getWindow();
        View decor = w.getDecorView();
        if (decor.getWidth() == 0 || decor.getHeight() == 0) { apply.run(); return; }

        int[] loc = new int[2];
        origin.getLocationInWindow(loc);
        originX = loc[0] + origin.getWidth() / 2;
        originY = loc[1] + origin.getHeight() / 2;

        Bitmap bmp;
        try {
            bmp = Bitmap.createBitmap(decor.getWidth(), decor.getHeight(), Bitmap.Config.ARGB_8888);
        } catch (OutOfMemoryError e) {
            apply.run();
            return;
        }
        PixelCopy.request(w, bmp, result -> {
            if (result == PixelCopy.SUCCESS) {
                snapshot = bmp;
                snapshotAt = SystemClock.uptimeMillis();
            } else {
                bmp.recycle();
            }
            apply.run();
        }, new Handler(Looper.getMainLooper()));
    }

    /**
     * Call right after setContentView in the recreated activity. Places the old frame behind the new
     * content and hides the content until {@link Reveal#start()}. Returns null if no switch is pending.
     */
    static Reveal cover(Activity a, View root) {
        Bitmap bmp = snapshot;
        snapshot = null;
        if (bmp == null) return null;
        if (SystemClock.uptimeMillis() - snapshotAt > MAX_SNAPSHOT_AGE_MS) { bmp.recycle(); return null; }

        ViewGroup decor = (ViewGroup) a.getWindow().getDecorView();
        ImageView old = new ImageView(a);
        old.setScaleType(ImageView.ScaleType.MATRIX);
        old.setImageBitmap(bmp);
        decor.addView(old, 0, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setVisibility(View.INVISIBLE);
        return new Reveal(decor, old, bmp, root, originX, originY);
    }

    static final class Reveal {
        private final ViewGroup decor;
        private final ImageView old;
        private final Bitmap bmp;
        private final View root;
        private final int ox, oy;
        private boolean started;

        private Reveal(ViewGroup decor, ImageView old, Bitmap bmp, View root, int ox, int oy) {
            this.decor = decor; this.old = old; this.bmp = bmp; this.root = root; this.ox = ox; this.oy = oy;
        }

        void start() {
            if (started) return;
            started = true;
            root.setVisibility(View.VISIBLE);
            if (!root.isAttachedToWindow() || root.getWidth() == 0) { finish(); return; }

            int[] loc = new int[2];
            root.getLocationInWindow(loc);
            int x = ox - loc[0], y = oy - loc[1];
            float r = (float) Math.hypot(Math.max(x, root.getWidth() - x), Math.max(y, root.getHeight() - y));
            Animator an = ViewAnimationUtils.createCircularReveal(root, x, y, 0f, r);
            an.setDuration(560);
            an.setInterpolator(new PathInterpolator(0.4f, 0f, 0.2f, 1f));
            an.addListener(new AnimatorListenerAdapter() {
                @Override public void onAnimationEnd(Animator animation) { finish(); }
            });
            an.start();
        }

        private void finish() {
            decor.removeView(old);
            old.setImageDrawable(null);
            bmp.recycle();
        }
    }
}
