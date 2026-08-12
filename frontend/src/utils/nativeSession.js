/** Clear Kissflow / WebView sessions on native Android / iOS (RefexOneBridge). */

export const isCapacitorNative = () =>
  typeof window !== 'undefined' &&
  !!(window.Capacitor?.isNativePlatform?.() && window.Capacitor.isNativePlatform());

export const clearKissflowNativeSession = () => {
  try {
    sessionStorage.removeItem('refexone_pending_module');
  } catch (e) {
    // ignore
  }
  try {
    if (window.RefexOneBridge?.clearKissflowSession) {
      window.RefexOneBridge.clearKissflowSession();
    }
  } catch (e) {
    // ignore
  }
};

export const clearNativeAppSession = () => {
  try {
    sessionStorage.clear();
  } catch (e) {
    // ignore
  }
  clearKissflowNativeSession();
  try {
    if (window.RefexOneBridge?.clearAppSession) {
      window.RefexOneBridge.clearAppSession();
    }
  } catch (e) {
    // ignore
  }
};

export const launchUrlAfterKissflowClear = (url, delayMs = 150) => {
  clearKissflowNativeSession();
  setTimeout(() => {
    window.location.href = url;
  }, delayMs);
};

/** Desktop web flow: SSO first (no mobile_module), then module redirect via native bridge. */
export const launchDesktopSsoInWebView = (completeUrl, homeUrl) => {
  clearKissflowNativeSession();
  try {
    if (window.RefexOneBridge?.setPendingModule) {
      window.RefexOneBridge.setPendingModule(homeUrl);
    }
  } catch (e) {
    // ignore
  }
  setTimeout(() => {
    window.location.href = completeUrl;
  }, 150);
};
