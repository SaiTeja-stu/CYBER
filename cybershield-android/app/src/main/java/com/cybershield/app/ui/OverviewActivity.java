package com.cybershield.app.ui;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.cybershield.app.CyberShieldApp;
import com.cybershield.app.R;
import com.cybershield.app.databinding.ActivityOverviewBinding;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * Native port of the web dashboard's "Overview" page: hot-tier counts plus
 * cold-archive trends. Admin-only on the backend ({@code /api/v1/stats/**}).
 */
public class OverviewActivity extends AppCompatActivity {

    private ActivityOverviewBinding b;
    private Map<String, Object> stats, trends;
    private int pending = 2;

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        b = ActivityOverviewBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        b.btnBack.setOnClickListener(v -> finish());

        fetch(CyberShieldApp.get().api().api().stats(), v -> { stats = v; done(); });
        fetch(CyberShieldApp.get().api().api().trends(), v -> { trends = v; done(); });
    }

    private interface Sink { void accept(Map<String, Object> v); }

    private void fetch(Call<Map<String, Object>> call, Sink sink) {
        call.enqueue(new Callback<>() {
            @Override public void onResponse(@NonNull Call<Map<String, Object>> c,
                                             @NonNull Response<Map<String, Object>> r) {
                if (r.code() == 403) { deny(); return; }
                sink.accept(r.isSuccessful() && r.body() != null ? r.body() : new LinkedHashMap<>());
            }
            @Override public void onFailure(@NonNull Call<Map<String, Object>> c, @NonNull Throwable t) {
                b.empty.setText("Couldn't load — is the backend reachable?");
                b.empty.setVisibility(View.VISIBLE);
            }
        });
    }

    private void deny() {
        b.empty.setText("Admin access required. Sign in with an admin account to see analytics.");
        b.empty.setVisibility(View.VISIBLE);
    }

    private void done() {
        if (--pending > 0 || stats == null || trends == null) return;

        b.empty.setVisibility(View.GONE);
        b.tilesRow1.setVisibility(View.VISIBLE);
        b.tilesRow2.setVisibility(View.VISIBLE);

        b.vTotal.setText(intStr(stats.get("totalScans")));
        b.v7d.setText(intStr(stats.get("scansLast7Days")));
        b.vPending.setText(intStr(stats.get("reportsPending")));
        b.vConfirmed.setText(intStr(stats.get("reportsConfirmed")));

        b.sections.removeAllViews();
        b.sections.addView(card("Risk mix", asRows(map(stats.get("scansByRiskLevel")))));
        b.sections.addView(card("By content type", asRows(map(stats.get("scansByContentType")))));
        b.sections.addView(card("Volume per day (cold archive)", asRows(map(trends.get("perDay")))));
        b.sections.addView(card("Top detected signals (cold archive)", labelCount(trends.get("topSignals"))));
        b.sections.addView(card("Top scam categories", labelCount(trends.get("topCategories"))));
    }

    // ---- data shaping -------------------------------------------------------

    private record Row(String label, long value) {}

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) {
        return o instanceof Map<?, ?> m ? (Map<String, Object>) m : new LinkedHashMap<>();
    }

    private static List<Row> asRows(Map<String, Object> m) {
        List<Row> rows = new ArrayList<>();
        for (Map.Entry<String, Object> e : m.entrySet()) rows.add(new Row(e.getKey(), lng(e.getValue())));
        return rows;
    }

    @SuppressWarnings("unchecked")
    private static List<Row> labelCount(Object list) {
        List<Row> rows = new ArrayList<>();
        if (list instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?> m) {
                    rows.add(new Row(String.valueOf(((Map<String, Object>) m).get("label")),
                            lng(((Map<String, Object>) m).get("count"))));
                }
            }
        }
        return rows;
    }

    private static long lng(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private static String intStr(Object o) { return String.valueOf(lng(o)); }

    // ---- view building ----------------------------------------------------

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private View card(String title, List<Row> rows) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        card.setLayoutParams(lp);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(getColor(R.color.panel));
        bg.setStroke(dp(1), getColor(R.color.edge));
        bg.setCornerRadius(dp(12));
        card.setBackground(bg);

        TextView h = new TextView(this);
        h.setText(title);
        h.setTextColor(getColor(R.color.muted));
        h.setTextSize(13);
        h.setAllCaps(true);
        card.addView(h);

        long max = 1;
        for (Row r : rows) max = Math.max(max, r.value());

        if (rows.isEmpty()) {
            TextView none = new TextView(this);
            none.setText("No data yet.");
            none.setTextColor(getColor(R.color.muted));
            none.setPadding(0, dp(8), 0, 0);
            card.addView(none);
        }
        for (Row r : rows) card.addView(bar(r, max));
        return card;
    }

    private View bar(Row r, long max) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(6), 0, dp(2));

        TextView label = new TextView(this);
        label.setText(r.label());
        label.setTextColor(getColor(R.color.muted));
        label.setTextSize(13);
        label.setMaxLines(1);
        label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        label.setLayoutParams(new LinearLayout.LayoutParams(dp(120), LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(label);

        GradientDrawable td = new GradientDrawable();
        td.setColor(getColor(R.color.edge));
        td.setCornerRadius(dp(4));

        // Weighted fill + spacer sit inside a track-coloured row.
        LinearLayout barWrap = new LinearLayout(this);
        LinearLayout.LayoutParams bwp = new LinearLayout.LayoutParams(0, dp(8), 1f);
        bwp.setMarginStart(dp(8));
        bwp.setMarginEnd(dp(8));
        barWrap.setLayoutParams(bwp);
        barWrap.setOrientation(LinearLayout.HORIZONTAL);
        barWrap.setBackground(td);

        View fill = new View(this);
        float frac = Math.max(0.02f, (float) r.value() / max);
        fill.setLayoutParams(new LinearLayout.LayoutParams(0, dp(8), frac));
        GradientDrawable fd = new GradientDrawable();
        fd.setColor(getColor(R.color.sky));
        fd.setCornerRadius(dp(4));
        fill.setBackground(fd);
        barWrap.addView(fill);
        View rest = new View(this);
        rest.setLayoutParams(new LinearLayout.LayoutParams(0, dp(8), 1f - frac));
        barWrap.addView(rest);

        row.addView(barWrap);

        TextView val = new TextView(this);
        val.setText(String.valueOf(r.value()));
        val.setTextColor(getColor(R.color.text));
        val.setTextSize(13);
        val.setGravity(Gravity.END);
        val.setLayoutParams(new LinearLayout.LayoutParams(dp(36), LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(val);

        return row;
    }
}
