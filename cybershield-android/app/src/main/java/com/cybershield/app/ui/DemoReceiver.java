package com.cybershield.app.ui;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

import com.cybershield.app.shield.OverlayService;
import com.cybershield.app.sms.SmsReceiver;

/**
 * BroadcastReceiver enabling script scenes to be triggered either via ADB commands
 * or programmatically for the video demonstration.
 */
public class DemoReceiver extends BroadcastReceiver {
    public static final String ACTION_EMAIL = "com.cybershield.app.DEMO_EMAIL";
    public static final String ACTION_PAYTM_OTP = "com.cybershield.app.DEMO_PAYTM_OTP";
    public static final String ACTION_BETTING_SMS = "com.cybershield.app.DEMO_BETTING_SMS";
    public static final String ACTION_BROWSER = "com.cybershield.app.DEMO_BROWSER_SHIELD";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();

        switch (action) {
            case ACTION_EMAIL: {
                String raw = "From: \"PayPal Service\" <security@paypa1-account-verify.tk>\n"
                        + "Reply-To: paypal.recovery.team@gmail.com\n"
                        + "Subject: Urgent: your account has been limited\n"
                        + "Authentication-Results: mx.google.com; spf=fail; dkim=fail; dmarc=fail\n\n"
                        + "Verify your identity now at http://paypa1-account-verify.tk/login or your account "
                        + "will be permanently suspended. Confirm your password and the OTP sent to your phone.";
                Intent i = VerdictActivity.intent(context, "EMAIL", raw, "demo");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(i);
                break;
            }
            case ACTION_PAYTM_OTP: {
                SmsReceiver.scan(context.getApplicationContext(), "AX-PAYTM-T",
                        "948215 is your OTP to login to Paytm. Valid for 10 mins. Never share OTP or PIN with anyone. Paytm staff will never ask for it.");
                Toast.makeText(context, "Genuine Paytm OTP: Secure Me stays quiet, because real alerts should never be flagged.", Toast.LENGTH_LONG).show();
                break;
            }
            case ACTION_BETTING_SMS: {
                SmsReceiver.scan(context.getApplicationContext(), "+919876543210",
                        "IPL 2026 Special: Deposit ₹500 and get ₹5,000 instant bonus on 1xBet / Parimatch! Play Aviator & color prediction now at http://betting-ipl-win.xyz");
                Toast.makeText(context, "Fake betting SMS received: Secure Me warns straight away.", Toast.LENGTH_SHORT).show();
                break;
            }
            case ACTION_BROWSER: {
                Intent warn = new Intent(context, WarningActivity.class)
                        .putExtra(OverlayService.EX_TITLE, "Dangerous site - do not continue")
                        .putExtra(OverlayService.EX_BODY,
                                "tamilrockers-movies-free.tk\n\n• Suspicious TLD (.tk)\n• Flagged piracy and malware distribution site\n• Unencrypted connection\n\nDon't enter passwords, OTPs or card details on this site.")
                        .putExtra(OverlayService.EX_SCORE, 94)
                        .putExtra(OverlayService.EX_URL, "http://tamilrockers-movies-free.tk")
                        .putExtra(OverlayService.EX_HARD, true)
                        .putExtra(OverlayService.EX_HOST, "tamilrockers-movies-free.tk")
                        .putExtra(OverlayService.EX_PKG, "com.android.chrome")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(warn);
                break;
            }
        }
    }
}
