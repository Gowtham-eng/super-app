import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { launchUrlAfterKissflowClear } from '../utils/nativeSession';
import { BACKEND_ORIGIN, ITSM_API } from '../config/api';
import RefexOneAppDownload from '../components/RefexOneAppDownload';
import { toast } from 'sonner';
import { Search, Lock, MessageCircle, X, DollarSign, Zap, Building2, Heart, LayoutGrid, FileText, Plane, ShoppingCart, ListChecks, Target, Flame, GitBranch, Home, Wrench, Utensils, Smartphone, Users as UsersIcon, Briefcase, ChevronRight, Headphones, Loader2, BarChart3 } from 'lucide-react';

const isItsmApp = (app = {}) => {
  const name = (app.name || '').toLowerCase();
  const desc = (app.description || '').toLowerCase();
  const id = (app.id || '').toLowerCase();
  return (
    id === 'itsm-inapp' ||
    /itsm|tech support|it support|helpdesk|it helpdesk|it service/.test(name) ||
    /itsm|tech support|it helpdesk|helpdesk/.test(desc)
  );
};

const ITSM_VIRTUAL_APP = {
  id: 'itsm-inapp',
  name: 'ITSM',
  description: 'Raise an IT support ticket',
  category: 'Support',
  type: 'internal',
  has_access: true,
  is_placeholder: false,
  sort_order: 1,
  logo_url: '',
};

/** One shared browser tab for all desktop app launches (reused instead of new tabs). */
const DESKTOP_APP_WINDOW = 'refexone_app';

const openDesktopAppTab = (url) => {
  if (!url) return;
  let win = null;
  try {
    win = window.open(url, DESKTOP_APP_WINDOW);
  } catch (e) {
    win = null;
  }
  if (!win) {
    window.location.href = url;
    return;
  }
  try {
    win.focus();
  } catch (e) {
    // ignore
  }
};

// Mobile palette (kept untouched)
const APP_COLORS = [
  { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
  { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100' },
  { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
  { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
  { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100' },
];

// Desktop tile palette — gradient top + tag color (matches mockup screenshots)
const DESKTOP_TILE_PALETTE = [
  { from: '#FCD34D', to: '#F59E0B', tagBg: '#FEF3C7', tagText: '#92400E', soft: 'from-amber-50 to-orange-50' },        // Amber/Orange
  { from: '#FB923C', to: '#EF4444', tagBg: '#FFE4E6', tagText: '#9F1239', soft: 'from-orange-50 to-rose-50' },         // Orange/Red
  { from: '#A78BFA', to: '#7C3AED', tagBg: '#EDE9FE', tagText: '#5B21B6', soft: 'from-violet-50 to-purple-50' },       // Violet
  { from: '#60A5FA', to: '#3B82F6', tagBg: '#DBEAFE', tagText: '#1E40AF', soft: 'from-blue-50 to-sky-50' },            // Blue
  { from: '#34D399', to: '#10B981', tagBg: '#D1FAE5', tagText: '#065F46', soft: 'from-emerald-50 to-teal-50' },        // Emerald
  { from: '#F472B6', to: '#EC4899', tagBg: '#FCE7F3', tagText: '#9D174D', soft: 'from-pink-50 to-rose-50' },           // Pink
  { from: '#22D3EE', to: '#0891B2', tagBg: '#CFFAFE', tagText: '#155E75', soft: 'from-cyan-50 to-sky-50' },            // Cyan
  { from: '#FBBF24', to: '#D97706', tagBg: '#FEF3C7', tagText: '#78350F', soft: 'from-yellow-50 to-amber-50' },        // Yellow
];

const hashString = (str = '') => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return Math.abs(h);
};

const getTilePalette = (app) => DESKTOP_TILE_PALETTE[hashString(app.id || app.name) % DESKTOP_TILE_PALETTE.length];

// Pick a Lucide icon for each app based on name keywords
const pickAppIcon = (name = '') => {
  const n = name.toLowerCase();
  if (/expense|reimburs/.test(n)) return FileText;
  if (/travel|trip|flight/.test(n)) return Plane;
  if (/procure|purchase|p2p/.test(n)) return ShoppingCart;
  if (/budget|finance|fin/.test(n)) return DollarSign;
  if (/task|todo|to-do|workflow/.test(n)) return ListChecks;
  if (/lead|sales|crm|target/.test(n)) return Target;
  if (/coal|ash|energy|flame/.test(n)) return Flame;
  if (/project|gantt|plan/.test(n)) return GitBranch;
  if (/adrenalin|hrms|hr|people|employee/.test(n)) return UsersIcon;
  if (/space|book|desk|floor|building|office/.test(n)) return Building2;
  if (/maint|repair|wrench|tool/.test(n)) return Wrench;
  if (/canteen|food|meal/.test(n)) return Utensils;
  if (/mobility|mobile|phone/.test(n)) return Smartphone;
  if (/itsm|tech support|helpdesk|it support/.test(n)) return Headphones;
  if (/report|analytics|dashboard|bi\b/.test(n)) return BarChart3;
  return Briefcase;
};

const CATEGORY_META = {
  All: { icon: LayoutGrid, color: 'text-emerald-600', bg: 'bg-emerald-50', dot: '#10B981' },
  Expense: { icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', dot: '#F59E0B' },
  Productivity: { icon: Zap, color: 'text-violet-600', bg: 'bg-violet-50', dot: '#8B5CF6' },
  Facility: { icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50', dot: '#3B82F6' },
  Support: { icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', dot: '#F43F5E' },
  HR: { icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', dot: '#F43F5E' },
  Reports: { icon: BarChart3, color: 'text-teal-600', bg: 'bg-teal-50', dot: '#14B8A6' },
};

const CATEGORY_ORDER = ['Expense', 'Productivity', 'Facility', 'Reports', 'Support', 'HR'];

const CATEGORY_LABEL = {
  All: 'All Applications',
  Expense: 'Expense Management',
  Productivity: 'Productivity',
  Facility: 'Facility Management',
  Reports: 'Reports & Analytics',
  Support: 'HR & People',
  HR: 'HR & People',
};

const AppLauncher = () => {
  const { API, getAuthHeader, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState('All');
  const [itsmChecking, setItsmChecking] = useState(false);

  useEffect(() => { fetchApps(); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  // SSO error redirects from /api/saml/.../complete (missing/invalid token, etc.)
  useEffect(() => {
    const ssoError = searchParams.get('sso_error');
    if (!ssoError) return;

    const messages = {
      missing_token: 'Your session expired. Please sign in again to open this app.',
      invalid_token: 'Your session is invalid. Please sign in again.',
      not_in_kissflow: 'Your account is not linked in Kissflow. Contact IT support.',
    };
    toast.error(messages[ssoError] || 'SSO failed. Please try again or sign in again.', { duration: 6000 });

    const next = new URLSearchParams(searchParams);
    next.delete('sso_error');
    setSearchParams(next, { replace: true });

    if (ssoError === 'missing_token' || ssoError === 'invalid_token') {
      logout();
      navigate('/login', { replace: true });
    }
  }, [searchParams, setSearchParams, logout, navigate]);

  const formatDate = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const formatTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const firstName = (user?.name || user?.full_name || 'there').split(' ')[0];

  const fetchApps = async () => {
    try {
      const response = await axios.get(`${API}/launcher/apps`, getAuthHeader());
      const list = Array.isArray(response.data) ? response.data : [];
      const withoutDup = list.filter((app) => app.id !== ITSM_VIRTUAL_APP.id);
      const hasItsm = withoutDup.some(isItsmApp);
      setApps(hasItsm ? withoutDup : [...withoutDup, ITSM_VIRTUAL_APP]);
    } catch (error) {
      toast.error('Failed to load apps');
      setApps([ITSM_VIRTUAL_APP]);
    } finally {
      setLoading(false);
    }
  };

  // Detect Capacitor / RefexOne native shell (Android BridgeActivity + iOS WKWebView)
  const isNativeBridge = typeof window !== 'undefined' && !!window.RefexOneBridge;
  const isCapacitor = typeof window !== 'undefined' && (
    !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    || isNativeBridge
  );
  const isPWA = isCapacitor || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const isMobile = isCapacitor || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  // Safari (desktop + iOS) — exclude Chrome/CriOS/Edge/Android WebView
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|Android/i.test(ua);

  const isKissflowApp = (app = {}) => {
    const blob = `${app.name || ''} ${app.description || ''} ${app.home_url || ''} ${app.acs_url || ''} ${app.entity_id || ''}`.toLowerCase();
    return /kissflow/.test(blob);
  };

  const isAdrenalinApp = (app = {}) => {
    const blob = `${app.name || ''} ${app.description || ''} ${app.home_url || ''} ${app.acs_url || ''}`.toLowerCase();
    return /adrenalin|myadrenalin/.test(blob);
  };

  /** Adrenalin: top-level ACS POST only — never pass module_url (iframe ACS breaks Adrenalin session). */
  const launchDesktopAdrenalinSso = (appId, token) => {
    const completeUrl = `${BACKEND_ORIGIN}/api/saml/${appId}/complete?token=${encodeURIComponent(token)}`;
    if (isSafari) {
      const ssoWindow = window.open('about:blank', DESKTOP_APP_WINDOW);
      if (!ssoWindow) {
        window.location.href = completeUrl;
        return;
      }
      try {
        ssoWindow.opener = null;
      } catch (e) {
        // ignore
      }
      ssoWindow.location.href = completeUrl;
      return;
    }
    openDesktopAppTab(completeUrl);
  };

  /**
   * Kissflow desktop: top-level ACS POST (no iframe — iframe breaks session cookies),
   * then navigate the same tab to the module once Kissflow loads.
   */
  const launchDesktopKissflowModuleSso = (appId, token, homeUrl) => {
    const acsOnly = `${BACKEND_ORIGIN}/api/saml/${appId}/complete?token=${encodeURIComponent(token)}`;

    const watchAndDeepLink = (ssoWindow) => {
      if (!ssoWindow) {
        window.location.href = acsOnly;
        return;
      }
      ssoWindow.location.href = acsOnly;
      if (!homeUrl) return;

      let attempts = 0;
      const maxAttempts = 120;
      const poll = setInterval(() => {
        attempts += 1;
        try {
          const href = ssoWindow.location.href || '';
          if (/kissflow\.com/i.test(href)) {
            clearInterval(poll);
            ssoWindow.location.href = homeUrl;
          }
        } catch (e) {
          // Cross-origin — ACS finished on Kissflow; session is in this top-level window
          clearInterval(poll);
          try {
            ssoWindow.location.href = homeUrl;
          } catch (err) {
            // ignore
          }
        }
        if (attempts >= maxAttempts) clearInterval(poll);
      }, 500);
    };

    if (isSafari) {
      const ssoWindow = window.open('about:blank', DESKTOP_APP_WINDOW);
      if (!ssoWindow) {
        window.location.href = acsOnly;
        return;
      }
      try {
        ssoWindow.opener = null;
      } catch (e) {
        // ignore
      }
      watchAndDeepLink(ssoWindow);
      return;
    }

    let ssoWindow = null;
    try {
      ssoWindow = window.open('about:blank', DESKTOP_APP_WINDOW);
    } catch (e) {
      ssoWindow = null;
    }
    if (!ssoWindow) {
      window.location.href = acsOnly;
      return;
    }
    try {
      ssoWindow.focus();
    } catch (e) {
      // ignore
    }
    watchAndDeepLink(ssoWindow);
  };

  /**
   * Desktop SAML SSO: open ACS complete URL (non-Kissflow or Kissflow without module).
   */
  const launchDesktopSamlSso = (completeUrl) => {
    if (isSafari) {
      const ssoWindow = window.open('about:blank', DESKTOP_APP_WINDOW);
      if (!ssoWindow) {
        window.location.href = completeUrl;
        return;
      }
      try {
        ssoWindow.opener = null;
      } catch (e) {
        // ignore
      }
      ssoWindow.location.href = completeUrl;
      return;
    }
    openDesktopAppTab(completeUrl);
  };

  const buildSamlCompleteUrl = (appId, token, homeUrl) => {
    const base = `${BACKEND_ORIGIN}/api/saml/${appId}/complete?token=${encodeURIComponent(token)}`;
    if (!homeUrl) return base;
    return `${base}&module_url=${encodeURIComponent(homeUrl)}`;
  };

  const warnIfKissflowIdentityMissing = (app) => {
    const blob = `${app?.name || ''} ${app?.description || ''} ${app?.home_url || ''}`.toLowerCase();
    if (!/kissflow/.test(blob)) return;
    if (user?.kissflow_user_id) return;
    // Soft check only — SSO still proceeds with email NameID
    toast.message('Kissflow account may not be synced. If login fails, contact IT.', { duration: 5000 });
  };

  /** Find a Kissflow SAML app to SSO into from an ITSM tile click. */
  const resolveKissflowLaunchApp = (tappedApp) => {
    const list = Array.isArray(apps) ? apps : [];
    const usable = (a) =>
      a &&
      a.has_access !== false &&
      !a.policy_blocked &&
      !a.is_placeholder &&
      a.id !== ITSM_VIRTUAL_APP.id;

    // 1) Prefer a real Kissflow SAML tile (same app that opens Kissflow when tapped directly)
    const kissflowSaml = list.find((a) => usable(a) && a.type === 'saml' && isKissflowApp(a));
    if (kissflowSaml) return kissflowSaml;

    // 2) ITSM SAML module that itself points at Kissflow (home_url / ACS on kissflow.com)
    const itsmOnKissflow = list.find((a) => {
      if (!usable(a) || a.type !== 'saml' || !isItsmApp(a)) return false;
      return isKissflowApp(a);
    });
    if (itsmOnKissflow) return itsmOnKissflow;

    // 3) Tapped app only if it is Kissflow SSO (never the virtual in-app ITSM tile)
    if (
      tappedApp &&
      usable(tappedApp) &&
      tappedApp.type === 'saml' &&
      isKissflowApp(tappedApp)
    ) {
      return tappedApp;
    }

    return null;
  };

  const launchKissflowApp = (app) => {
    const token = localStorage.getItem('iam_token');

    if (app.type === 'saml' && token) {
      warnIfKissflowIdentityMissing(app);
      const mobileFlow = isCapacitor || (isPWA && isMobile);

      if (mobileFlow) {
        const completeUrl = `${BACKEND_ORIGIN}/api/saml/${app.id}/complete?token=${encodeURIComponent(token)}`;
        const targetUrl = app.home_url
          ? `${completeUrl}&mobile_module=${encodeURIComponent(app.home_url)}`
          : completeUrl;
        launchUrlAfterKissflowClear(targetUrl);
      } else if (app.home_url) {
        launchDesktopKissflowModuleSso(app.id, token, app.home_url);
      } else {
        launchDesktopSamlSso(buildSamlCompleteUrl(app.id, token, ''));
      }
      return;
    }

    // No SAML app config — open Kissflow base / home_url if present
    if (app.home_url) {
      if (isPWA && isMobile) window.location.href = app.home_url;
      else openDesktopAppTab(app.home_url);
      return;
    }

    // Fallback: in-app form
    navigate('/itsm');
  };

  const handleItsmClick = async (app) => {
    if (app.has_access === false) {
      toast.error('You do not have permission to access this application. Please contact your administrator for assistance.', { duration: 6000 });
      return;
    }
    if (app.policy_blocked) {
      toast.error(app.policy_reason || 'Access blocked by policy');
      return;
    }

    const tryLaunchKissflow = () => {
      const target = resolveKissflowLaunchApp(app);
      if (target) {
        launchKissflowApp(target);
        return true;
      }
      return false;
    };

    // Fast path: Kissflow app already on launcher (badge not required) → SSO to Kissflow
    // This matches "Kissflow tile works, but ITSM opened RefexOne dashboard".
    if (tryLaunchKissflow()) {
      // Soft sync badge / kissflow_user_id in background (do not block SSO)
      axios.get(`${ITSM_API}/itsm/kissflow-status`, getAuthHeader()).catch(() => {});
      return;
    }

    setItsmChecking(true);
    try {
      // No Kissflow tile visible — ask backend (SCIM / local id)
      const res = await axios.get(`${ITSM_API}/itsm/kissflow-status`, getAuthHeader());
      const userInKissflow =
        res.data?.user_in_kissflow === true ||
        Boolean(res.data?.kissflow_user_id) ||
        Boolean(user?.kissflow_user_id);

      if (userInKissflow) {
        if (tryLaunchKissflow()) return;
        // Status check may have just assigned Kissflow app — reload launcher apps once.
        try {
          const appsRes = await axios.get(`${API}/launcher/apps`, getAuthHeader());
          const list = Array.isArray(appsRes.data) ? appsRes.data : [];
          const withoutDup = list.filter((a) => a.id !== ITSM_VIRTUAL_APP.id);
          const hasItsm = withoutDup.some(isItsmApp);
          const refreshed = hasItsm ? withoutDup : [...withoutDup, ITSM_VIRTUAL_APP];
          setApps(refreshed);
          const usable = (a) =>
            a &&
            a.has_access !== false &&
            !a.policy_blocked &&
            !a.is_placeholder &&
            a.id !== ITSM_VIRTUAL_APP.id;
          const kissflowSaml = refreshed.find((a) => usable(a) && a.type === 'saml' && isKissflowApp(a));
          if (kissflowSaml) {
            launchKissflowApp(kissflowSaml);
            return;
          }
        } catch (e) {
          // ignore reload errors
        }
        navigate('/itsm', { state: { kissflowFallback: true, reason: 'no_sso_target' } });
        return;
      }

      navigate('/itsm', { state: { kissflowFallback: true, reason: 'not_in_kissflow' } });
    } catch (err) {
      if (user?.kissflow_user_id && tryLaunchKissflow()) return;
      navigate('/itsm', { state: { kissflowFallback: true, reason: 'check_failed' } });
    } finally {
      setItsmChecking(false);
    }
  };

  const launchApp = (app) => {
    if (isItsmApp(app)) {
      handleItsmClick(app);
      return;
    }

    if (app.is_placeholder) {
      toast.info(`${app.name} is coming soon`);
      return;
    }
    if (app.has_access === false) {
      toast.error('You do not have permission to access this application. Please contact your administrator for assistance.', { duration: 6000 });
      return;
    }
    if (app.policy_blocked) {
      toast.error(app.policy_reason || 'Access blocked by policy');
      return;
    }
    const baseUrl = BACKEND_ORIGIN;
    const token = localStorage.getItem('iam_token');

    if (app.type === 'saml' && token) {
      warnIfKissflowIdentityMissing(app);
      const mobileFlow = isCapacitor || (isPWA && isMobile);

      if (mobileFlow) {
        // Step 1: SAML SSO → Kissflow. Step 2: native redirect to module (Expense, Solar, etc.)
        const completeUrl = `${baseUrl}/api/saml/${app.id}/complete?token=${encodeURIComponent(token)}`;
        const targetUrl = app.home_url
          ? `${completeUrl}&mobile_module=${encodeURIComponent(app.home_url)}`
          : completeUrl;
        launchUrlAfterKissflowClear(targetUrl);
      } else {
        if (isAdrenalinApp(app)) {
          launchDesktopAdrenalinSso(app.id, token);
        } else if (isKissflowApp(app) && app.home_url) {
          launchDesktopKissflowModuleSso(app.id, token, app.home_url);
        } else {
          launchDesktopSamlSso(buildSamlCompleteUrl(app.id, token, app.home_url));
        }
      }
    } else if (app.type === 'oidc') {
      // Feast/QR: open home_url so the RP starts OIDC with its own state.
      // Session continues via iam_token cookie / Login?oidc_redirect resume (mobile).
      const launchPath = app.launch_url || '';
      let targetUrl = app.home_url || `${baseUrl}${launchPath}`;
      if (token && launchPath.includes('/oidc/') && launchPath.includes('/authorize')) {
        const authorizeUrl = `${baseUrl}${launchPath}${launchPath.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
        // When home_url is set (Feast/QR), open the app; it will call authorize itself.
        // If no home_url, start authorize directly with token.
        targetUrl = app.home_url || authorizeUrl;
      }
      const mobileFlow = isCapacitor || (isPWA && isMobile);
      if (mobileFlow) {
        window.location.href = targetUrl;
      } else {
        openDesktopAppTab(targetUrl);
      }
    } else if (app.type === 'mobile') {
      // Detect device and route to the appropriate store
      const ua = navigator.userAgent || '';
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isAndroid = /Android/i.test(ua);
      let targetUrl = '';
      if (isIOS && app.app_store_url) {
        targetUrl = app.app_store_url;
      } else if (isAndroid && app.play_store_url) {
        targetUrl = app.play_store_url;
      } else {
        // Desktop or fallback — prefer Play Store, then App Store
        targetUrl = app.play_store_url || app.app_store_url;
      }
      if (!targetUrl) {
        toast.error('No store link available for this app');
        return;
      }
      if (isPWA && isMobile) { window.location.href = targetUrl; } else { window.open(targetUrl, '_blank'); }
    } else {
      const targetUrl = `${baseUrl}${app.launch_url}`;
      if (isPWA && isMobile) { window.location.href = targetUrl; } else { openDesktopAppTab(targetUrl); }
    }
  };

  const filtered = apps.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.category || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === 'All') return a.category !== 'Reports';
    return a.category === activeFilter;
  });

  // Group by category — but when "All" filter is active, show everything in one flat section
  const grouped = {};
  if (activeFilter === 'All') {
    if (filtered.length > 0) grouped['All'] = filtered;
  } else {
    for (const cat of CATEGORY_ORDER) {
      const catApps = filtered.filter(a => a.category === cat);
      if (catApps.length > 0) grouped[cat] = catApps;
    }
    // Uncategorized
    const uncategorized = filtered.filter(a => !a.category || !CATEGORY_ORDER.includes(a.category));
    if (uncategorized.length > 0) grouped['Other'] = uncategorized;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn" data-testid="app-launcher">
      {itsmChecking && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-5 shadow-xl flex items-center gap-3">
            <Loader2 className="animate-spin text-teal-600" size={22} />
            <span className="text-sm font-medium text-slate-700">Checking Kissflow…</span>
          </div>
        </div>
      )}
      {/* Mobile header — UNCHANGED */}
      <div className="sm:hidden mb-6" data-testid="welcome-header">
        <h1 className="font-heading text-2xl font-semibold text-slate-900 mb-1">Explore</h1>
        <p className="text-sm text-slate-400">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</p>
      </div>

      <div className="sm:hidden mb-4">
        <RefexOneAppDownload variant="launcher" />
      </div>

      {/* Mobile search bar */}
      <div className="sm:hidden mb-6">
        <div className="relative" data-testid="app-search-mobile">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
          />
        </div>
      </div>

      {/* Desktop Hero Banner — soft mint with large digital clock */}
      <div className="hidden sm:block mb-6" data-testid="desktop-hero-banner">
        <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />

          <div className="relative px-8 py-7 flex items-center justify-between gap-6">
            {/* Left: Mobile app download (QR + stores) */}
            <RefexOneAppDownload variant="hero" />

            {/* Center: Greeting */}
            <div className="hidden lg:flex flex-col items-center flex-1 px-6">
              <p className="text-slate-900 text-xl font-semibold tracking-tight">Hello, {firstName} <span className="inline-block animate-pulse">👋</span></p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/70 border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-800 text-xs font-medium">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</span>
              </div>
            </div>

            {/* Right: Date + Big Digital Clock */}
            <div className="text-right">
              <p className="text-slate-500 text-xs font-medium tracking-wide" data-testid="hero-date">{formatDate(now)}</p>
              <p className="text-3xl lg:text-[40px] font-bold text-slate-900 tabular-nums tracking-tight leading-none mt-1.5" data-testid="hero-time">{formatTime(now)}</p>
              <p className="text-slate-400 text-[11px] tracking-wide mt-1">{now.toLocaleDateString(undefined, { weekday: 'long' })}</p>
            </div>
          </div>

          {/* Greeting on medium screens */}
          <div className="lg:hidden relative px-8 pb-5 -mt-2">
            <p className="text-slate-900 text-base font-semibold">Hello, {firstName} 👋</p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100/70 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-800 text-xs font-medium">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar + Filter Pills — desktop only */}
      <div className="hidden sm:flex items-center gap-3 mb-7">
        <div className="relative flex-1" data-testid="app-search">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search apps, categories, or features..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-14 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all shadow-sm"
            data-testid="search-input"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">⌘K</kbd>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="hidden sm:flex items-center gap-2 mb-8 overflow-x-auto pb-1" data-testid="category-filters">
        {[
          { key: 'All', label: 'All', icon: LayoutGrid, dot: '#10B981' },
          { key: 'Expense', label: 'Expense', icon: FileText, dot: '#F59E0B' },
          { key: 'Productivity', label: 'Productivity', icon: Zap, dot: '#8B5CF6' },
          { key: 'Facility', label: 'Facility', icon: Building2, dot: '#3B82F6' },
          { key: 'Reports', label: 'Reports', icon: BarChart3, dot: '#14B8A6' },
          { key: 'Support', label: 'HR', icon: Heart, dot: '#F43F5E' },
        ].map(f => {
          const FilterIcon = f.icon;
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              data-testid={`filter-${f.key.toLowerCase()}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {isActive ? (
                <FilterIcon size={14} strokeWidth={2.25} />
              ) : (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.dot }} />
              )}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grouped Apps */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Search size={22} className="mx-auto mb-3 text-slate-300" />
          <h3 className="font-heading font-semibold text-slate-700 mb-1">
            {search ? 'No matching apps' : 'No Apps Available'}
          </h3>
          <p className="text-sm text-slate-400">
            {search ? 'Try a different search term.' : 'You have not been assigned to any applications yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, catApps]) => {
            const meta = CATEGORY_META[category] || { icon: Zap, color: 'text-slate-600', bg: 'bg-slate-50', dot: '#64748B' };
            const Icon = meta.icon;
            const label = CATEGORY_LABEL[category] || category;
            return (
              <div key={category} data-testid={`category-${category.toLowerCase()}`}>
                {/* Category Header — refined */}
                <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
                  <div className={`hidden sm:flex w-7 h-7 rounded-lg ${meta.bg} items-center justify-center`}>
                    <Icon size={14} className={meta.color} strokeWidth={2.25} />
                  </div>
                  <Icon size={14} className={`sm:hidden ${meta.color}`} strokeWidth={2} />
                  <h2 className="font-heading text-base sm:text-lg font-semibold text-slate-900 tracking-tight">{label}</h2>
                  <span className="text-xs text-slate-400 font-medium tabular-nums">{catApps.length} app{catApps.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Mobile: 4-col grid */}
                <div className="sm:hidden grid grid-cols-4 gap-3">
                  {catApps.map((app) => {
                    const c = APP_COLORS[hashString(app.id || app.name) % APP_COLORS.length];
                    const mNoAccess = app.has_access === false && !app.is_placeholder;
                    const mBlocked = app.policy_blocked && !app.is_placeholder && !mNoAccess;
                    const mRestricted = mNoAccess || mBlocked;
                    return (
                      <button
                        key={app.id}
                        onClick={() => launchApp(app)}
                        data-testid={`launch-app-${app.id}`}
                        className={`group relative flex flex-col items-center p-2 rounded-xl border transition-all duration-150 ${
                          app.is_placeholder ? 'opacity-60 border-dashed border-slate-300 bg-slate-50' :
                          mRestricted ? 'opacity-70 border-slate-200 bg-white cursor-pointer hover:opacity-100' :
                          'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer active:scale-95'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.border} border flex items-center justify-center mb-1.5`}>
                          {app.logo_url ? (
                            <img src={app.logo_url} alt={app.name} className={`w-7 h-7 object-contain ${mRestricted ? 'grayscale-[40%]' : ''}`} />
                          ) : (
                            <span className={`font-heading font-bold text-base ${c.text}`}>
                              {app.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-medium text-center leading-tight line-clamp-2 break-words w-full ${mRestricted ? 'text-slate-500' : 'text-slate-700'}`}>
                          {app.name}
                        </span>
                        {mNoAccess && <Lock size={10} className="absolute top-1 right-1 text-slate-500" />}
                        {mBlocked && <Lock size={10} className="absolute top-1 right-1 text-red-400" />}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: Vibrant gradient tile grid (matches mockup) */}
                <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 gap-4">
                  {catApps.map((app) => {
                    const pal = getTilePalette(app);
                    const AppIcon = pickAppIcon(app.name);
                    const catMeta = CATEGORY_META[app.category] || meta;
                    const noAccess = app.has_access === false && !app.is_placeholder;
                    const blocked = app.policy_blocked && !app.is_placeholder && !noAccess;
                    const restricted = noAccess || blocked;
                    return (
                      <button
                        key={app.id}
                        onClick={() => launchApp(app)}
                        data-testid={`launch-app-desktop-${app.id}`}
                        className={`group relative overflow-hidden rounded-2xl border bg-white transition-all duration-300 text-left flex flex-col ${
                          app.is_placeholder ? 'border-slate-200/70 opacity-75 hover:opacity-100 cursor-pointer hover:shadow-md' :
                          restricted ? 'border-slate-200 opacity-70 hover:opacity-100 cursor-pointer hover:shadow-md hover:border-slate-300' :
                          'border-slate-200/60 hover:border-transparent hover:shadow-[0_14px_40px_-12px_rgba(15,23,42,0.18)] hover:-translate-y-1 cursor-pointer'
                        }`}
                        title={noAccess ? 'You do not have permission to access this application. Click for details.' : undefined}
                      >
                        {/* Top section — clean neutral, no colored gradient */}
                        <div
                          className="relative h-[110px] flex items-center justify-center bg-slate-50"
                        >
                          {/* White icon squircle */}
                          <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 ${
                            app.is_placeholder ? 'bg-white border border-slate-200' :
                            restricted ? 'bg-white border border-slate-200' :
                            'bg-white shadow-sm border border-slate-200 group-hover:scale-110'
                          }`}>
                            {app.logo_url ? (
                              <img src={app.logo_url} alt={app.name} className={`w-8 h-8 object-contain ${restricted ? 'grayscale-[40%]' : ''}`} />
                            ) : (
                              <AppIcon size={26} strokeWidth={2} className={app.is_placeholder || restricted ? 'text-slate-400' : 'text-slate-600'} />
                            )}
                            {noAccess && (
                              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                <Lock size={11} strokeWidth={2.5} className="text-slate-500" />
                              </div>
                            )}
                          </div>

                          {/* Top-right badges */}
                          {app.is_placeholder && (
                            <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold tracking-widest bg-slate-700 text-white rounded">
                              SOON
                            </span>
                          )}
                          {noAccess && (
                            <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold tracking-widest bg-slate-600 text-white rounded flex items-center gap-1">
                              <Lock size={9} strokeWidth={2.5} /> RESTRICTED
                            </span>
                          )}
                          {blocked && (
                            <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold tracking-widest bg-red-600 text-white rounded flex items-center gap-1">
                              <Lock size={9} strokeWidth={2.5} /> LOCKED
                            </span>
                          )}
                        </div>

                        {/* Bottom white section with name + category pill */}
                        <div className="flex-1 px-4 py-4 flex flex-col items-center justify-between gap-2 min-h-[100px]">
                          <h3 className={`text-sm font-semibold text-center leading-snug line-clamp-2 tracking-tight ${restricted ? 'text-slate-600' : 'text-slate-900'}`}>
                            {app.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-slate-100 text-slate-600">
                            <span className="w-1 h-1 rounded-full bg-slate-500" />
                            {app.category || 'General'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Refexions Chatbot - Bottom Right */}
      <div className="fixed right-6 z-50 safe-fixed-bottom bottom-6" data-testid="refexions-chatbot">
        {chatOpen ? (
          <div className="w-80 sm:w-96 h-[480px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                  <MessageCircle size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Refexions</h3>
                  <p className="text-emerald-100 text-[11px]">AI Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                data-testid="close-chat"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-5 overflow-y-auto bg-slate-50">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageCircle size={12} className="text-emerald-600" />
                </div>
                <div className="bg-white rounded-xl rounded-tl-sm px-4 py-3 shadow-sm border border-slate-100 max-w-[85%]">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Hi {user?.name?.split(' ')[0] || 'there'}! I'm <strong>Refexions</strong>, your AI assistant. How can I help you today?
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {['Raise a support ticket', 'Check leave balance', 'IT helpdesk query'].map((q, i) => (
                      <button key={i} className="block w-full text-left text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  data-testid="chat-input"
                />
                <button className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 rounded-full flex items-center justify-center transition-colors" data-testid="chat-send">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            className="group flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white pl-4 pr-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
            data-testid="open-chat"
          >
            <MessageCircle size={20} />
            <span className="text-sm font-medium">Refexions</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default AppLauncher;
