package com.cybershield.app.ui;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.PathInterpolator;

/**
 * Camera overlay for the QR scanner: dims everything outside a rounded scan window, draws accent
 * corner brackets and a glowing line sweeping through the window. {@link #lockOn} freezes the line
 * and turns the corners to the success colour when a code is found.
 */
public class ScannerOverlayView extends View {

    public interface WindowListener { void onWindow(RectF window); }

    private final Paint scrim = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint corners = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path hole = new Path();
    private final Path bracket = new Path();
    private final RectF window = new RectF();
    private final float radius, bracketLen, lineInset, glowHeight;

    private int accent = 0xFFFF6B00;
    private int success = 0xFF22C55E;
    private float sweep;          // 0..1 position of the scan line
    private boolean goingDown = true;
    private boolean locked;
    private ValueAnimator sweepAnim;
    private WindowListener windowListener;

    public ScannerOverlayView(Context c, AttributeSet a) {
        super(c, a);
        float d = getResources().getDisplayMetrics().density;
        radius = 26 * d;
        bracketLen = 30 * d;
        lineInset = 14 * d;
        glowHeight = 56 * d;
        scrim.setColor(0xB3000000);
        corners.setStyle(Paint.Style.STROKE);
        corners.setStrokeWidth(4.5f * d);
        corners.setStrokeCap(Paint.Cap.ROUND);
        corners.setStrokeJoin(Paint.Join.ROUND);
        line.setStrokeWidth(2.5f * d);
        line.setStrokeCap(Paint.Cap.ROUND);
        hole.setFillType(Path.FillType.EVEN_ODD);
        setColors(accent, success);
    }

    public void setColors(int accent, int success) {
        this.accent = accent;
        this.success = success;
        line.setColorFilter(new android.graphics.PorterDuffColorFilter(accent, android.graphics.PorterDuff.Mode.SRC_IN));
        invalidate();
    }

    public void setWindowListener(WindowListener l) {
        windowListener = l;
        if (!window.isEmpty()) l.onWindow(window);
    }

    public void lockOn() {
        locked = true;
        if (sweepAnim != null) sweepAnim.cancel();
        animate().scaleX(1.03f).scaleY(1.03f).setDuration(140)
                .withEndAction(() -> animate().scaleX(1f).scaleY(1f).setDuration(180).start()).start();
        invalidate();
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        sweepAnim = ValueAnimator.ofFloat(0f, 1f);
        sweepAnim.setDuration(1900);
        sweepAnim.setRepeatCount(ValueAnimator.INFINITE);
        sweepAnim.setRepeatMode(ValueAnimator.REVERSE);
        sweepAnim.setInterpolator(new PathInterpolator(0.45f, 0f, 0.55f, 1f));
        sweepAnim.addUpdateListener(an -> {
            float v = (float) an.getAnimatedValue();
            goingDown = v >= sweep;
            sweep = v;
            invalidate();
        });
        if (!locked) sweepAnim.start();
    }

    @Override protected void onDetachedFromWindow() {
        if (sweepAnim != null) sweepAnim.cancel();
        super.onDetachedFromWindow();
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        float size = Math.min(w * 0.72f, h * 0.42f);
        float cx = w / 2f, cy = h * 0.42f;
        window.set(cx - size / 2f, cy - size / 2f, cx + size / 2f, cy + size / 2f);
        hole.reset();
        hole.addRect(0, 0, w, h, Path.Direction.CW);
        hole.addRoundRect(window, radius, radius, Path.Direction.CW);
        line.setShader(new LinearGradient(window.left + lineInset, 0, window.right - lineInset, 0,
                new int[]{0x00FFFFFF, 0xFFFFFFFF, 0x00FFFFFF}, null, Shader.TileMode.CLAMP));
        if (windowListener != null) windowListener.onWindow(window);
    }

    @Override protected void onDraw(Canvas canvas) {
        canvas.drawPath(hole, scrim);

        if (!locked) {
            float y = window.top + lineInset + sweep * (window.height() - 2 * lineInset);
            // soft trail behind the line, on the side it came from
            float trailTop = goingDown ? y - glowHeight : y;
            float trailBottom = goingDown ? y : y + glowHeight;
            int strong = (accent & 0x00FFFFFF) | 0x59000000, clear = accent & 0x00FFFFFF;
            glow.setShader(new LinearGradient(0, trailTop, 0, trailBottom,
                    goingDown ? clear : strong, goingDown ? strong : clear, Shader.TileMode.CLAMP));
            canvas.save();
            canvas.clipRect(window.left + lineInset, Math.max(window.top, trailTop),
                    window.right - lineInset, Math.min(window.bottom, trailBottom));
            canvas.drawRect(window.left, trailTop, window.right, trailBottom, glow);
            canvas.restore();
            canvas.drawLine(window.left + lineInset, y, window.right - lineInset, y, line);
        }

        corners.setColor(locked ? success : accent);
        drawBrackets(canvas);
    }

    private void drawBrackets(Canvas canvas) {
        float l = window.left, t = window.top, r = window.right, b = window.bottom, rr = radius;
        float d = rr * 2;
        bracket.reset();
        // top-left
        bracket.moveTo(l, t + bracketLen + rr);
        bracket.lineTo(l, t + rr);
        bracket.arcTo(l, t, l + d, t + d, 180, 90, false);
        bracket.lineTo(l + rr + bracketLen, t);
        // top-right
        bracket.moveTo(r - rr - bracketLen, t);
        bracket.lineTo(r - rr, t);
        bracket.arcTo(r - d, t, r, t + d, 270, 90, false);
        bracket.lineTo(r, t + rr + bracketLen);
        // bottom-right
        bracket.moveTo(r, b - rr - bracketLen);
        bracket.lineTo(r, b - rr);
        bracket.arcTo(r - d, b - d, r, b, 0, 90, false);
        bracket.lineTo(r - rr - bracketLen, b);
        // bottom-left
        bracket.moveTo(l + rr + bracketLen, b);
        bracket.lineTo(l + rr, b);
        bracket.arcTo(l, b - d, l + d, b, 90, 90, false);
        bracket.lineTo(l, b - rr - bracketLen);
        canvas.drawPath(bracket, corners);
    }
}
