package com.refex.superapp;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String KISSFLOW_PACKAGE = "com.orangescape.kfdw";
    private static final String KISSFLOW_DOMAIN = "kissflow.com";
    // SAML ACS URL must load INSIDE WebView (POST data required for SSO)
    private static final String SAML_ACS_PATH = "/signin/";
    private static final String SAML_LOGIN_PATH = "/view/login";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();

        // Enable third-party cookies (required for iframe-based SAML session)
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Enable JavaScript and DOM storage
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString(), request.getMethod());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url, "GET");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                // If we landed on Kissflow home/login after SAML, and this is from
                // an iframe-based mobile SSO, the iframe has set the session cookie.
                // The JavaScript setTimeout in the page will handle the redirect.
            }
        });
    }

    private boolean handleUrl(String url, String method) {
        if (!url.contains(KISSFLOW_DOMAIN)) {
            // Not a Kissflow URL - load in WebView (our app URLs)
            return false;
        }

        // SAML ACS URL - MUST load inside WebView (carries POST body for SSO)
        if (url.contains(SAML_ACS_PATH)) {
            return false; // Let WebView handle it
        }

        // Kissflow login page - load in WebView (user may need to see it)
        if (url.contains(SAML_LOGIN_PATH)) {
            return false; // Let WebView handle it
        }

        // Kissflow module/home URLs - open in Kissflow native app if installed
        return openInKissflowApp(url);
    }

    private boolean openInKissflowApp(String url) {
        PackageManager pm = getPackageManager();
        try {
            pm.getPackageInfo(KISSFLOW_PACKAGE, PackageManager.GET_ACTIVITIES);
            // Kissflow app is installed - open it with the URL
            Intent intent = pm.getLaunchIntentForPackage(KISSFLOW_PACKAGE);
            if (intent != null) {
                intent.setAction(Intent.ACTION_VIEW);
                intent.setData(Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);

                // Navigate WebView back to launcher after opening Kissflow app
                WebView webView = getBridge().getWebView();
                webView.post(() -> webView.loadUrl("javascript:window.location.href='/launcher'"));

                return true;
            }
        } catch (PackageManager.NameNotFoundException e) {
            // Kissflow app not installed - open in external browser
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(browserIntent);
            } catch (android.content.ActivityNotFoundException ex) {
                // Can't open browser - let WebView handle it
                return false;
            }

            // Navigate back to launcher
            WebView webView = getBridge().getWebView();
            webView.post(() -> webView.loadUrl("javascript:window.location.href='/launcher'"));

            return true;
        }
        return false;
    }
}
