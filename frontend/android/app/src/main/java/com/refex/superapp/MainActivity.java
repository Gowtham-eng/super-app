package com.refex.superapp;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String APP_HOST = "superapp.refex.group";
    private static final String APP_HOST_DEV = "10.5.7.108";

    // Pending Kissflow module URL set by web page BEFORE submitting SAML.
    // Read in onPageFinished once Kissflow lands the user post-SSO, then cleared.
    private volatile String pendingModuleUrl = null;
    private volatile long pendingSetAt = 0L;

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

        // Expose native bridge: window.SuperAppBridge.setPendingModule(url)
        // Called by /api/saml/{id}/complete page right before submitting SAML form.
        webView.addJavascriptInterface(new SuperAppBridge(), "SuperAppBridge");

        // CRITICAL: All URLs load inside WebView. SAML cookies stay in our WebView session.
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url == null) return;

                // ====== POST-SSO MODULE REDIRECT ======
                // If user just landed on a Kissflow page (post-SAML) AND we have a pending
                // module URL, the session cookie is now set first-party. Redirect to module.
                // Conditions: url is on kissflow.com, NOT the signin/SAML endpoint,
                // and pending module was set within last 30s.
                if (pendingModuleUrl != null
                        && url.contains("kissflow.com")
                        && !url.contains("/signin/")
                        && !url.contains("/saml")
                        && (System.currentTimeMillis() - pendingSetAt) < 30_000L) {
                    String target = pendingModuleUrl;
                    pendingModuleUrl = null;
                    pendingSetAt = 0L;
                    // Avoid infinite loop: only redirect if we're not already at the target.
                    if (!url.equals(target) && !url.startsWith(target)) {
                        view.loadUrl(target);
                        return;
                    }
                }

                // Inject floating "Back to Launcher" button on Kissflow module pages
                if (url.contains("kissflow.com") && !url.contains("/signin/")) {
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
            if (url != null && url.contains("kissflow.com")) {
                webView.loadUrl(getAppUrl() + "/launcher");
                return;
            }
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * JavascriptInterface exposed to the WebView as window.SuperAppBridge.
     * The SAML-completion page (served by /api/saml/{id}/complete?mobile_module=...)
     * calls SuperAppBridge.setPendingModule(url) right before submitting the SAML form,
     * so we know where to redirect after Kissflow processes the SSO.
     */
    private class SuperAppBridge {
        @JavascriptInterface
        public void setPendingModule(String url) {
            if (url != null && !url.isEmpty() && url.startsWith("http")) {
                pendingModuleUrl = url;
                pendingSetAt = System.currentTimeMillis();
            }
        }

        @JavascriptInterface
        public void clearPendingModule() {
            pendingModuleUrl = null;
            pendingSetAt = 0L;
        }
    }
}
