package com.refex.refexone;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.LayoutInflater;
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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import org.json.JSONObject;

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
    // Debug builds use adb reverse to local API; release uses production.
    private static final String APP_UPDATE_CHECK_URL_PROD =
        "https://refexone.com/api/app-update/check";
    private static final String APP_UPDATE_CHECK_URL_LOCAL =
        "http://127.0.0.1:8000/api/app-update/check";
    private static final long MODULE_REDIRECT_DELAY_MS = 2000;

    private static final String[] KISSFLOW_COOKIE_ORIGINS = {
        "https://kissflow.com",
        "https://www.kissflow.com",
        "https://refexgroup.kissflow.com",
    };

    private LinearLayout closeBar;
    private LinearLayout contentHost;
    private View backChip;
    private View refreshButton;
    private View refreshChip;
    private View pageLoader;
    private TextView closeSubtitle;
    private TextView brandTitle;
    private int closeBarHeightPx;
    private int compactBarHeightPx;
    private String pendingModuleUrl;
    private boolean pendingHistoryClear;
    private boolean moduleRedirectScheduled;
    private boolean pageRefreshPending;
    private Runnable hidePageLoaderRunnable;
    private View contentRoot;
    private boolean webViewClientAttached;
    private boolean forceUpdateBlocking;
    private AlertDialog updateDialog;
    private int lastStatusBarInset = 0;
    private int lastNavBarInset = 0;
    private CloseBarMode currentCloseBarMode = CloseBarMode.HIDDEN;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(isDebuggable);
        closeBarHeightPx = Math.round(64 * getResources().getDisplayMetrics().density);
        compactBarHeightPx = Math.round(56 * getResources().getDisplayMetrics().density);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applySystemBarPalette(CloseBarMode.HIDDEN);

        contentRoot = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (v, insets) -> {
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets navBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            lastStatusBarInset = statusBars.top;
            lastNavBarInset = navBars.bottom;
            applyContentRootPadding();
            // Consume top insets so WebView CSS does not double-pad under the status bar.
            // Keep navigation insets zeroed for Refex pages (we pad the container instead).
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(contentRoot);
        checkForAppUpdate();
    }

    /** Keep WebView clear of status + system nav bars (launcher and Kissflow). */
    private void applyContentRootPadding() {
        if (contentRoot == null) return;
        contentRoot.setPadding(0, lastStatusBarInset, 0, lastNavBarInset);
    }

    private int currentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    private void checkForAppUpdate() {
        final int build = currentVersionCode();
        Executors.newSingleThreadExecutor().execute(() -> {
            HttpURLConnection conn = null;
            try {
                String checkUrl = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
                    ? APP_UPDATE_CHECK_URL_LOCAL
                    : APP_UPDATE_CHECK_URL_PROD;
                String requestUrl = checkUrl + "?platform=android&build=" + build;
                Log.i("RefexOne", "App update check: " + requestUrl);
                URL url = new URL(requestUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setRequestMethod("GET");
                int code = conn.getResponseCode();
                Log.i("RefexOne", "App update check HTTP " + code);
                if (code < 200 || code >= 300) return;
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                Log.i("RefexOne", "App update check body: " + sb);
                JSONObject json = new JSONObject(sb.toString());
                runOnUiThread(() -> presentUpdateDialog(json));
            } catch (Exception e) {
                Log.e("RefexOne", "App update check failed: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private void presentUpdateDialog(JSONObject json) {
        if (isFinishing() || isDestroyed()) return;
        try {
            if (!json.optBoolean("enabled", false)) return;
            boolean force = json.optBoolean("force_update", false);
            boolean available = json.optBoolean("update_available", false) || force;
            if (!available) {
                forceUpdateBlocking = false;
                return;
            }

            String title = json.optString(
                "title",
                force ? "Update required" : "Update available"
            );
            String message = json.optString(
                "message",
                "A new version of RefexOne is available."
            );
            String storeUrl = json.optString(
                "store_url",
                "https://play.google.com/store/apps/details?id=com.refex.refexone"
            );
            int currentBuild = json.optInt("current_build", currentVersionCode());
            int latestBuild = json.optInt("latest_build", 0);

            if (updateDialog != null && updateDialog.isShowing()) {
                updateDialog.dismiss();
            }

            View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_app_update, null);
            TextView badge = dialogView.findViewById(R.id.update_badge);
            TextView titleView = dialogView.findViewById(R.id.update_title);
            TextView messageView = dialogView.findViewById(R.id.update_message);
            TextView metaView = dialogView.findViewById(R.id.update_meta);
            TextView positive = dialogView.findViewById(R.id.update_positive);
            TextView negative = dialogView.findViewById(R.id.update_negative);

            titleView.setText(title);
            messageView.setText(message);

            if (force) {
                badge.setText("Required update");
                badge.setTextColor(0xFFB91C1C);
                badge.setBackgroundResource(R.drawable.dialog_update_badge_force);
                negative.setVisibility(View.GONE);
                forceUpdateBlocking = true;
            } else {
                badge.setText("Optional update");
                badge.setTextColor(0xFF047857);
                badge.setBackgroundResource(R.drawable.dialog_update_badge_optional);
                negative.setVisibility(View.VISIBLE);
                forceUpdateBlocking = false;
            }

            if (latestBuild > 0) {
                metaView.setVisibility(View.VISIBLE);
                metaView.setText("Your build " + currentBuild + "  ·  Latest " + latestBuild);
            } else {
                metaView.setVisibility(View.GONE);
            }

            AlertDialog.Builder builder = new AlertDialog.Builder(this, R.style.AppUpdateDialogTheme)
                .setView(dialogView)
                .setCancelable(!force);

            updateDialog = builder.create();
            if (updateDialog.getWindow() != null) {
                updateDialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
            }
            updateDialog.setCanceledOnTouchOutside(!force);

            positive.setOnClickListener(v -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl)));
                } catch (Exception ignored) {
                }
                if (force) {
                    forceUpdateBlocking = true;
                    updateDialog.dismiss();
                    getWindow().getDecorView().postDelayed(this::checkForAppUpdate, 600);
                } else {
                    updateDialog.dismiss();
                }
            });

            negative.setOnClickListener(v -> {
                forceUpdateBlocking = false;
                updateDialog.dismiss();
            });

            updateDialog.show();
        } catch (Exception e) {
            Log.w("RefexOne", "Failed to show update dialog", e);
        }
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
    public void onResume() {
        super.onResume();
        if (forceUpdateBlocking) {
            checkForAppUpdate();
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
        // Do not rewrite Kissflow/Lead Tracker page scripts — keep original web behavior.
        settings.setSupportMultipleWindows(false);

        webView.addJavascriptInterface(new RefexOneBridge(), "RefexOneBridge");
        setupCloseBar(webView);

        if (webViewClientAttached) return;
        webViewClientAttached = true;

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                captureModuleFromUrl(url);
                if (isSamlCompleteUrl(url)) {
                    clearKissflowCookiesOnly(view);
                } else if (isRefexOneLoginUrl(url)) {
                    // Do NOT clearAppSession here — a failed Kissflow SSO may redirect to
                    // /login?sso_app=... while the user is still logged into RefexOne.
                    // Wiping localStorage forced a real login screen until logout.
                    bounceAuthenticatedUserOffLogin(view, url);
                } else if (isKissflowLoginUrl(url)) {
                    // Kissflow SSO failed (landed on KF login) → back to RefexOne home
                    returnToLauncher(view);
                }
                updateCloseBar(view, url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (isRefexOneLoginUrl(url)) {
                    bounceAuthenticatedUserOffLogin(view, url);
                } else if (isKissflowLoginUrl(url)) {
                    returnToLauncher(view);
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
                scheduleHidePageLoader(view);
                captureModuleFromUrl(url);
                clearWebHistoryIfNeeded(view, url);
                checkSessionStorageModule(view, url, () -> {
                    maybeRedirectToPendingModule(view, url);
                    updateCloseBar(view, url);
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
        refreshChip = closeBar.findViewById(R.id.in_app_refresh_chip);
        refreshButton = closeBar.findViewById(R.id.in_app_refresh_button);

        backChip.setOnClickListener(v -> returnToLauncher(webView));
        View.OnClickListener reload = v -> {
            if (webView == null || pageRefreshPending) return;
            showPageLoader();
            webView.reload();
        };
        if (refreshChip != null) refreshChip.setOnClickListener(reload);
        if (refreshButton != null) refreshButton.setOnClickListener(reload);

        closeBar.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            compactBarHeightPx
        ));
        closeBar.setVisibility(View.GONE);
        closeBar.setElevation(4f * getResources().getDisplayMetrics().density);

        FrameLayout pageHost = new FrameLayout(this);
        pageHost.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        pageLoader = LayoutInflater.from(this)
            .inflate(R.layout.in_app_page_loader, pageHost, false);
        pageLoader.setVisibility(View.GONE);

        pageHost.addView(webView);
        pageHost.addView(pageLoader);

        contentHost.addView(closeBar);
        contentHost.addView(pageHost);
        parent.addView(contentHost, webIndex);
    }

    private void showPageLoader() {
        pageRefreshPending = true;
        if (hidePageLoaderRunnable != null && pageLoader != null) {
            pageLoader.removeCallbacks(hidePageLoaderRunnable);
            hidePageLoaderRunnable = null;
        }
        if (pageLoader != null) {
            pageLoader.setVisibility(View.VISIBLE);
            pageLoader.bringToFront();
        }
        if (refreshChip != null) refreshChip.setEnabled(false);
        if (refreshButton != null) refreshButton.setEnabled(false);
    }

    private void scheduleHidePageLoader(WebView view) {
        if (!pageRefreshPending || pageLoader == null) return;
        if (hidePageLoaderRunnable != null) {
            pageLoader.removeCallbacks(hidePageLoaderRunnable);
        }
        // Brief delay so the first paint isn't flashed behind the overlay removal
        hidePageLoaderRunnable = this::hidePageLoader;
        pageLoader.postDelayed(hidePageLoaderRunnable, 350);
    }

    private void hidePageLoader() {
        pageRefreshPending = false;
        hidePageLoaderRunnable = null;
        if (pageLoader != null) {
            pageLoader.setVisibility(View.GONE);
        }
        if (refreshChip != null) refreshChip.setEnabled(true);
        if (refreshButton != null) refreshButton.setEnabled(true);
    }

    private void returnToLauncher(WebView webView) {
        pendingModuleUrl = null;
        moduleRedirectScheduled = false;
        pendingHistoryClear = true;
        hidePageLoader();
        clearKissflowSession(webView);
        webView.loadUrl(LAUNCHER_URL);
        setCloseBarVisible(webView, false, null);
    }

    /**
     * If RefexOne still has iam_token, never stay on /login — send user to launcher.
     * Session is cleared only on explicit Sign Out (JS logout / clearAppSession bridge).
     *
     * Exception: /login?oidc_redirect=... or /login?sso_app=... must reach the web Login
     * page so OIDC (Feast/RefexQR) and SAML can resume with the existing token — same as Chrome.
     * Interrupting that bounce is what broke OIDC in the Android app while web still worked.
     */
    private void bounceAuthenticatedUserOffLogin(WebView webView, String url) {
        if (webView == null || !isRefexOneLoginUrl(url)) return;
        // Allow forcing the login screen after real logout
        if (url.contains("force_login=1") || url.contains("logged_out=1")) {
            return;
        }
        // Do not interrupt SSO resume flows (Feast / RefexQR OIDC, SAML)
        if (url.contains("oidc_redirect=") || url.contains("sso_app=")) {
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return localStorage.getItem('iam_token')||'';}catch(e){return ''}})()",
            value -> {
                String token = unwrapJsString(value);
                if (token == null || token.isEmpty()) {
                    return;
                }
                pendingModuleUrl = null;
                moduleRedirectScheduled = false;
                pendingHistoryClear = true;
                webView.loadUrl(LAUNCHER_URL);
                setCloseBarVisible(webView, false, null);
            }
        );
    }

    private boolean isKissflowLoginUrl(String url) {
        if (url == null || !url.contains(KISSFLOW_DOMAIN)) return false;
        // Successful SSO posts to ACS under /signin/.../saml — never treat as failure
        if (url.contains(SAML_ACS_PATH) || url.contains("/saml")) return false;
        try {
            String path = Uri.parse(url).getPath();
            if (path == null) return false;
            String p = path.toLowerCase();
            return p.contains("/view/login") || p.equals("/login") || p.endsWith("/login");
        } catch (Exception e) {
            return url.contains(SAML_LOGIN_PATH);
        }
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
        currentCloseBarMode = mode;
        applyContentRootPadding();
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
                brandTitle.setTextColor(0xFF065F46);
                brandTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
                if (refreshChip != null) refreshChip.setVisibility(View.VISIBLE);
            } else {
                closeBar.setBackgroundResource(R.drawable.in_app_toolbar_bg);
                closeSubtitle.setVisibility(View.VISIBLE);
                brandTitle.setText(getString(R.string.app_name));
                brandTitle.setTextColor(0xFF0F172A);
                brandTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                if (url != null) {
                    closeSubtitle.setText(resolveSubtitle(url));
                }
                // Keep refresh during SSO/full bar as well
                if (refreshChip != null) refreshChip.setVisibility(View.VISIBLE);
            }
        }
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
