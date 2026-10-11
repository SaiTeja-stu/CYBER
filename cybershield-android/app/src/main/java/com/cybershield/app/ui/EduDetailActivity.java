package com.cybershield.app.ui;

import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.cybershield.app.CyberShieldApp;
import com.cybershield.app.R;
import com.cybershield.app.data.EducationCatalog;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.chip.Chip;
import com.google.android.material.chip.ChipGroup;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * One lesson — understood by SEEING (big icon, one rule, colour-coded ✓ / ✗
 * lists in large type) and by HEARING (a Listen button reads it aloud, slowly,
 * in the chosen language). English / తెలుగు / हिन्दी switch on this screen.
 */
public class EduDetailActivity extends AppCompatActivity {

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String speech = "";
    private String moduleId;
    private String lang = "en";

    private MaterialButton listenBtn;
    private LinearLayout body;
    private ScrollView scroll;

    public static Intent intent(Context ctx, EduAdapter.Module m, String lang) {
        Intent i = new Intent(ctx, EduDetailActivity.class);
        i.putExtra("id", m.id);
        i.putExtra("lang", lang);
        return i;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        moduleId = getIntent().getStringExtra("id");
        lang = or(getIntent().getStringExtra("lang"), CyberShieldApp.get().api().store().eduLang());

        int pad = dp(20);
        LinearLayout outer = new LinearLayout(this);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setBackgroundResource(com.cybershield.app.R.drawable.bg_gradient);
        outer.setPadding(pad, pad, pad, 0);

        ImageView back = new ImageView(this);
        back.setImageResource(com.cybershield.app.R.drawable.ic_back);
        back.setColorFilter(getColor(com.cybershield.app.R.color.text));
        back.setPadding(dp(6), dp(6), dp(6), dp(6));
        back.setContentDescription("Back");
        back.setOnClickListener(v -> finish());
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(36), dp(36));
        bp.bottomMargin = dp(8);
        back.setLayoutParams(bp);
        back.setBackgroundResource(android.R.drawable.list_selector_background);
        outer.addView(back);

        // language switch
        ChipGroup cg = new ChipGroup(this);
        cg.setSingleSelection(true);
        cg.setSelectionRequired(true);
        String[] labels = EducationCatalog.LANG_LABELS;
        for (int k = 0; k < EducationCatalog.LANGS.length; k++) {
            Chip c = new Chip(this);
            c.setText(labels[k]);
            c.setCheckable(true);
            c.setTag(EducationCatalog.LANGS[k]);
            c.setChecked(EducationCatalog.LANGS[k].equals(lang));
            cg.addView(c);
        }
        cg.setOnCheckedStateChangeListener((g, ids) -> {
            int id = cg.getCheckedChipId();
            if (id == View.NO_ID) return;
            Object tag = cg.findViewById(id).getTag();
            String newLang = tag == null ? "en" : tag.toString();
            if (newLang.equals(lang)) return;
            lang = newLang;
            CyberShieldApp.get().api().store().setEduLang(lang);
            render();
            initTts();
        });
        outer.addView(cg);

        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(0, dp(6), 0, dp(36));
        scroll = new ScrollView(this);
        scroll.addView(body);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        scroll.setLayoutParams(sp);
        outer.addView(scroll);

        setContentView(outer);

        render();
        initTts();
    }

    private EduAdapter.Module module() {
        for (EduAdapter.Module m : EducationCatalog.bundled(this, lang)) {
            if (m.id != null && m.id.equals(moduleId)) return m;
        }
        // fall back to English
        for (EduAdapter.Module m : EducationCatalog.bundled(this, "en")) {
            if (m.id != null && m.id.equals(moduleId)) return m;
        }
        return null;
    }

    private void render() {
        body.removeAllViews();
        EduAdapter.Module m = module();
        if (m == null) { finish(); return; }

        String title = or(m.title, "");
        String rule = or(m.rule, "");
        String summary = or(m.summary, "");
        List<String> doThis = m.safeActions();
        List<String> redFlags = m.redFlags == null ? new ArrayList<>() : m.redFlags;
        int accent = getColor(R.color.cyber_emerald);

        // hero: icon in a soft circle, title, one-line summary
        FrameLayout halo = new FrameLayout(this);
        halo.setBackground(round(getColor(R.color.nav_neon_soft), dp(48), 0, 0));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(dp(96), dp(96));
        hp.gravity = Gravity.CENTER_HORIZONTAL;
        hp.topMargin = dp(8);
        halo.setLayoutParams(hp);
        ImageView ic = new ImageView(this);
        ic.setImageResource(EduAdapter.iconFor(moduleId));
        halo.addView(ic, new FrameLayout.LayoutParams(dp(52), dp(52), Gravity.CENTER));
        body.addView(halo);

        TextView t = centre(title, 24, true, R.color.text);
        t.setPadding(dp(8), dp(14), dp(8), 0);
        body.addView(t);
        if (!summary.isEmpty()) {
            TextView sv = centre(summary, 15, false, R.color.muted);
            sv.setPadding(dp(12), dp(6), dp(12), 0);
            sv.setLineSpacing(dp(2), 1f);
            body.addView(sv);
        }

        listenBtn = new MaterialButton(this);
        listenBtn.setText(listenLabel());
        listenBtn.setTextSize(14);
        listenBtn.setAllCaps(false);
        listenBtn.setCornerRadius(dp(24));
        listenBtn.setBackgroundTintList(android.content.res.ColorStateList.valueOf(getColor(R.color.nav_neon_soft)));
        listenBtn.setTextColor(accent);
        listenBtn.setEnabled(ttsReady);
        LinearLayout.LayoutParams lbp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(46));
        lbp.gravity = Gravity.CENTER_HORIZONTAL;
        lbp.topMargin = dp(14);
        listenBtn.setLayoutParams(lbp);
        listenBtn.setOnClickListener(v -> toggleSpeak());
        body.addView(listenBtn);

        // the one rule to remember
        if (!rule.isEmpty()) {
            LinearLayout box = card(getColor(R.color.tip_box_bg), accent);
            box.addView(label(s(lang, "REMEMBER", "గుర్తుంచుకోండి", "याद रखें"), accent));
            TextView rv = new TextView(this);
            rv.setText(rule);
            rv.setTextSize(18);
            rv.setTypeface(Typeface.DEFAULT_BOLD);
            rv.setTextColor(getColor(R.color.text));
            rv.setLineSpacing(dp(2), 1f);
            rv.setPadding(0, dp(6), 0, 0);
            box.addView(rv);
            body.addView(box);
        }

        // what to do: numbered steps
        if (!doThis.isEmpty()) {
            body.addView(heading(s(lang, "What to do", "ఏం చేయాలి", "क्या करें")));
            LinearLayout steps = card(getColor(R.color.cyber_card_bg), getColor(R.color.cyber_card_stroke));
            for (int i = 0; i < doThis.size(); i++) steps.addView(step(i + 1, doThis.get(i), i > 0));
            body.addView(steps);
        }

        // warning signs: what the scammer actually says
        if (!redFlags.isEmpty()) {
            body.addView(heading(s(lang, "If you hear this, it's a scam",
                    "ఇలా వినిపిస్తే, అది మోసం", "ऐसा सुनें, तो यह धोखा है")));
            for (String f : redFlags) body.addView(bubble(f));
        }

        body.addView(helpCard());
        View next = nextLessonCard();
        if (next != null) body.addView(next);

        speech = buildSpeech(title, rule, doThis, redFlags);
        scroll.scrollTo(0, 0);
    }

    private String listenLabel() {
        return "▶   " + s(lang, "Listen to this lesson", "ఈ పాఠం వినండి", "यह पाठ सुनें");
    }

    private View step(int n, String text, boolean divider) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, divider ? dp(12) : 0, 0, 0);
        TextView num = new TextView(this);
        num.setText(String.valueOf(n));
        num.setGravity(Gravity.CENTER);
        num.setTextSize(13);
        num.setTypeface(Typeface.DEFAULT_BOLD);
        num.setTextColor(getColor(R.color.on_accent));
        num.setBackground(round(getColor(R.color.cyber_emerald), dp(13), 0, 0));
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(dp(26), dp(26));
        np.topMargin = dp(1);
        row.addView(num, np);
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(16);
        tv.setLineSpacing(dp(3), 1f);
        tv.setTextColor(getColor(R.color.text));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        tp.leftMargin = dp(12);
        row.addView(tv, tp);
        return row;
    }

    private View bubble(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(15.5f);
        tv.setLineSpacing(dp(2), 1f);
        tv.setTextColor(getColor(R.color.text));
        tv.setPadding(dp(16), dp(12), dp(16), dp(12));
        int red = getColor(R.color.risk_malicious);
        tv.setBackground(round((red & 0x00FFFFFF) | 0x1A000000, dp(16), dp(1), (red & 0x00FFFFFF) | 0x4D000000));
        tv.setCompoundDrawablePadding(dp(10));
        android.graphics.drawable.Drawable warn = getDrawable(R.drawable.ic_warning);
        if (warn != null) {
            warn = warn.mutate();
            warn.setTint(red);
            warn.setBounds(0, 0, dp(18), dp(18));
            tv.setCompoundDrawablesRelative(warn, null, null, null);
        }
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(8);
        tv.setLayoutParams(p);
        return tv;
    }

    /** What to do if it already happened: the national helpline, one tap away. */
    private View helpCard() {
        LinearLayout box = card(getColor(R.color.cyber_card_bg), getColor(R.color.cyber_card_stroke));
        ((LinearLayout.LayoutParams) box.getLayoutParams()).topMargin = dp(24);
        TextView h = new TextView(this);
        h.setText(s(lang, "Lost money or shared a code?", "డబ్బు పోయిందా లేదా కోడ్ చెప్పారా?",
                "पैसे गए या कोड बता दिया?"));
        h.setTextSize(16);
        h.setTypeface(Typeface.DEFAULT_BOLD);
        h.setTextColor(getColor(R.color.text));
        box.addView(h);
        TextView bodyTv = new TextView(this);
        bodyTv.setText(s(lang,
                "Call 1930 straight away. It's the national cyber-crime helpline, and the sooner you call, the better the chance of getting your money back.",
                "వెంటనే 1930కి కాల్ చేయండి. ఇది జాతీయ సైబర్ క్రైమ్ హెల్ప్‌లైన్. ఎంత త్వరగా కాల్ చేస్తే, డబ్బు తిరిగి వచ్చే అవకాశం అంత ఎక్కువ.",
                "तुरंत 1930 पर कॉल करें। यह राष्ट्रीय साइबर अपराध हेल्पलाइन है, और जितनी जल्दी कॉल करेंगे, पैसे वापस मिलने की संभावना उतनी ज़्यादा।"));
        bodyTv.setTextSize(14);
        bodyTv.setLineSpacing(dp(2), 1f);
        bodyTv.setTextColor(getColor(R.color.muted));
        bodyTv.setPadding(0, dp(4), 0, dp(12));
        box.addView(bodyTv);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        MaterialButton call = new MaterialButton(this);
        call.setText(s(lang, "Call 1930", "1930కి కాల్ చేయండి", "1930 पर कॉल करें"));
        call.setAllCaps(false);
        call.setCornerRadius(dp(22));
        call.setBackgroundTintList(android.content.res.ColorStateList.valueOf(getColor(R.color.cyber_emerald)));
        call.setTextColor(getColor(R.color.on_accent));
        call.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:1930"))));
        actions.addView(call, new LinearLayout.LayoutParams(0, dp(46), 1f));
        MaterialButton report = new MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle);
        report.setText(s(lang, "Report online", "ఆన్‌లైన్‌లో ఫిర్యాదు", "ऑनलाइन शिकायत"));
        report.setAllCaps(false);
        report.setCornerRadius(dp(22));
        report.setTextColor(getColor(R.color.cyber_emerald));
        report.setStrokeColor(android.content.res.ColorStateList.valueOf(getColor(R.color.cyber_card_stroke)));
        report.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://cybercrime.gov.in")));
            } catch (android.content.ActivityNotFoundException ignored) { }
        });
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(0, dp(46), 1f);
        rp.leftMargin = dp(10);
        actions.addView(report, rp);
        box.addView(actions);
        return box;
    }

    private View nextLessonCard() {
        List<EduAdapter.Module> all = EducationCatalog.bundled(this, lang);
        int idx = -1;
        for (int i = 0; i < all.size(); i++) if (moduleId != null && moduleId.equals(all.get(i).id)) idx = i;
        LinearLayout box = card(getColor(R.color.cyber_card_bg), getColor(R.color.cyber_card_stroke));
        ((LinearLayout.LayoutParams) box.getLayoutParams()).topMargin = dp(12);
        if (idx < 0 || idx + 1 >= all.size()) {
            TextView done = new TextView(this);
            done.setText(s(lang, "That's all the lessons. Well done!",
                    "అన్ని పాఠాలు పూర్తయ్యాయి. బాగా చేశారు!", "सारे पाठ पूरे हुए। शाबाश!"));
            done.setTextSize(15);
            done.setTypeface(Typeface.DEFAULT_BOLD);
            done.setTextColor(getColor(R.color.text));
            done.setGravity(Gravity.CENTER_HORIZONTAL);
            box.addView(done);
            return box;
        }
        EduAdapter.Module next = all.get(idx + 1);
        box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.addView(label(s(lang, "NEXT LESSON", "తర్వాతి పాఠం", "अगला पाठ"), getColor(R.color.cyber_emerald)));
        TextView nt = new TextView(this);
        nt.setText(or(next.title, ""));
        nt.setTextSize(15.5f);
        nt.setTypeface(Typeface.DEFAULT_BOLD);
        nt.setTextColor(getColor(R.color.text));
        nt.setPadding(0, dp(3), 0, 0);
        texts.addView(nt);
        box.addView(texts, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        ImageView chev = new ImageView(this);
        chev.setImageResource(R.drawable.ic_chevron_right);
        chev.setColorFilter(getColor(R.color.cyber_emerald));
        box.addView(chev, new LinearLayout.LayoutParams(dp(22), dp(22)));
        box.setClickable(true);
        box.setFocusable(true);
        box.setOnClickListener(v -> {
            startActivity(EduDetailActivity.intent(this, next, lang));
            finish();
        });
        return box;
    }

    private LinearLayout card(int fill, int stroke) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(16), dp(18), dp(16));
        box.setBackground(round(fill, dp(18), dp(1), stroke));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(18);
        box.setLayoutParams(p);
        return box;
    }

    private TextView label(String txt, int color) {
        TextView t = new TextView(this);
        t.setText(txt);
        t.setTextSize(11);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLetterSpacing(0.08f);
        t.setTextColor(color);
        return t;
    }

    private static GradientDrawable round(int fill, int radius, int strokeW, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(radius);
        if (strokeW > 0) g.setStroke(strokeW, stroke);
        return g;
    }

    // ---- text-to-speech --------------------------------------------

    private void initTts() {
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        ttsReady = false;
        if (listenBtn != null) listenBtn.setEnabled(false);
        final String want = lang;
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(Locale.forLanguageTag(EducationCatalog.bcp47(want)));
            boolean ok = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            if (!ok) tts.setLanguage(Locale.US);
            tts.setSpeechRate(0.85f);
            tts.setPitch(1.0f);
            ttsReady = true;
            final boolean fellBack = !ok && !"en".equals(want);
            runOnUiThread(() -> {
                if (listenBtn != null) {
                    listenBtn.setEnabled(true);
                    if (fellBack) listenBtn.setText("▶   Listen (English voice)");
                }
                if (fellBack) Toast.makeText(this,
                        "Voice for this language isn't installed — Settings › Languages › Text-to-speech.",
                        Toast.LENGTH_LONG).show();
            });
        });
    }

    private void toggleSpeak() {
        if (!ttsReady) return;
        if (tts.isSpeaking()) {
            tts.stop();
            listenBtn.setText(listenLabel());
        } else {
            tts.speak(speech, TextToSpeech.QUEUE_FLUSH, null, "edu");
            listenBtn.setText("■   " + s(lang, "Stop", "ఆపండి", "रोकें"));
        }
    }

    private String buildSpeech(String title, String rule, List<String> doThis, List<String> flags) {
        StringBuilder sb = new StringBuilder(title).append(". ");
        if (!rule.isEmpty()) sb.append(rule).append(". ");
        if (!doThis.isEmpty()) {
            sb.append(s(lang, "What to do", "ఏం చేయాలి", "क्या करें")).append(". ");
            for (String d : doThis) sb.append(d).append(". ");
        }
        if (!flags.isEmpty()) {
            sb.append(s(lang, "Danger signs", "ప్రమాద సంకేతాలు", "ख़तरे के संकेत")).append(". ");
            for (String f : flags) sb.append(f.replace("\"", "")).append(". ");
        }
        return sb.toString();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

    // ---- helpers --------------------------------------------------

    private static String s(String lang, String en, String te, String hi) {
        return "te".equals(lang) ? te : "hi".equals(lang) ? hi : en;
    }

    private TextView centre(String txt, int sizeSp, boolean bold, int colorRes) {
        TextView t = new TextView(this);
        t.setText(txt);
        t.setTextSize(sizeSp);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(getColor(colorRes));
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setPadding(0, dp(10), 0, dp(4));
        return t;
    }

    private TextView heading(String txt) {
        TextView t = new TextView(this);
        t.setText(txt);
        t.setTextSize(18);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(getColor(R.color.text));
        t.setPadding(0, dp(26), 0, dp(2));
        return t;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private static String or(String x, String dflt) { return x == null || x.isEmpty() ? dflt : x; }
}
