package com.refex.refexone;

import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebBackForwardList;
import android.webkit.WebStorage;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Launched apps open inside the WebView with a top close bar.
 * After SAML SSO, redirects to the specific module URL (Expense Management, etc.).
 */
public class MainActivity extends BridgeActivity {

    private static final String APP_HOST = "refexone.com";
    private static final String KISSFLOW_DOMAIN = "kissflow.com";
    private static final String LAUNCHER_URL = "https://refexone.com/launcher";
    private static final String SAML_ACS_PATH = "/signin/";
    private static final String SAML_LOGIN_PATH = "/view/login";
    private static final long MODULE_REDIRECT_DELAY_MS = 2000;

    private static final String[] KISSFLOW_COOKIE_ORIGINS = {
        "https://kissflow.com",
        "https://www.kissflow.com",
        "https://refexgroup.kissflow.com",
    };

    private LinearLayout closeBar;
    private TextView closeSubtitle;
    private int closeBarHeightPx;
    private String pendingModuleUrl;
    private boolean pendingHistoryClear;
    private boolean moduleRedirectScheduled;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(isDebuggable);
        closeBarHeightPx = Math.round(64 * getResources().getDisplayMetrics().density);

        // Android 15+ (targetSdk 35) enforces edge-to-edge, drawing the WebView under the
        // status/nav bars. Pad the WebView's container by the system bar insets on both
        // edges so app content (header avatar, floating chat button, etc.) is never
        // hidden behind the status bar or the 3-button/gesture nav bar.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View contentRoot = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, systemBars.top, 0, systemBars.bottom);
            return insets;
        });
    }

    @Override
    public void onStart() {
        super.onStart();

        WebView webView = getBridge().getWebView();

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        webView.addJavascriptInterface(new RefexOneBridge(), "RefexOneBridge");
        setupCloseBar(webView);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                captureModuleFromUrl(url);
                if (isSamlCompleteUrl(url)) {
                    clearKissflowCookiesOnly(view);
                } else if (isRefexOneLoginUrl(url)) {
                    clearAppSession(view);
                }
                hideKissflowOwnHeader(view, url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (isRefexOneLoginUrl(url)) {
                    clearAppSession(view);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                captureModuleFromUrl(request.getUrl().toString());
                return false; // keep navigation in-app
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                captureModuleFromUrl(url);
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                captureModuleFromUrl(url);
                clearWebHistoryIfNeeded(view, url);
                checkSessionStorageModule(view, url, () -> {
                    maybeRedirectToPendingModule(view, url);
                    updateCloseBar(view, url);
                });
                hideKissflowOwnHeader(view, url);
            }
        });
    }

    private void hideKissflowOwnHeader(WebView view, String url) {
        if (url == null || !url.contains(KISSFLOW_DOMAIN)) return;
        // Kissflow's in-page app bar (back/hamburger/title) duplicates our native close
        // bar. Its class names are CSS-module hashed per build (e.g.
        // "navBarParentContainer--b8b7c85a1d9560dc"), so match on the stable name prefix
        // rather than the hash suffix, which can change on Kissflow's end.
        view.evaluateJavascript(
            "(function(){try{" +
            "if(document.getElementById('refexone-hide-kf-header'))return;" +
            "var style=document.createElement('style');" +
            "style.id='refexone-hide-kf-header';" +
            "style.textContent='[class*=\"navBarParentContainer\"]{display:none !important;}';" +
            "(document.head||document.documentElement).appendChild(style);" +
            "}catch(e){}})()",
            null
        );
    }

    private void captureModuleFromUrl(String url) {
        if (url == null || !url.contains("/api/saml/")) return;
        try {
            String module = Uri.parse(url).getQueryParameter("mobile_module");
            if (module != null && !module.isEmpty()) {
                pendingModuleUrl = module;
            }
        } catch (Exception ignored) {
        }
    }

    private void checkSessionStorageModule(WebView view, String url, Runnable then) {
        if (!url.contains(KISSFLOW_DOMAIN)) {
            then.run();
            return;
        }
        view.evaluateJavascript(
            "(function(){try{return sessionStorage.getItem('refexone_pending_module')||'';}catch(e){return ''}})()",
            value -> {
                String module = unwrapJsString(value);
                if (module != null && !module.isEmpty()
                    && (pendingModuleUrl == null || pendingModuleUrl.isEmpty())) {
                    pendingModuleUrl = module;
                }
                then.run();
            }
        );
    }

    private String unwrapJsString(String value) {
        if (value == null || value.equals("null") || value.equals("\"\"") || value.isEmpty()) {
            return null;
        }
        String s = value.trim();
        if (s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2) {
            s = s.substring(1, s.length() - 1);
        }
        return s.replace("\\/", "/");
    }

    private void maybeRedirectToPendingModule(WebView view, String url) {
        if (pendingModuleUrl == null || pendingModuleUrl.isEmpty() || url == null) return;
        if (!isKissflowReadyForModuleRedirect(url)) return;

        if (isModuleUrl(url, pendingModuleUrl)) {
            pendingModuleUrl = null;
            moduleRedirectScheduled = false;
            view.evaluateJavascript(
                "try{sessionStorage.removeItem('refexone_pending_module')}catch(e){}", null);
            return;
        }

        if (moduleRedirectScheduled) return;
        moduleRedirectScheduled = true;
        final String target = pendingModuleUrl;
        // Kissflow session is established — brief pause on Kissflow, then open the module
        view.postDelayed(() -> {
            moduleRedirectScheduled = false;
            if (target == null || target.isEmpty() || !target.equals(pendingModuleUrl)) return;
            view.loadUrl(target);
        }, MODULE_REDIRECT_DELAY_MS);
    }

    private boolean isKissflowReadyForModuleRedirect(String url) {
        if (url == null || !url.contains(KISSFLOW_DOMAIN)) return false;
        return !url.contains(SAML_ACS_PATH) && !url.contains(SAML_LOGIN_PATH);
    }

    private boolean isModuleUrl(String current, String target) {
        if (current == null || target == null) return false;
        try {
            String curPath = Uri.parse(current).getPath();
            String tgtPath = Uri.parse(target).getPath();
            if (curPath == null || tgtPath == null) return false;
            return curPath.equals(tgtPath) || curPath.startsWith(tgtPath);
        } catch (Exception e) {
            return current.contains(target);
        }
    }

    private void setupCloseBar(WebView webView) {
        if (closeBar != null) return;

        ViewGroup parent = (ViewGroup) webView.getParent();
        closeBar = (LinearLayout) LayoutInflater.from(this)
            .inflate(R.layout.in_app_close_bar, parent, false);
        closeSubtitle = closeBar.findViewById(R.id.in_app_close_subtitle);
        ImageButton backButton = closeBar.findViewById(R.id.in_app_back_button);

        backButton.setOnClickListener(v -> returnToLauncher(webView));

        CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            closeBarHeightPx
        );
        params.gravity = Gravity.TOP;
        parent.addView(closeBar, params);
    }

    private void returnToLauncher(WebView webView) {
        pendingModuleUrl = null;
        moduleRedirectScheduled = false;
        pendingHistoryClear = true;
        clearKissflowSession(webView);
        webView.loadUrl(LAUNCHER_URL);
        setCloseBarVisible(webView, false, null);
    }

    private boolean isSamlCompleteUrl(String url) {
        return url != null && url.contains("/api/saml/") && url.contains("/complete");
    }

    private boolean isRefexOneLoginUrl(String url) {
        if (!isRefexOneUrl(url)) return false;
        try {
            String path = Uri.parse(url).getPath();
            return path != null && path.startsWith("/login");
        } catch (Exception e) {
            return url.contains("/login");
        }
    }

    private void clearKissflowCookiesOnly(WebView webView) {
        CookieManager cookieManager = CookieManager.getInstance();
        clearKissflowCookies(cookieManager);
        cookieManager.flush();
    }

    private void clearKissflowSession(WebView webView) {
        pendingModuleUrl = null;
        moduleRedirectScheduled = false;
        clearKissflowCookiesOnly(webView);
        if (webView != null) {
            webView.evaluateJavascript(
                "try{sessionStorage.removeItem('refexone_pending_module');}catch(e){}", null);
        }
    }

    private void clearAppSession(WebView webView) {
        pendingModuleUrl = null;
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();
        WebStorage.getInstance().deleteAllData();
        if (webView != null) {
            webView.clearCache(true);
            webView.clearFormData();
            webView.evaluateJavascript(
                "try{localStorage.clear();sessionStorage.clear();}catch(e){}", null);
        }
    }

    private void clearKissflowCookies(CookieManager cookieManager) {
        for (String origin : KISSFLOW_COOKIE_ORIGINS) {
            expireCookiesForOrigin(cookieManager, origin);
        }
        expireCookiesForOrigin(cookieManager, "https://." + KISSFLOW_DOMAIN);
    }

    private void expireCookiesForOrigin(CookieManager cookieManager, String origin) {
        String cookies = cookieManager.getCookie(origin);
        if (cookies == null || cookies.isEmpty()) return;
        for (String part : cookies.split(";")) {
            String name = part.split("=", 2)[0].trim();
            if (!name.isEmpty()) {
                cookieManager.setCookie(origin, name + "=; Max-Age=0; Path=/");
                cookieManager.setCookie(origin,
                    name + "=; Max-Age=0; Path=/; Domain=." + KISSFLOW_DOMAIN);
            }
        }
    }

    private void clearWebHistoryIfNeeded(WebView view, String url) {
        if (!pendingHistoryClear || !isRefexOneLauncherUrl(url)) return;
        pendingHistoryClear = false;
        view.clearHistory();
    }

    private boolean isRefexOneUrl(String url) {
        if (url == null) return false;
        try {
            String host = Uri.parse(url).getHost();
            return host != null && host.contains(APP_HOST);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isRefexOneLauncherUrl(String url) {
        if (!isRefexOneUrl(url)) return false;
        try {
            String path = Uri.parse(url).getPath();
            if (path == null || path.isEmpty() || path.equals("/")) return true;
            return path.startsWith("/launcher");
        } catch (Exception e) {
            return false;
        }
    }

    private boolean wouldBackLeaveRefexOne(WebView webView) {
        if (webView == null || !webView.canGoBack() || !isRefexOneUrl(webView.getUrl())) {
            return false;
        }
        WebBackForwardList list = webView.copyBackForwardList();
        int index = list.getCurrentIndex();
        if (index <= 0) return false;
        String backUrl = list.getItemAtIndex(index - 1).getUrl();
        return backUrl != null && !isRefexOneUrl(backUrl);
    }

    private void updateCloseBar(WebView webView, String url) {
        setCloseBarVisible(webView, shouldShowCloseBar(url), url);
    }

    private void setCloseBarVisible(WebView webView, boolean show, String url) {
        if (closeBar == null) return;
        closeBar.setVisibility(show ? View.VISIBLE : View.GONE);
        webView.setPadding(0, show ? closeBarHeightPx : 0, 0, 0);
        if (show && url != null && closeSubtitle != null) {
            closeSubtitle.setText(resolveSubtitle(url));
        }
    }

    private boolean shouldShowCloseBar(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            if (host == null) return false;
            if (host.contains(APP_HOST)) {
                String path = uri.getPath() != null ? uri.getPath() : "";
                return path.contains("/api/saml/");
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String resolveSubtitle(String url) {
        if (url.contains("/api/saml/")) {
            return getString(R.string.in_app_signing_in);
        }
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath() != null ? uri.getPath() : "";
            if (path.contains("/application/")) {
                String segment = path.substring(path.lastIndexOf("/application/") + 13);
                int slash = segment.indexOf('/');
                if (slash > 0) segment = segment.substring(0, slash);
                return segment.replace('_', ' ');
            }
            if (uri.getHost() != null && uri.getHost().contains(KISSFLOW_DOMAIN)) {
                return "Kissflow";
            }
        } catch (Exception ignored) {
        }
        return getString(R.string.in_app_application);
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        // After toolbar ←, history is cleared; never hardware-back into Kissflow from RefexOne
        if (webView != null && wouldBackLeaveRefexOne(webView)) {
            webView.clearHistory();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private class RefexOneBridge {
        @JavascriptInterface
        public void setPendingModule(String url) {
            if (url != null && !url.isEmpty()) {
                pendingModuleUrl = url;
            }
        }

        @JavascriptInterface
        public void clearKissflowSession() {
            runOnUiThread(() ->
                MainActivity.this.clearKissflowSession(getBridge().getWebView()));
        }

        @JavascriptInterface
        public void clearAppSession() {
            runOnUiThread(() ->
                MainActivity.this.clearAppSession(getBridge().getWebView()));
        }
    }
}
