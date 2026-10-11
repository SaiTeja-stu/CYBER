package com.cybershield.app.ui;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.dynamicanimation.animation.DynamicAnimation;
import androidx.dynamicanimation.animation.FloatPropertyCompat;
import androidx.dynamicanimation.animation.SpringAnimation;
import androidx.dynamicanimation.animation.SpringForce;

/**
 * Bottom dock with a "rubber" selection pill, ported from the RubberSegment web component.
 * <ul>
 *   <li>Tap a tab: the pill stretches to span both tabs, then its leading edge springs onto the
 *       target while the trailing edge overshoots slightly (squash) and relaxes.</li>
 *   <li>Drag / swipe anywhere along the bar: the pill follows the finger, rubber-banding past the
 *       ends; on release it glides to the tab its momentum projects to (a flick always advances).</li>
 * </ul>
 * The pill is drawn by this view; tab icons/labels are tinted live by how much the pill covers them.
 */
public class RubberDock extends FrameLayout {

    public interface Listener { void onTabSelected(int index); }

    // motion constants, same as the web component
    private static final long DILATE_MS = 190, HANDOFF_MS = 150;
    private static final float RUBBER = 0.55f;
    private static final float GLIDE = 75f;
    private static final float UI_STIFFNESS = stiffness(0.30f), UI_DAMPING = 1f;
    private static final float MOMENTUM_STIFFNESS = stiffness(0.40f), MOMENTUM_DAMPING = 0.8f;
    private static final float RELAX_STIFFNESS = stiffness(0.16f), RELAX_DAMPING = 1f;
    private static final long TAP_OPEN_DELAY_MS = 300, DRAG_OPEN_DELAY_MS = 240;

    private final float deadzone, slop, flickVelocity, maxVelocity, squash, insetH, insetV, radius;
    private final float liftGrowV, liftGrowH, shadowRest, shadowLifted;
    private final PathInterpolator easeOut = new PathInterpolator(0.23f, 1f, 0.32f, 1f);
    private final ArgbEvaluator argb = new ArgbEvaluator();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sheen = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint highlight = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF pill = new RectF();
    private int glassTop, glassBottom, highlightColor, shadowColor;
    private float shaderTop = -1, shaderBottom = -1, shaderLift = -1;

    // 0 = resting, 1 = picked up (taller, brighter, deeper shadow)
    private float lift;
    private ValueAnimator liftAnim;

    private View[] tabs = new View[0];
    private ImageView[] icons = new ImageView[0];
    private TextView[] labels = new TextView[0];
    private int activeColor, idleColor;
    private Listener listener;

    private float[] slotL = new float[0], slotR = new float[0];
    private float edgeL, edgeR, velL, velR;
    private long lastL, lastR;
    private int committed = 0;
    private int gen = 0;
    private boolean laidOut;

    private SpringAnimation springL, springR;
    private ValueAnimator tween;
    private final Runnable[] pendingHandoff = new Runnable[1];
    private Runnable pendingOpen;

    // gesture
    private VelocityTracker tracker;
    private int pointerId;
    private float downX, dragOffset, dragWidth;
    private int downSlot;
    private boolean live;

    private static final FloatPropertyCompat<RubberDock> EDGE_L = new FloatPropertyCompat<RubberDock>("edgeL") {
        @Override public float getValue(RubberDock d) { return d.edgeL; }
        @Override public void setValue(RubberDock d, float v) { d.setEdges(v, d.edgeR); }
    };
    private static final FloatPropertyCompat<RubberDock> EDGE_R = new FloatPropertyCompat<RubberDock>("edgeR") {
        @Override public float getValue(RubberDock d) { return d.edgeR; }
        @Override public void setValue(RubberDock d, float v) { d.setEdges(d.edgeL, v); }
    };

    public RubberDock(Context c, AttributeSet a) {
        super(c, a);
        float d = getResources().getDisplayMetrics().density;
        deadzone = 4 * d;
        slop = 10 * d;
        flickVelocity = 110 * d;
        maxVelocity = 2000 * d;
        squash = 3 * d;
        insetH = 5 * d;
        insetV = 7 * d;
        radius = 21 * d;          // concentric with the dock's 28dp corners at a 7dp inset
        liftGrowV = 3 * d;
        liftGrowH = 2 * d;
        shadowRest = 5 * d;
        shadowLifted = 14 * d;
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1 * d);
        highlight.setStyle(Paint.Style.STROKE);
        highlight.setStrokeWidth(1.2f * d);
        setWillNotDraw(false);
        glassTop = c.getColor(com.cybershield.app.R.color.pill_glass_top);
        glassBottom = c.getColor(com.cybershield.app.R.color.pill_glass_bottom);
        highlightColor = c.getColor(com.cybershield.app.R.color.pill_highlight);
        shadowColor = c.getColor(com.cybershield.app.R.color.pill_shadow);
    }

    /** Wire the tabs (in visual order) and the colours used for the active / idle state. */
    public void setup(View[] tabs, ImageView[] icons, TextView[] labels,
                      int activeColor, int idleColor, int pillFill, int pillStroke, Listener listener) {
        this.tabs = tabs;
        this.icons = icons;
        this.labels = labels;
        this.activeColor = activeColor;
        this.idleColor = idleColor;
        this.listener = listener;
        fill.setColor(pillFill);
        stroke.setColor(pillStroke);
        for (int i = 0; i < tabs.length; i++) {
            final int idx = i;
            // accessibility services click tabs directly (touches never reach them, see intercept)
            tabs[i].setOnClickListener(v -> select(idx));
        }
        requestLayout();
    }

    /** Select a tab as if tapped: animate, then notify. */
    public void select(int i) {
        if (i < 0 || i >= slotL.length) return;
        int from = committed;
        committed = i;
        if (i != from) travel(i);
        scheduleOpen(i, i == from ? 0 : TAP_OPEN_DELAY_MS);
    }

    /** Move the pill without notifying (e.g. back on Shield when returning to this screen). */
    public void travelTo(int i) {
        if (i < 0 || i >= slotL.length || i == committed) return;
        cancelOpen();
        committed = i;
        if (laidOut) travel(i);
    }

    // ---------------------------------------------------------------- layout & drawing

    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        super.onLayout(changed, l, t, r, b);
        if (tabs.length == 0) return;
        slotL = new float[tabs.length];
        slotR = new float[tabs.length];
        for (int i = 0; i < tabs.length; i++) {
            float left = offsetInSelf(tabs[i]);
            slotL[i] = left + insetH;
            slotR[i] = left + tabs[i].getWidth() - insetH;
        }
        if (!laidOut || (!isAnimating() && tracker == null)) jumpTo(committed);
        laidOut = true;
    }

    private float offsetInSelf(View v) {
        float x = 0;
        View cur = v;
        while (cur != null && cur != this) {
            x += cur.getLeft();
            cur = cur.getParent() instanceof View ? (View) cur.getParent() : null;
        }
        return x;
    }

    /** Frosted-glass lens: accent tint, white sheen fading down, bright top rim, soft coloured shadow. */
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (edgeR - edgeL <= 0.5f) return;
        float gv = liftGrowV * lift, gh = liftGrowH * lift;
        float top = insetV - gv, bottom = getHeight() - insetV + gv;
        float r = radius + gv;
        pill.set(edgeL - gh, top, edgeR + gh, bottom);

        fill.setShadowLayer(shadowRest + (shadowLifted - shadowRest) * lift, 0, (1 + 2 * lift) * insetV / 7f,
                withAlpha(shadowColor, 0.55f + 0.45f * lift));
        canvas.drawRoundRect(pill, r, r, fill);

        if (top != shaderTop || bottom != shaderBottom || lift != shaderLift) {
            shaderTop = top; shaderBottom = bottom; shaderLift = lift;
            sheen.setShader(new android.graphics.LinearGradient(0, top, 0, bottom,
                    withAlpha(glassTop, 0.8f + 0.2f * lift), glassBottom, android.graphics.Shader.TileMode.CLAMP));
            highlight.setShader(new android.graphics.LinearGradient(0, top, 0, top + (bottom - top) * 0.55f,
                    withAlpha(highlightColor, 0.7f + 0.3f * lift), 0x00FFFFFF, android.graphics.Shader.TileMode.CLAMP));
        }
        canvas.drawRoundRect(pill, r, r, sheen);

        float s = stroke.getStrokeWidth() / 2f;
        pill.inset(s, s);
        canvas.drawRoundRect(pill, r - s, r - s, stroke);
        pill.inset(s, s);
        canvas.drawRoundRect(pill, r - 2 * s, r - 2 * s, highlight);
    }

    private static int withAlpha(int color, float factor) {
        int a = Math.round(((color >>> 24) & 0xFF) * Math.max(0f, Math.min(1f, factor)));
        return (a << 24) | (color & 0x00FFFFFF);
    }

    private void animateLift(float to, long duration) {
        if (liftAnim != null) liftAnim.cancel();
        if (!ValueAnimator.areAnimatorsEnabled()) { lift = to; invalidate(); return; }
        liftAnim = ValueAnimator.ofFloat(lift, to);
        liftAnim.setDuration(duration);
        liftAnim.setInterpolator(easeOut);
        liftAnim.addUpdateListener(an -> { lift = (float) an.getAnimatedValue(); invalidate(); });
        liftAnim.start();
    }

    private void setEdges(float l, float r) {
        long now = System.nanoTime();
        if (l != edgeL) { velL = velocity(l - edgeL, now - lastL); lastL = now; }
        if (r != edgeR) { velR = velocity(r - edgeR, now - lastR); lastR = now; }
        edgeL = l;
        edgeR = r;
        tint();
        invalidate();
    }

    private static float velocity(float dx, long dtNanos) {
        return dtNanos <= 0 || dtNanos > 50_000_000L ? 0f : dx / (dtNanos / 1e9f);
    }

    /** Tabs light up in proportion to how much of them the pill currently covers. */
    private void tint() {
        for (int i = 0; i < tabs.length && i < slotL.length; i++) {
            float overlap = Math.min(edgeR, slotR[i]) - Math.max(edgeL, slotL[i]);
            float f = clamp(overlap / (slotR[i] - slotL[i]), 0f, 1f);
            int c = (int) argb.evaluate(f, idleColor, activeColor);
            if (i < icons.length) icons[i].setImageTintList(ColorStateList.valueOf(c));
            if (i < labels.length) labels[i].setTextColor(c);
        }
    }

    // ---------------------------------------------------------------- motion

    private void stopAll() {
        removeCallbacks(pendingHandoff[0]);
        gen++;
        if (tween != null) { tween.cancel(); tween = null; }
        if (springL != null) springL.cancel();
        if (springR != null) springR.cancel();
    }

    private boolean isAnimating() {
        return (tween != null && tween.isRunning())
                || (springL != null && springL.isRunning())
                || (springR != null && springR.isRunning());
    }

    private void jumpTo(int i) {
        if (i >= slotL.length) return;
        stopAll();
        setEdges(slotL[i], slotR[i]);
        velL = velR = 0;
    }

    /** Tap: stretch over current + target, then hand off to springs that land on the target. */
    private void travel(int to) {
        stopAll();
        if (!ValueAnimator.areAnimatorsEnabled()) { jumpTo(to); return; }
        final float l0 = edgeL, r0 = edgeR;
        final float l1 = Math.min(edgeL, slotL[to]), r1 = Math.max(edgeR, slotR[to]);
        tween = ValueAnimator.ofFloat(0f, 1f);
        tween.setDuration(DILATE_MS);
        tween.setInterpolator(easeOut);
        tween.addUpdateListener(an -> {
            float f = (float) an.getAnimatedValue();
            setEdges(l0 + (l1 - l0) * f, r0 + (r1 - r0) * f);
        });
        tween.start();
        animateLift(0.6f, DILATE_MS);
        pendingHandoff[0] = () -> { animateLift(0f, 320); land(to, Float.NaN, false, true); };
        postDelayed(pendingHandoff[0], HANDOFF_MS);
    }

    /** Leading edge springs to the target; trailing edge optionally overshoots by {@code squash}, then relaxes. */
    private void land(int to, float v, boolean flick, boolean withSquash) {
        if (to >= slotL.length) return;
        if (tween != null) { tween.cancel(); tween = null; }
        final int g = ++gen;
        float targetMid = (slotL[to] + slotR[to]) / 2f, mid = (edgeL + edgeR) / 2f;
        final int dir = targetMid >= mid ? 1 : -1;
        boolean rightLeads = dir > 0;

        float leadVel = clamp(Float.isNaN(v) ? (rightLeads ? velR : velL) : v, -maxVelocity, maxVelocity);
        float trailVel = clamp(Float.isNaN(v) ? (rightLeads ? velL : velR) : v, -maxVelocity, maxVelocity);

        SpringAnimation lead = spring(rightLeads ? EDGE_R : EDGE_L, rightLeads ? slotR[to] : slotL[to],
                flick ? MOMENTUM_STIFFNESS : UI_STIFFNESS, flick ? MOMENTUM_DAMPING : UI_DAMPING, leadVel);
        final float trailTo = rightLeads ? slotL[to] : slotR[to];
        final FloatPropertyCompat<RubberDock> trailProp = rightLeads ? EDGE_L : EDGE_R;
        SpringAnimation trail = spring(trailProp, withSquash ? trailTo + dir * squash : trailTo,
                UI_STIFFNESS, UI_DAMPING, trailVel);
        if (withSquash && squash > 0) {
            trail.addEndListener((anim, canceled, value, velocity) -> {
                if (canceled || gen != g) return;
                SpringAnimation relax = spring(trailProp, trailTo, RELAX_STIFFNESS, RELAX_DAMPING, 0f);
                assign(trailProp, relax);
                relax.start();
            });
        }
        assign(rightLeads ? EDGE_R : EDGE_L, lead);
        assign(trailProp, trail);
        lead.start();
        trail.start();
    }

    private SpringAnimation spring(FloatPropertyCompat<RubberDock> prop, float to, float stiffness, float damping, float v) {
        SpringAnimation s = new SpringAnimation(this, prop, to);
        s.getSpring().setStiffness(stiffness).setDampingRatio(damping);
        s.setStartVelocity(v);
        s.setMinimumVisibleChange(DynamicAnimation.MIN_VISIBLE_CHANGE_PIXELS);
        return s;
    }

    private void assign(FloatPropertyCompat<RubberDock> prop, SpringAnimation s) {
        if (prop == EDGE_L) { if (springL != null && springL != s) springL.cancel(); springL = s; }
        else { if (springR != null && springR != s) springR.cancel(); springR = s; }
    }

    private void scheduleOpen(int i, long delay) {
        cancelOpen();
        if (listener == null) return;
        pendingOpen = () -> { pendingOpen = null; listener.onTabSelected(i); };
        if (delay <= 0) pendingOpen.run(); else postDelayed(pendingOpen, delay);
    }

    private void cancelOpen() {
        if (pendingOpen != null) { removeCallbacks(pendingOpen); pendingOpen = null; }
    }

    // ---------------------------------------------------------------- touch

    @Override public boolean onInterceptTouchEvent(MotionEvent e) {
        return slotL.length > 0;   // the dock owns every gesture on it
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        if (slotL.length == 0) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                cancelOpen();
                pointerId = e.getPointerId(0);
                downX = e.getX();
                live = false;
                downSlot = nearestSlot(downX);
                tracker = VelocityTracker.obtain();
                tracker.addMovement(e);
                boolean onPill = downX >= edgeL && downX <= edgeR;
                if (onPill) { stopAll(); animateLift(0.4f, 120); }
                else press(downSlot, true);
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                if (tracker == null) return true;
                int idx = e.findPointerIndex(pointerId);
                if (idx < 0) return true;
                tracker.addMovement(e);
                float x = e.getX(idx);
                if (!live) {
                    if (Math.abs(x - downX) < deadzone) return true;
                    live = true;
                    press(downSlot, false);
                    stopAll();
                    animateLift(1f, 180);
                    dragOffset = x - edgeL;           // relative drag: swipe anywhere, no jump
                    dragWidth = edgeR - edgeL;
                    ViewGroup p = (ViewGroup) getParent();
                    if (p != null) p.requestDisallowInterceptTouchEvent(true);
                }
                follow(x);
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (tracker == null) return true;
                tracker.addMovement(e);
                tracker.computeCurrentVelocity(1000, maxVelocity);
                float v = tracker.getXVelocity(pointerId);
                float x = e.getX();
                recycleTracker();
                press(downSlot, false);
                animateLift(0f, 340);
                if (!live) {
                    if (Math.abs(x - downX) <= slop) {
                        playSoundEffect(android.view.SoundEffectConstants.CLICK);
                        select(downSlot);
                    }
                    return true;
                }
                boolean flick = Math.abs(v) > flickVelocity;
                int to = nearestSlot((edgeL + edgeR) / 2f + project(v));
                if (flick && to == committed) to = (int) clamp(to + Math.signum(v), 0, slotL.length - 1);
                int from = committed;
                committed = to;
                land(to, v, flick, flick);
                if (to != from) scheduleOpen(to, DRAG_OPEN_DELAY_MS);
                return true;
            }
            case MotionEvent.ACTION_CANCEL: {
                recycleTracker();
                press(downSlot, false);
                animateLift(0f, 340);
                if (live) land(committed, Float.NaN, false, false);
                return true;
            }
        }
        return true;
    }

    private void follow(float x) {
        float minL = slotL[0], maxR = slotR[slotR.length - 1];
        float l = x - dragOffset, maxL = maxR - dragWidth;
        if (!ValueAnimator.areAnimatorsEnabled()) {
            float c = clamp(l, minL, maxL);
            setEdges(c, c + dragWidth);
        } else if (l < minL) {
            setEdges(minL, minL + dragWidth - rubber(minL - l, dragWidth));
        } else if (l > maxL) {
            setEdges(maxL + rubber(l - maxL, dragWidth), maxR);
        } else {
            setEdges(l, l + dragWidth);
        }
    }

    private void press(int i, boolean down) {
        if (i < 0 || i >= tabs.length) return;
        tabs[i].animate().scaleX(down ? 0.94f : 1f).scaleY(down ? 0.94f : 1f)
                .setDuration(160).setInterpolator(easeOut).start();
    }

    private void recycleTracker() {
        if (tracker != null) { tracker.recycle(); tracker = null; }
    }

    private int nearestSlot(float x) {
        int best = 0;
        for (int i = 1; i < slotL.length; i++) {
            if (Math.abs((slotL[i] + slotR[i]) / 2f - x) < Math.abs((slotL[best] + slotR[best]) / 2f - x)) best = i;
        }
        return best;
    }

    // ---------------------------------------------------------------- maths (from the web component)

    private static float rubber(float over, float dim) {
        return (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over));
    }

    /** Where a release at velocity {@code v} (px/s) would coast to, like a decaying scroll. */
    private static float project(float v) {
        double d = 1 - 0.1 * Math.pow(0.05, GLIDE / 100.0);
        return (float) (((v / 1000.0) * d) / (1 - d));
    }

    /** Spring with no bounce settling in ~{@code seconds}, the way motion/react defines duration. */
    private static float stiffness(float seconds) {
        double w = 2 * Math.PI / seconds;
        return (float) (w * w);
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }
}
