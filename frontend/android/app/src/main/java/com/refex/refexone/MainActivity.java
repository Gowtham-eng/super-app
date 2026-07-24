package com.refex.refexone;

import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebBackForwardList;
import android.webkit.WebStorage;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
    private LinearLayout contentHost;
    private View backChip;
    private TextView closeSubtitle;
    private TextView brandTitle;
    private int closeBarHeightPx;
    private int compactBarHeightPx;
    private String pendingModuleUrl;
    private boolean pendingHistoryClear;
    private boolean moduleRedirectScheduled;
    private View contentRoot;
    private SwipeRefreshLayout swipeRefreshLayout;
    private boolean webContentAtTop = true;
    private boolean webViewClientAttached;
    private Runnable pullRefreshFallbackRunnable;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(isDebuggable);
        closeBarHeightPx = Math.round(64 * getResources().getDisplayMetrics().density);
        compactBarHeightPx = Math.round(48 * getResources().getDisplayMetrics().density);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applySystemBarPalette(CloseBarMode.HIDDEN);

        contentRoot = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (v, insets) -> {
            // Pad only the status bar at the top. Bottom inset padding left a visible
            // gap under the WebView; Kissflow and the launcher handle their own footers.
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            v.setPadding(0, statusBars.top, 0, 0);
            return insets;
        });
        ViewCompat.requestApplyInsets(contentRoot);
    }

    private void applySystemBarPalette(CloseBarMode mode) {
        Window window = getWindow();
        int statusColor = getColor(R.color.refex_emerald_50);
        if (mode == CloseBarMode.FULL) {
            statusColor = getColor(R.color.refex_white);
        }

        window.setStatusBarColor(statusColor);
        window.setNavigationBarColor(getColor(R.color.refex_white));

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
        }

        window.getDecorView().setBackgroundColor(getColor(R.color.refex_emerald_50));
        if (contentRoot != null) {
            contentRoot.setBackgroundColor(statusColor);
        }
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
        setupPullToRefresh(webView);

        if (webViewClientAttached) return;
        webViewClientAttached = true;

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                captureModuleFromUrl(url);
                if (isSamlCompleteUrl(url)) {
                    clearKissflowCookiesOnly(view);
                } else if (isRefexOneLoginUrl(url)) {
                    clearAppSession(view);
                }
                updateCloseBar(view, url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (isRefexOneLoginUrl(url)) {
                    clearAppSession(view);
                }
                updateCloseBar(view, url);
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
                injectPullRefreshSupport(view);
                captureModuleFromUrl(url);
                clearWebHistoryIfNeeded(view, url);
                checkSessionStorageModule(view, url, () -> {
                    maybeRedirectToPendingModule(view, url);
                    updateCloseBar(view, url);
                    stopPullRefresh();
                });
            }
        });
    }

    private enum CloseBarMode { HIDDEN, COMPACT, FULL }

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
        int webIndex = parent.indexOfChild(webView);
        CoordinatorLayout.LayoutParams coordinatorParams =
            (CoordinatorLayout.LayoutParams) webView.getLayoutParams();

        parent.removeView(webView);

        contentHost = new LinearLayout(this);
        contentHost.setOrientation(LinearLayout.VERTICAL);
        contentHost.setLayoutParams(coordinatorParams);

        closeBar = (LinearLayout) LayoutInflater.from(this)
            .inflate(R.layout.in_app_close_bar, contentHost, false);
        closeSubtitle = closeBar.findViewById(R.id.in_app_close_subtitle);
        brandTitle = closeBar.findViewById(R.id.in_app_brand_title);
        backChip = closeBar.findViewById(R.id.in_app_back_chip);

        backChip.setOnClickListener(v -> returnToLauncher(webView));

        closeBar.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            compactBarHeightPx
        ));
        closeBar.setVisibility(View.GONE);
        closeBar.setElevation(4f * getResources().getDisplayMetrics().density);

        webView.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        contentHost.addView(closeBar);
        contentHost.addView(webView);
        parent.addView(contentHost, webIndex);
    }

    private void setupPullToRefresh(WebView webView) {
        if (swipeRefreshLayout != null || contentHost == null) return;

        contentHost.removeView(webView);

        swipeRefreshLayout = new SwipeRefreshLayout(this);
        swipeRefreshLayout.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));
        swipeRefreshLayout.setColorSchemeColors(0xFF10B981, 0xFF059669);

        int statusTop = contentRoot != null ? contentRoot.getPaddingTop() : 0;
        int endOffset = statusTop + Math.round(48 * getResources().getDisplayMetrics().density);
        swipeRefreshLayout.setProgressViewOffset(false, statusTop, endOffset);
        swipeRefreshLayout.setOnChildScrollUpCallback((parentLayout, child) -> !webContentAtTop);
        swipeRefreshLayout.setOnRefreshListener(() -> handlePullToRefresh(webView));

        webView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        swipeRefreshLayout.addView(webView);
        contentHost.addView(swipeRefreshLayout);

        setupWebViewPullTouch(webView);
    }

    private void setupWebViewPullTouch(WebView webView) {
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setOnTouchListener((v, event) -> {
            if (swipeRefreshLayout == null) return false;
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_MOVE) {
                swipeRefreshLayout.requestDisallowInterceptTouchEvent(!webContentAtTop);
            }
            return false;
        });
    }

    private void injectPullRefreshSupport(WebView view) {
        if (view == null) return;
        view.evaluateJavascript(
            "(function(){try{" +
            "function atTop(){var y=window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0;" +
            "if(y>2)return false;var nodes=document.querySelectorAll('main,[data-scroll-root]');" +
            "for(var i=0;i<nodes.length;i++){if(nodes[i].scrollTop>2)return false;}return true;}" +
            "function report(){try{if(window.RefexOneBridge&&RefexOneBridge.setWebContentAtTop){" +
            "RefexOneBridge.setWebContentAtTop(atTop());}}catch(e){}}" +
            "if(!window.__refexoneScrollHook){window.__refexoneScrollHook=true;" +
            "window.addEventListener('scroll',report,{passive:true,capture:true});" +
            "document.addEventListener('scroll',report,{passive:true,capture:true});}" +
            "report();}catch(e){}})()",
            null
        );
    }

    private void handlePullToRefresh(WebView webView) {
        if (webView == null) {
            stopPullRefresh();
            return;
        }
        if (pullRefreshFallbackRunnable != null) {
            webView.removeCallbacks(pullRefreshFallbackRunnable);
            pullRefreshFallbackRunnable = null;
        }

        String url = webView.getUrl();
        if (url != null && isRefexOneUrl(url) && !url.contains("/api/saml/")) {
            webView.evaluateJavascript(
                "try{window.dispatchEvent(new CustomEvent('refexone-pull-refresh'));}catch(e){}",
                null
            );
            pullRefreshFallbackRunnable = () -> {
                pullRefreshFallbackRunnable = null;
                if (swipeRefreshLayout != null && swipeRefreshLayout.isRefreshing()) {
                    webView.reload();
                }
            };
            webView.postDelayed(pullRefreshFallbackRunnable, 900);
            return;
        }
        webView.reload();
    }

    private void stopPullRefresh() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null && pullRefreshFallbackRunnable != null) {
            webView.removeCallbacks(pullRefreshFallbackRunnable);
            pullRefreshFallbackRunnable = null;
        }
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setRefreshing(false);
        }
    }

    private void updatePullToRefreshState(String url) {
        if (swipeRefreshLayout == null) return;
        boolean enabled = url == null || !url.contains("/api/saml/");
        swipeRefreshLayout.setEnabled(enabled);
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
        updatePullToRefreshState(url);
        setCloseBarMode(webView, getCloseBarMode(url), url);
    }

    private CloseBarMode getCloseBarMode(String url) {
        if (url == null || url.isEmpty()) return CloseBarMode.HIDDEN;
        if (isKissflowUrl(url) && isKissflowReadyForModuleRedirect(url)) {
            return CloseBarMode.COMPACT;
        }
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            if (host == null) return CloseBarMode.HIDDEN;
            if (host.contains(APP_HOST)) {
                String path = uri.getPath() != null ? uri.getPath() : "";
                return path.contains("/api/saml/") ? CloseBarMode.FULL : CloseBarMode.HIDDEN;
            }
            return CloseBarMode.FULL;
        } catch (Exception e) {
            return CloseBarMode.HIDDEN;
        }
    }

    private void setCloseBarMode(WebView webView, CloseBarMode mode, String url) {
        if (closeBar == null) return;

        if (mode == CloseBarMode.HIDDEN) {
            closeBar.setVisibility(View.GONE);
            applySystemBarPalette(CloseBarMode.HIDDEN);
            return;
        }

        closeBar.setVisibility(View.VISIBLE);
        applySystemBarPalette(mode);
        int barHeight = mode == CloseBarMode.COMPACT ? compactBarHeightPx : closeBarHeightPx;
        ViewGroup.LayoutParams barParams = closeBar.getLayoutParams();
        barParams.height = barHeight;
        closeBar.setLayoutParams(barParams);

        if (brandTitle != null && closeSubtitle != null) {
            if (mode == CloseBarMode.COMPACT) {
                closeBar.setBackgroundResource(R.drawable.in_app_toolbar_bg_compact);
                closeSubtitle.setVisibility(View.GONE);
                brandTitle.setText(getString(R.string.back_to_app_center));
                brandTitle.setTextColor(0xFF047857);
                brandTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            } else {
                closeBar.setBackgroundResource(R.drawable.in_app_toolbar_bg);
                closeSubtitle.setVisibility(View.VISIBLE);
                brandTitle.setText(getString(R.string.app_name));
                brandTitle.setTextColor(0xFF0F172A);
                brandTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                if (url != null) {
                    closeSubtitle.setText(resolveSubtitle(url));
                }
            }
        }

        if (mode == CloseBarMode.COMPACT && url != null) {
            webView.postDelayed(() -> trimKissflowChromeGap(webView), 300);
        }
    }

    private void trimKissflowChromeGap(WebView view) {
        if (view == null) return;
        view.evaluateJavascript(
            "(function(){try{" +
            "var s=document.getElementById('refexone-kf-trim-gap');" +
            "if(!s){s=document.createElement('style');s.id='refexone-kf-trim-gap';" +
            "(document.head||document.documentElement).appendChild(s);}" +
            "s.textContent=" +
            "'html,body,#root,#app{padding-top:0!important;margin-top:0!important;padding-bottom:0!important;margin-bottom:0!important;}'" +
            "+'[class*=\"navBarParentContainer\"]{margin-top:0!important;padding-top:0!important;}'" +
            "+'[class*=\"safeArea\"],[class*=\"SafeArea\"]{padding-top:0!important;margin-top:0!important;padding-bottom:0!important;margin-bottom:0!important;}'" +
            "+'[class*=\"bottomNav\"],[class*=\"BottomNav\"],[class*=\"footerContainer\"]{margin-bottom:0!important;}';" +
            "}catch(e){}})()",
            null
        );
    }

    private void setCloseBarVisible(WebView webView, boolean show, String url) {
        setCloseBarMode(webView, show ? CloseBarMode.FULL : CloseBarMode.HIDDEN, url);
    }

    private boolean isKissflowUrl(String url) {
        if (url == null) return false;
        try {
            String host = Uri.parse(url).getHost();
            return host != null && host.contains(KISSFLOW_DOMAIN);
        } catch (Exception e) {
            return url.contains(KISSFLOW_DOMAIN);
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
        String url = webView != null ? webView.getUrl() : null;
        // After toolbar ←, history is cleared; never hardware-back into Kissflow from RefexOne
        if (webView != null && wouldBackLeaveRefexOne(webView)) {
            webView.clearHistory();
            return;
        }
        // Kissflow: hardware back navigates within app; toolbar ← returns to RefexOne launcher
        if (webView != null && isKissflowUrl(url)) {
            if (webView.canGoBack()) {
                WebBackForwardList list = webView.copyBackForwardList();
                int idx = list.getCurrentIndex();
                if (idx > 0) {
                    String backUrl = list.getItemAtIndex(idx - 1).getUrl();
                    if (backUrl != null && (isRefexOneUrl(backUrl) || backUrl.contains("/api/saml/"))) {
                        returnToLauncher(webView);
                        return;
                    }
                }
                webView.goBack();
            } else {
                returnToLauncher(webView);
            }
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
        public void setWebContentAtTop(boolean atTop) {
            webContentAtTop = atTop;
        }

        @JavascriptInterface
        public void onPullRefreshComplete() {
            runOnUiThread(() -> MainActivity.this.stopPullRefresh());
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
