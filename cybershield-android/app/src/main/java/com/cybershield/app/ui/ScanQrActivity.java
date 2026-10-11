package com.cybershield.app.ui;

import android.annotation.SuppressLint;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;

import android.net.Uri;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.core.view.WindowInsetsControllerCompat;

import com.cybershield.app.R;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;

import com.cybershield.app.databinding.ActivityScanQrBinding;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * CameraX preview + ML Kit barcode scanning, fully on-device. The decoded
 * payload is routed to the verdict screen; the camera never uploads anything.
 */
public class ScanQrActivity extends AppCompatActivity {

    private ActivityScanQrBinding b;
    private ExecutorService analysisExecutor;
    private BarcodeScanner scanner;
    // read from the camera analysis thread too
    private volatile boolean handled = false;

    private final ActivityResultLauncher<PickVisualMediaRequest> pickImage =
            registerForActivityResult(new ActivityResultContracts.PickVisualMedia(), uri -> {
                if (uri != null) scanImage(uri);
            });

    private Camera camera;
    private boolean torchOn = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        b = ActivityScanQrBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());

        // camera screen: black system bars with light icons in both themes
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        int accent = getColor(R.color.nav_neon);
        b.overlay.setColors(accent, getColor(R.color.splash_done));
        b.privacyIcon.setImageTintList(ColorStateList.valueOf(accent));
        float gap = 22 * getResources().getDisplayMetrics().density;
        b.overlay.setWindowListener(w -> {
            b.hintBlock.setY(w.bottom + gap);
            b.hintBlock.setVisibility(View.VISIBLE);
        });

        b.btnBack.setOnClickListener(v -> finish());
        b.btnTorch.setOnClickListener(v -> toggleTorch());
        b.btnGallery.setOnClickListener(v -> pickImage.launch(new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                .build()));

        analysisExecutor = Executors.newSingleThreadExecutor();
        scanner = BarcodeScanning.getClient(new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX)
                .build());

        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                bind(future.get());
            } catch (Exception e) {
                Log.e("ScanQr", "camera bind failed", e);
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @SuppressLint("UnsafeOptInUsageError")
    private void bind(ProcessCameraProvider provider) {
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(b.preview.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();
        analysis.setAnalyzer(analysisExecutor, image -> {
            if (handled || image.getImage() == null) { image.close(); return; }
            InputImage input = InputImage.fromMediaImage(
                    image.getImage(), image.getImageInfo().getRotationDegrees());
            scanner.process(input)
                    .addOnSuccessListener(barcodes -> {
                        for (Barcode code : barcodes) {
                            String raw = code.getRawValue();
                            if (raw != null && !raw.isEmpty() && !handled) {
                                handled = true;
                                onPayload(raw);
                                return;
                            }
                        }
                    })
                    .addOnCompleteListener(t -> image.close());
        });

        provider.unbindAll();
        camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
        b.btnTorch.setVisibility(camera.getCameraInfo().hasFlashUnit() ? View.VISIBLE : View.GONE);
    }

    private void toggleTorch() {
        if (camera == null) return;
        torchOn = !torchOn;
        camera.getCameraControl().enableTorch(torchOn);
        b.btnTorch.setImageTintList(ColorStateList.valueOf(torchOn ? getColor(R.color.nav_neon) : Color.WHITE));
    }

    /** Decode a QR from a saved image (screenshot, photo) with the same on-device scanner. */
    private void scanImage(@NonNull Uri uri) {
        if (handled) return;
        handled = true;   // pause camera frames while the image is read
        b.hintTitle.setText("Reading image…");
        b.hintSub.setText("Looking for a QR code");
        InputImage image;
        try {
            image = InputImage.fromFilePath(this, uri);
        } catch (IOException e) {
            noCodeInImage();
            return;
        }
        scanner.process(image)
                .addOnSuccessListener(codes -> {
                    for (Barcode code : codes) {
                        String raw = code.getRawValue();
                        if (raw != null && !raw.isEmpty()) { onPayload(raw); return; }
                    }
                    noCodeInImage();
                })
                .addOnFailureListener(e -> noCodeInImage());
    }

    private void noCodeInImage() {
        runOnUiThread(() -> {
            b.hintTitle.setText("No QR code in that image");
            b.hintSub.setText("Try another picture, or point the camera at the code");
            handled = false;
            b.hintTitle.postDelayed(() -> {
                if (handled) return;
                b.hintTitle.setText("Point at a QR code");
                b.hintSub.setText("We'll check it before you pay");
            }, 3000);
        });
    }

    private void onPayload(@NonNull String raw) {
        runOnUiThread(() -> {
            b.overlay.lockOn();
            b.overlay.performHapticFeedback(HapticFeedbackConstants.CONFIRM);
            b.hintTitle.setText("Checking…");
            b.hintSub.setText("Hold on, this takes a moment");
            // let the lock-on register before handing over to the verdict
            b.overlay.postDelayed(() -> {
                VerdictActivity.start(this, "QR", raw, "qr-scan");
                finish();
            }, 320);
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (analysisExecutor != null) analysisExecutor.shutdown();
        if (scanner != null) scanner.close();
    }
}
