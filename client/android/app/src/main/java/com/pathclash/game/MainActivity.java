package com.pathclash.game;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int TABLET_SMALLEST_WIDTH_DP = 600;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        applyDeviceOrientationPolicy();
        super.onCreate(savedInstanceState);
        applyImmersiveMode();
        WebSettings webSettings = this.getBridge().getWebView().getSettings();
        webSettings.setMediaPlaybackRequiresUserGesture(false);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
        }
    }

    private void applyImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }

    private void applyDeviceOrientationPolicy() {
        Configuration configuration = getResources().getConfiguration();
        boolean isTablet = configuration.smallestScreenWidthDp >= TABLET_SMALLEST_WIDTH_DP;

        setRequestedOrientation(
            isTablet
                ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        );
    }
}
