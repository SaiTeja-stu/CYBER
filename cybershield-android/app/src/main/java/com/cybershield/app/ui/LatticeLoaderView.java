package com.cybershield.app.ui;

import android.animation.TimeAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.PathInterpolator;

/**
 * Native port of the "LatticeLoader" web component, 3×3 "orbit" pattern: dots light up in a ring,
 * each on its own keyframe cycle, until {@link #done()} cross-fades the grid into a check mark.
 */
public class LatticeLoaderView extends View {

    // orbit, 3×3 — the unit is the dot's position in the ring; null is the hollow centre
    private static final Integer[] CELLS = {0, 1, 2, 7, null, 3, 6, 5, 4};
    private static final float LOOP = 8f, SCALE = 1.2f;
    private static final int[] DONE_MARK = {2, 3, 5, 7};

    private final float step = 90f * SCALE;
    private final long cycle = Math.round(LOOP * step);
    private final PathInterpolator easeInOut = new PathInterpolator(0.77f, 0f, 0.175f, 1f);
    private final PathInterpolator easeOut = new PathInterpolator(0.23f, 1f, 0.32f, 1f);

    private int color = 0xFFFF6800;
    private int doneColor = 0xFF22C55E;
    private final float idle = 0.15f, peak = 1f;
    private final float cell, gap;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final TimeAnimator ticker = new TimeAnimator();
    private long now;
    private float markT;   // 0 = running grid, 1 = check mark

    public LatticeLoaderView(Context c, AttributeSet a) {
        super(c, a);
        float d = getResources().getDisplayMetrics().density;
        cell = 8 * d;
        gap = 3 * d;
        ticker.setTimeListener((anim, total, delta) -> { now = total; invalidate(); });
    }

    public void setColors(int run, int done) { color = run; doneColor = done; invalidate(); }

    public void start() { if (!ticker.isStarted()) ticker.start(); }

    public void done() {
        ValueAnimator va = ValueAnimator.ofFloat(markT, 1f);
        va.setDuration(220);
        va.setInterpolator(easeOut);
        va.addUpdateListener(an -> { markT = (float) an.getAnimatedValue(); invalidate(); });
        va.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(android.animation.Animator animation) { ticker.cancel(); }
        });
        va.start();
    }

    @Override protected void onDetachedFromWindow() { ticker.cancel(); super.onDetachedFromWindow(); }

    @Override protected void onMeasure(int w, int h) {
        int size = Math.round(cell * 3 + gap * 2);
        setMeasuredDimension(resolveSize(size + getPaddingLeft() + getPaddingRight(), w),
                resolveSize(size + getPaddingTop() + getPaddingBottom(), h));
    }

    /** CSS keyframes "lattice-on": idle → peak (0–18%), hold (18–42%), peak → idle (42–62%), idle. */
    private float opacityAt(long t, long delay) {
        if (t < delay) return idle;
        float p = ((t - delay) % cycle) / (float) cycle;
        if (p < 0.18f) return lerp(idle, peak, easeInOut.getInterpolation(p / 0.18f));
        if (p < 0.42f) return peak;
        if (p < 0.62f) return lerp(peak, idle, easeInOut.getInterpolation((p - 0.42f) / 0.20f));
        return idle;
    }

    @Override protected void onDraw(Canvas canvas) {
        float r = cell / 2f;
        float ox = getPaddingLeft(), oy = getPaddingTop();
        float runAlpha = 1f - markT;
        float markScale = 0.9f + 0.1f * markT;
        float cx0 = ox + (cell * 3 + gap * 2) / 2f, cy0 = oy + (cell * 3 + gap * 2) / 2f;

        for (int i = 0; i < 9; i++) {
            float cx = ox + (i % 3) * (cell + gap) + r;
            float cy = oy + (i / 3) * (cell + gap) + r;

            if (runAlpha > 0f) {
                Integer unit = CELLS[i];
                float o = unit == null ? idle * 0.47f : opacityAt(now, Math.round(unit * step));
                paint.setColor(color);
                paint.setAlpha(Math.round(255 * o * runAlpha));
                canvas.drawCircle(cx, cy, r, paint);
            }
            if (markT > 0f) {
                boolean on = contains(DONE_MARK, i);
                paint.setColor(on ? doneColor : color);
                paint.setAlpha(Math.round(255 * (on ? peak : idle) * markT));
                float mx = cx0 + (cx - cx0) * markScale, my = cy0 + (cy - cy0) * markScale;
                canvas.drawCircle(mx, my, r * markScale, paint);
            }
        }
    }

    private static boolean contains(int[] a, int v) { for (int x : a) if (x == v) return true; return false; }

    private static float lerp(float a, float b, float t) { return a + (b - a) * t; }
}
