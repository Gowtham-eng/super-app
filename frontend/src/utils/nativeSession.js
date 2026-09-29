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

export const ADRENALIN_ANDROID_PACKAGE = 'com.myadrenalin.max2';
export const ADRENALIN_SCHEME = 'adrmax2scheme://';
export const ADRENALIN_PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.myadrenalin.max2';

/** Open native Adrenalin MAX 2. Returns true when a native/intent launch was started. */
export const openAdrenalinNativeApp = () => {
  try {
    if (window.RefexOneBridge?.openAdrenalinApp) {
      window.RefexOneBridge.openAdrenalinApp();
      return true;
    }
  } catch (e) {
    // fall through to scheme / intent
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  try {
    if (isAndroid) {
      window.location.href =
        `intent://#Intent;scheme=adrmax2scheme;package=${ADRENALIN_ANDROID_PACKAGE}`
        + `;S.browser_fallback_url=${encodeURIComponent(ADRENALIN_PLAY_STORE)};end`;
      return true;
    }
    if (isIOS) {
      window.location.href = ADRENALIN_SCHEME;
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
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
