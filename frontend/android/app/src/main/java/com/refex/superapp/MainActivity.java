package com.refex.superapp;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String KISSFLOW_PACKAGE = "com.orangescape.kfdw";
    private static final String KISSFLOW_DOMAIN = "kissflow.com";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();

        // Override WebView to intercept Kissflow URLs
        WebView webView = getBridge().getWebView();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();

                // Intercept Kissflow URLs and open in native app
                if (url.contains(KISSFLOW_DOMAIN)) {
                    return openInKissflowApp(url);
                }

                // Allow our own app URLs to load in WebView
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.contains(KISSFLOW_DOMAIN)) {
                    return openInKissflowApp(url);
                }
                return false;
            }
        });
    }

    private boolean openInKissflowApp(String url) {
        // Check if Kissflow app is installed
        PackageManager pm = getPackageManager();
        try {
            pm.getPackageInfo(KISSFLOW_PACKAGE, PackageManager.GET_ACTIVITIES);
            // Kissflow app is installed - open it
            Intent intent = pm.getLaunchIntentForPackage(KISSFLOW_PACKAGE);
            if (intent != null) {
                // Try to pass the URL as data for deep-linking
                intent.setAction(Intent.ACTION_VIEW);
                intent.setData(Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            }
        } catch (PackageManager.NameNotFoundException e) {
            // Kissflow app not installed - open Play Store
            try {
                Intent storeIntent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=" + KISSFLOW_PACKAGE));
                storeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(storeIntent);
            } catch (android.content.ActivityNotFoundException ex) {
                // No Play Store - open in browser
                Intent browserIntent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + KISSFLOW_PACKAGE));
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(browserIntent);
            }
            return true;
        }
        return false;
    }
}
