package com.cybershield.app.ui;

import android.animation.TimeAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.View;

/**
 * Native port of the "SplitText" web effect: each character fades in and rises from below, staggered
 * left to right. The intro loops (hold → soft exit → intro again) until {@link #finishOnHold} is called,
 * at which point it stops the next time the whole word is fully visible.
 */
public class SplitTextView extends View {

    private static final long STAGGER_MS = 50;
    private static final long CHAR_MS = 1250;
    private static final long HOLD_MS = 1000;
    private static final long OUT_STAGGER_MS = 30;
    private static final long OUT_MS = 380;
    private static final long GAP_MS = 220;

    private String text = "";
    private int splitAt = Integer.MAX_VALUE;
    private int colorA = 0xFF111413, colorB = 0xFFFF6800;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float[] charX = new float[0];
    private float riseDistance;
    private float exitDistance;

    private final TimeAnimator ticker = new TimeAnimator();
    private long cycleStart = -1;
    private long elapsedInCycle;
    private Runnable onHold;
    private boolean stopped;

    public SplitTextView(Context c, AttributeSet a) {
        super(c, a);
        float d = getResources().getDisplayMetrics().density;
        riseDistance = 28 * d;
        exitDistance = 12 * d;
        paint.setTextSize(44 * getResources().getDisplayMetrics().scaledDensity);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        paint.setLetterSpacing(-0.01f);
        ticker.setTimeListener((anim, total, delta) -> {
            if (cycleStart < 0) cycleStart = total;
            long prev = elapsedInCycle;
            elapsedInCycle = total - cycleStart;
            if (elapsedInCycle >= cycleLength()) {
                cycleStart = total;
                elapsedInCycle = 0;
                prev = 0;
            }
            // only stop as the intro completes, never by snapping out of the exit
            if (onHold != null && prev < introEnd() && elapsedInCycle >= introEnd()) {
                elapsedInCycle = introEnd();
                stopped = true;
                ticker.cancel();
                Runnable r = onHold;
                onHold = null;
                r.run();
            }
            invalidate();
        });
    }

    /** Characters before {@code splitAt} use colour A, the rest colour B (two-tone wordmark). */
    public void setText(String text, int splitAt, int colorA, int colorB) {
        this.text = text;
        this.splitAt = splitAt;
        this.colorA = colorA;
        this.colorB = colorB;
        requestLayout();
        invalidate();
    }

    public void start() {
        stopped = false;
        cycleStart = -1;
        elapsedInCycle = 0;
        if (!ticker.isStarted()) ticker.start();
    }

    /** Stop once the word is fully shown (now, if it already is), then run {@code r}. */
    public void finishOnHold(Runnable r) {
        if (stopped) { r.run(); return; }
        if (elapsedInCycle >= introEnd() && elapsedInCycle < introEnd() + HOLD_MS) {
            elapsedInCycle = introEnd();
            stopped = true;
            ticker.cancel();
            invalidate();
            r.run();
            return;
        }
        onHold = r;
    }

    @Override protected void onDetachedFromWindow() {
        ticker.cancel();
        super.onDetachedFromWindow();
    }

    private long introEnd() { return STAGGER_MS * Math.max(0, text.length() - 1) + CHAR_MS; }

    private long outroEnd() { return introEnd() + HOLD_MS + OUT_STAGGER_MS * Math.max(0, text.length() - 1) + OUT_MS; }

    private long cycleLength() { return outroEnd() + GAP_MS; }

    @Override protected void onMeasure(int wSpec, int hSpec) {
        charX = new float[text.length()];
        float x = 0;
        for (int i = 0; i < text.length(); i++) {
            charX[i] = x;
            x += paint.measureText(text, i, i + 1);
        }
        Paint.FontMetrics fm = paint.getFontMetrics();
        int w = (int) Math.ceil(x) + getPaddingLeft() + getPaddingRight();
        int h = (int) Math.ceil(fm.descent - fm.ascent + riseDistance) + getPaddingTop() + getPaddingBottom();
        setMeasuredDimension(resolveSize(w, wSpec), resolveSize(h, hSpec));
    }

    @Override protected void onDraw(Canvas canvas) {
        Paint.FontMetrics fm = paint.getFontMetrics();
        float textW = charX.length == 0 ? 0 : charX[charX.length - 1] + paint.measureText(text, text.length() - 1, text.length());
        float left = (getWidth() - textW) / 2f;
        float baseline = getPaddingTop() + riseDistance / 2f - fm.ascent;
        long t = elapsedInCycle;
        long holdEnd = introEnd() + HOLD_MS;

        for (int i = 0; i < text.length(); i++) {
            float alpha, dy;
            long inStart = STAGGER_MS * i;
            if (t < holdEnd) {
                float p = clamp01((t - inStart) / (float) CHAR_MS);
                float e = 1f - (1f - p) * (1f - p) * (1f - p);   // power3.out
                alpha = e;
                dy = (1f - e) * riseDistance;
            } else {
                float p = clamp01((t - holdEnd - OUT_STAGGER_MS * i) / (float) OUT_MS);
                float e = p * p;                                   // ease-in exit
                alpha = 1f - e;
                dy = -e * exitDistance;
            }
            if (alpha <= 0.001f) continue;
            int base = i < splitAt ? colorA : colorB;
            paint.setColor(base);
            paint.setAlpha(Math.round(alpha * ((base >>> 24) & 0xFF)));
            canvas.drawText(text, i, i + 1, left + charX[i], baseline + dy, paint);
        }
    }

    private static float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
}
