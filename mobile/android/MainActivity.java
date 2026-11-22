package game.faultline.descent;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.View;

public final class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);

        WebView game = new WebView(this);
        game.setBackgroundColor(0xff0a1017);

        // Enable hardware acceleration for WebGL
        game.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        // Packaged classic scripts load offline without cross-origin file privileges.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // Enable media auto-play for game audio
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Chrome client for console logging (useful for debugging)
        game.setWebChromeClient(new WebChromeClient());

        setContentView(game);
        game.loadUrl("file:///android_asset/index.html");
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused && android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        }
    }

    @Override public void onBackPressed() {
        // Prevent accidental back-button exits during gameplay
    }
}

