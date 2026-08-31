import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { API } from '../config/api';

export const REFEXONE_QR_IMAGE = '/mobile-app-qr.png';
export const REFEXONE_DOWNLOAD_PATH = '/download';

const QR_COPY = {
  title: 'RefexOne Mobile',
  hint: 'iOS & Android',
};

const isNativeShell = () =>
  typeof window !== 'undefined' &&
  (!!window.RefexOneBridge ||
    !!(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform()));

const detectMobilePlatform = () => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
};

const AppCenterFallback = () => (
  <div className="flex items-center gap-4">
    <div className="w-14 h-14 rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm">
      <LayoutGrid size={24} className="text-emerald-600" strokeWidth={2} />
    </div>
    <div>
      <h1 className="font-heading text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight leading-none">App Center</h1>
      <p className="text-slate-500 text-sm mt-1.5 font-medium">Enterprise Application Hub</p>
    </div>
  </div>
);

const StoreBadge = ({ href, platform, compact = false }) => {
  if (!href) return null;
  const isIos = platform === 'ios';
  const pad = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition-colors ${pad} ${
        isIos ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'
      }`}
      data-testid={isIos ? 'refexone-app-store-link' : 'refexone-play-store-link'}
    >
      {isIos ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3.18 23.76c.47.28 1.02.22 1.44-.1l12.9-7.45c.38-.22.38-.78 0-1l-12.9-7.45c-.42-.32-.97-.38-1.44-.1-.47.28-.76.8-.76 1.36v14.88c0 .56.29 1.08.76 1.36zM5 4.74l10.5 6.08L5 16.9V4.74z" />
        </svg>
      )}
      {isIos ? 'App Store' : 'Google Play'}
    </a>
  );
};

const QrBlock = ({ size = 'md', caption }) => {
  const sizeClass = size === 'sm' ? 'w-16 h-16' : size === 'lg' ? 'w-24 h-24' : 'w-20 h-20';
  const defaultCaption = caption ?? 'Scan to download';
  return (
    <Link
      to={REFEXONE_DOWNLOAD_PATH}
      className="block shrink-0 rounded-xl border border-slate-200 bg-white p-1.5 hover:border-emerald-300 hover:shadow-sm transition-all"
      title={QR_COPY.title}
      data-testid="refexone-qr-link"
    >
      <img
        src={REFEXONE_QR_IMAGE}
        alt={QR_COPY.title}
        className={`${sizeClass} object-contain mx-auto`}
      />
      {defaultCaption && (
        <p className="text-[10px] text-center text-slate-400 mt-0.5 leading-tight">{defaultCaption}</p>
      )}
    </Link>
  );
};

/**
 * RefexOne mobile download — store URLs from GET /api/app-download/links + branded QR.
 * variant: "hero" (launcher banner left) | "launcher" (mobile strip)
 */
const RefexOneAppDownload = ({ variant = 'launcher', className = '' }) => {
  const [links, setLinks] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isNativeShell()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    axios
      .get(`${API}/app-download/links`)
      .then((res) => {
        if (!cancelled) setLinks(res.data || {});
      })
      .catch(() => {
        if (!cancelled) setLinks({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const iosUrl = links?.ios_store_url || links?.app_store_url || '';
  const androidUrl = links?.android_store_url || links?.play_store_url || '';
  const mobilePlatform = detectMobilePlatform();
  const showQr = !mobilePlatform;

  if (variant === 'hero') {
    if (isNativeShell() || loading || (!iosUrl && !androidUrl)) {
      return <AppCenterFallback />;
    }

    return (
      <div className={`flex items-center gap-3 shrink-0 ${className}`} data-testid="refexone-app-download-hero">
        <QrBlock size="lg" caption="" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-snug tracking-tight">{QR_COPY.title}</p>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">{QR_COPY.hint}</p>
        </div>
      </div>
    );
  }

  if (isNativeShell() || loading) return null;
  if (!iosUrl && !androidUrl) return null;

  const storeButtons =
    mobilePlatform === 'ios' && iosUrl ? (
      <StoreBadge href={iosUrl} platform="ios" />
    ) : mobilePlatform === 'android' && androidUrl ? (
      <StoreBadge href={androidUrl} platform="android" />
    ) : (
      <>
        {iosUrl && <StoreBadge href={iosUrl} platform="ios" />}
        {androidUrl && <StoreBadge href={androidUrl} platform="android" />}
      </>
    );

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-emerald-200/80 bg-white/70 backdrop-blur-sm ${className}`}
      data-testid="refexone-app-download-launcher"
    >
      <div className="flex items-center gap-3 min-w-0">
        {showQr && <QrBlock size="sm" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{QR_COPY.title}</p>
          <p className="text-xs text-emerald-700 font-medium">{QR_COPY.hint}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">{storeButtons}</div>
    </div>
  );
};

export default RefexOneAppDownload;
