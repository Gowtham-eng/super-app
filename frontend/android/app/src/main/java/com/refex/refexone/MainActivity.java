package com.refex.refexone;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String APP_HOST = "refexone.com";
    // Kissflow Android native app package (Google Play "Kissflow" app)
    private static final String KISSFLOW_PACKAGE = "com.orangescape.kfdw";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();

        // Cookies for our RefexOne app
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(view, request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(view, url);
            }
        });
    }

    /**
     * Intercept Kissflow URLs and launch the Kissflow native Android app via Intent.
     * - First time: native app shows "Sign in with SSO" — user signs in once through Refex IdP.
     * - After: session is stored in native app, every tap opens the module directly (no login).
     *
     * Non-Kissflow URLs continue loading inside our Capacitor WebView.
     */
    private boolean handleUrl(WebView view, String url) {
        if (url == null) return false;

        // Only intercept Kissflow URLs
        if (!url.contains("kissflow.com")) {
            return false;
        }

        // Try to launch in Kissflow native app
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage(KISSFLOW_PACKAGE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true; // handled — don't load in WebView
        } catch (ActivityNotFoundException notFound) {
            // Kissflow native app not installed → try generic Intent (Android offers Chrome / chooser)
            try {
                Intent generic = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                generic.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(generic);
                return true;
            } catch (Exception e) {
                // Fall back to loading inside WebView
                return false;
            }
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
