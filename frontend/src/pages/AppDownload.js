import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '../config/api';

const REFEX_LOGO = '/refexone-logo.png';
const REFEXONE_QR_IMAGE = '/mobile-app-qr.png';

const detectMobilePlatform = () => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
};

const StoreButton = ({ href, platform }) => {
  if (!href) return null;
  const isIos = platform === 'ios';
  return (
    <a
      href={href}
      className={
        isIos
          ? 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 text-white font-semibold hover:bg-zinc-800 transition-colors w-full sm:w-auto'
          : 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors w-full sm:w-auto'
      }
    >
      {isIos ? 'Download on the App Store' : 'Get it on Google Play'}
    </a>
  );
};

/** Public page for QR scan — redirects phones to the correct store. */
const AppDownload = () => {
  const [links, setLinks] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  const platform = detectMobilePlatform();

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/app-download/links`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        setLinks(data);
        const ios = data.ios_store_url || data.app_store_url;
        const android = data.android_store_url || data.play_store_url;
        if (platform === 'ios' && ios) {
          setRedirecting(true);
          window.location.replace(ios);
        } else if (platform === 'android' && android) {
          setRedirecting(true);
          window.location.replace(android);
        }
      })
      .catch(() => {
        if (!cancelled) setLinks({});
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const iosUrl = links?.ios_store_url || links?.app_store_url || '';
  const androidUrl = links?.android_store_url || links?.play_store_url || '';

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600">Opening {platform === 'ios' ? 'App Store' : 'Google Play'}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <img src={REFEX_LOGO} alt="RefexOne" className="h-10 mx-auto mb-8 object-contain" />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-6">RefexOne Mobile</h1>

          <div className="flex justify-center mb-6">
            <img
              src={REFEXONE_QR_IMAGE}
              alt="Scan to download RefexOne on iOS or Android"
              className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl border border-slate-100 shadow-sm object-contain bg-white p-2"
              data-testid="refexone-qr-image"
            />
          </div>

          <p className="text-xs text-slate-400 mb-5">
            QR opens this page on your phone, then sends you to the App Store or Google Play.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {platform === 'ios' && iosUrl ? (
              <StoreButton href={iosUrl} platform="ios" />
            ) : platform === 'android' && androidUrl ? (
              <StoreButton href={androidUrl} platform="android" />
            ) : (
              <>
                {iosUrl && <StoreButton href={iosUrl} platform="ios" />}
                {androidUrl && <StoreButton href={androidUrl} platform="android" />}
              </>
            )}
          </div>
        </div>

        <Link to="/login" className="inline-block mt-8 text-sm text-emerald-700 hover:text-emerald-800 font-medium">
          Sign in on the web →
        </Link>
      </div>
    </div>
  );
};

export default AppDownload;
export { REFEXONE_QR_IMAGE };
