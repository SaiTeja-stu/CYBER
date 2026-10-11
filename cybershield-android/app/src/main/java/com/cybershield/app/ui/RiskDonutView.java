package com.cybershield.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.animation.ValueAnimator;
import android.util.AttributeSet;
import android.view.animation.DecelerateInterpolator;
import android.view.View;

/**
 * A minimal donut gauge for the verdict screen. Shows the risk score as a
 * coloured arc with the number in the middle. Tap it to cycle Risk →
 * Confidence → Warning-signs (the same data, three views).
 */
public class RiskDonutView extends View {

    private int score = 0, confidence = 0, signs = 0;
    private String level = "SAFE";
    private int mode = 0;   // 0 risk, 1 confidence, 2 signs
    private float progress = 1f;   // 0 -> 1 sweep-in each time a new result arrives

    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();

    public RiskDonutView(Context c, AttributeSet a) {
        super(c, a);
        float d = getResources().getDisplayMetrics().density;
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(12 * d);
        track.setColor(c.getColor(com.cybershield.app.R.color.donut_track));
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(12 * d);
        arc.setStrokeCap(Paint.Cap.ROUND);
        big.setColor(c.getColor(com.cybershield.app.R.color.text));
        big.setTextAlign(Paint.Align.CENTER);
        big.setFakeBoldText(true);
        big.setTextSize(34 * d);
        small.setColor(c.getColor(com.cybershield.app.R.color.muted));
        small.setTextAlign(Paint.Align.CENTER);
        small.setTextSize(12 * d);
        setOnClickListener(v -> { mode = (mode + 1) % 3; invalidate(); });
    }

    public void set(int score, String level, int confidence, int signs) {
        this.score = clamp(score);
        this.level = level == null ? "SAFE" : level;
        this.confidence = clamp(confidence);
        this.signs = Math.max(0, signs);
        ValueAnimator va = ValueAnimator.ofFloat(0f, 1f);
        va.setDuration(900);
        va.setInterpolator(new DecelerateInterpolator(1.6f));
        va.addUpdateListener(an -> { progress = (float) an.getAnimatedValue(); invalidate(); });
        va.start();
    }

    private static int clamp(int v) { return Math.max(0, Math.min(100, v)); }

    private int levelColor() {
        switch (level) {
            case "MALICIOUS": return Color.parseColor("#E5484D");
            case "HIGH_RISK": return Color.parseColor("#F08A3C");
            case "SUSPICIOUS": return Color.parseColor("#F5C451");
            case "SAFE": return Color.parseColor("#1BD671");
            default: return Color.parseColor("#9F9F9F");
        }
    }

    @Override
    protected void onMeasure(int w, int h) {
        int size = (int) (140 * getResources().getDisplayMetrics().density);
        setMeasuredDimension(resolveSize(size, w), resolveSize(size, h));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float pad = track.getStrokeWidth() / 2f + 2;
        box.set(pad, pad, getWidth() - pad, getHeight() - pad);
        canvas.drawArc(box, 0, 360, false, track);

        float frac;
        String centre, caption;
        int col;
        if (mode == 0) {
            frac = score / 100f; centre = String.valueOf(score); caption = "RISK / 100"; col = levelColor();
        } else if (mode == 1) {
            frac = confidence / 100f; centre = confidence + "%"; caption = "CONFIDENCE"; col = Color.parseColor("#1BD671");
        } else {
            frac = signs == 0 ? 0 : Math.min(1f, signs / 6f);
            centre = String.valueOf(signs); caption = signs == 1 ? "WARNING SIGN" : "WARNING SIGNS";
            col = signs == 0 ? Color.parseColor("#1BD671") : Color.parseColor("#F08A3C");
        }
        arc.setColor(col);
        frac *= progress;
        if (mode == 0) centre = String.valueOf(Math.round(score * progress));
        if (frac > 0) canvas.drawArc(box, -90, 360 * frac, false, arc);

        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        big.setColor(col);
        canvas.drawText(centre, cx, cy + big.getTextSize() / 3f, big);
        canvas.drawText(caption, cx, cy + big.getTextSize(), small);
    }
}
