package com.cybershield.app.ui;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.cybershield.app.R;
import com.cybershield.app.shield.OverlayService;

/**
 * Full-screen in-app warning activity that mirrors the OverlayService banner layout.
 * Ensures the piracy/phishing full-screen warning displays reliably even on devices
 * where background overlay draw permissions have strict OEM locks.
 */
public class WarningActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.overlay_warning);

        String title = getIntent().getStringExtra(OverlayService.EX_TITLE);
        String body = getIntent().getStringExtra(OverlayService.EX_BODY);
        int score = getIntent().getIntExtra(OverlayService.EX_SCORE, 94);
        String host = getIntent().getStringExtra(OverlayService.EX_HOST);
        String pkg = getIntent().getStringExtra(OverlayService.EX_PKG);
        String url = getIntent().getStringExtra(OverlayService.EX_URL);
        boolean hard = getIntent().getBooleanExtra(OverlayService.EX_HARD, true);

        TextView titleView = findViewById(R.id.ovTitle);
        TextView bodyView = findViewById(R.id.ovBody);
        TextView scoreView = findViewById(R.id.ovScore);
        Button dismiss = findViewById(R.id.ovDismiss);
        Button proceed = findViewById(R.id.ovProceed);

        if (titleView != null) titleView.setText(title != null ? title : "Dangerous site - do not continue");
        if (bodyView != null) bodyView.setText(body != null ? body : "");
        if (scoreView != null) {
            scoreView.setText("Risk " + score + "/100");
            scoreView.setTextColor(score >= 75 ? Color.parseColor("#E5484D") : Color.parseColor("#F08A3C"));
        }

        if (dismiss != null) {
            dismiss.setText("Go back — stay safe");
            dismiss.setOnClickListener(v -> finish());
        }

        if (proceed != null) {
            proceed.setText("I understand the risk, continue");
            proceed.setOnClickListener(v -> {
                Intent gate = new Intent(this, ProceedGateActivity.class)
                        .putExtra(OverlayService.EX_HOST, host)
                        .putExtra(OverlayService.EX_PKG, pkg)
                        .putExtra(OverlayService.EX_URL, url)
                        .putExtra(OverlayService.EX_SCORE, score)
                        .putExtra(OverlayService.EX_HARD, hard);
                startActivity(gate);
                finish();
            });
        }
    }
}
