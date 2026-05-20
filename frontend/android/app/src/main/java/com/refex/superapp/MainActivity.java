package com.refex.superapp;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String APP_HOST = "superapp.refex.group";
    // Also match internal IP for development
    private static final String APP_HOST_DEV = "10.5.7.108";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();

        // Enable cookies (required for SAML SSO)
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        // All URLs load inside WebView - no external app launches
        // This is critical for SAML SSO: cookies must stay in our WebView
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Let everything load inside our WebView
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Let everything load inside our WebView
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                // Inject a floating "Back to Launcher" button when on Kissflow pages
                if (url != null && url.contains("kissflow.com") && !url.contains("/signin/")) {
                    view.evaluateJavascript(
                        "(function() {" +
                        "  if (document.getElementById('superapp-back-btn')) return;" +
                        "  var btn = document.createElement('div');" +
                        "  btn.id = 'superapp-back-btn';" +
                        "  btn.innerHTML = '<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 9l4-4-4-4\"/><path d=\"M7 5H3\"/><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"/><circle cx=\"8.5\" cy=\"16.5\" r=\"1.5\"/><circle cx=\"15.5\" cy=\"16.5\" r=\"1.5\"/><path d=\"M12 11v4\"/></svg>';" +
                        "  btn.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:999999;background:#10b981;color:white;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;';" +
                        "  btn.onclick = function() { window.location.href = '" + getAppUrl() + "/launcher'; };" +
                        "  document.body.appendChild(btn);" +
                        "})();",
                        null
                    );
                }
            }
        });
    }

    private String getAppUrl() {
        // Return the app's base URL from Capacitor config
        String url = getBridge().getServerUrl();
        if (url != null && !url.isEmpty()) {
            return url;
        }
        return "https://superapp.refex.group";
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            String url = webView.getUrl();
            // If on a Kissflow page, go back to launcher instead of navigating back
            if (url != null && url.contains("kissflow.com")) {
                webView.loadUrl(getAppUrl() + "/launcher");
                return;
            }
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
