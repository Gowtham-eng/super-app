import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react';
import { API, BACKEND_ORIGIN } from '../config/api';

const REFEX_LOGO = '/refexone-logo.png';

/** Survive URL drops / re-renders so P2P (and other apps) resume after RefexOne password login. */
const PENDING_SSO_APP_KEY = 'refexone_pending_sso_app';
const PENDING_RELAY_KEY = 'refexone_pending_relay_state';
const PENDING_OIDC_KEY = 'refexone_pending_oidc_redirect';

const readPendingSso = () => {
  try {
    return {
      ssoApp: sessionStorage.getItem(PENDING_SSO_APP_KEY) || '',
      relayState: sessionStorage.getItem(PENDING_RELAY_KEY) || '',
      oidcRedirect: sessionStorage.getItem(PENDING_OIDC_KEY) || '',
    };
  } catch (e) {
    return { ssoApp: '', relayState: '', oidcRedirect: '' };
  }
};

const persistPendingSso = ({ ssoApp, relayState, oidcRedirect }) => {
  try {
    // Only write non-empty values so a partial update never wipes P2P relay/state.
    if (ssoApp) sessionStorage.setItem(PENDING_SSO_APP_KEY, ssoApp);
    if (relayState) sessionStorage.setItem(PENDING_RELAY_KEY, relayState);
    if (oidcRedirect) sessionStorage.setItem(PENDING_OIDC_KEY, oidcRedirect);
  } catch (e) {
    // ignore
  }
};

const clearPendingSso = () => {
  try {
    sessionStorage.removeItem(PENDING_SSO_APP_KEY);
    sessionStorage.removeItem(PENDING_RELAY_KEY);
    sessionStorage.removeItem(PENDING_OIDC_KEY);
  } catch (e) {
    // ignore
  }
};

const CAROUSEL_SLIDES = [
  {
    image: 'https://www.refex.co.in/uploads/images/image-1765792912552-76106071.webp',
    title: 'Ash Utilization & Coal Handling',
    description: 'End-to-end ash handling, coal yard management and trading solutions for thermal power plants across India.',
    accent: '#F59E0B',
  },
  {
    image: 'https://www.refex.co.in/uploads/images/image-1765793262489-602378423.jpg',
    title: 'Green Mobility',
    description: 'Tailored corporate commuting and daily rides powered by electric vehicle fleets for a sustainable future.',
    accent: '#10B981',
  },
  {
    image: 'https://www.refex.co.in/uploads/images/image-1765793200200-726200018.jpg',
    title: 'Venwind Refex',
    description: 'Driving sustainable wind energy adoption with advanced 5.3 MW turbine manufacturing in India.',
    accent: '#3B82F6',
  },
];

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [ssoAppId, setSsoAppId] = useState(null);
  const [azureProviders, setAzureProviders] = useState([]);
  const [azureBusy, setAzureBusy] = useState(false);
  const [googleProviders, setGoogleProviders] = useState([]);
  const [googleBusy, setGoogleBusy] = useState(false);
  const ssoRedirecting = React.useRef(false);
  const azureHandled = React.useRef(false);
  const googleHandled = React.useRef(false);

  const { login, loginWithToken, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Carousel auto-rotate
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Capture P2P / app SSO intent from URL (and keep it across login)
  useEffect(() => {
    const ssoApp = searchParams.get('sso_app') || '';
    const relayState = searchParams.get('relay_state') || '';
    const oidcRedirect = searchParams.get('oidc_redirect') || '';
    if (ssoApp || oidcRedirect || relayState) {
      persistPendingSso({ ssoApp, relayState, oidcRedirect });
    }
    const pending = readPendingSso();
    if (ssoApp || pending.ssoApp) {
      setSsoAppId(ssoApp || pending.ssoApp);
    }
  }, [searchParams]);

  // Load active Azure AD providers for Microsoft login
  useEffect(() => {
    axios
      .get(`${API}/azure-ad/providers`)
      .then((res) => setAzureProviders(res.data || []))
      .catch(() => setAzureProviders([]));
  }, []);

  // Load active Google OAuth providers
  useEffect(() => {
    axios
      .get(`${API}/google-oauth/providers`)
      .then((res) => setGoogleProviders(res.data || []))
      .catch(() => setGoogleProviders([]));
  }, []);

  // Handle Azure AD callback (?azure_token= / ?azure_error=)
  useEffect(() => {
    const azureError = searchParams.get('azure_error');
    if (azureError) {
      toast.error(azureError);
      const next = new URLSearchParams(searchParams);
      next.delete('azure_error');
      setSearchParams(next, { replace: true });
      return;
    }

    const azureToken = searchParams.get('azure_token');
    if (!azureToken || azureHandled.current) return;
    azureHandled.current = true;
    setAzureBusy(true);
    (async () => {
      try {
        await loginWithToken(azureToken);
        toast.success('Signed in with Microsoft');
        const next = new URLSearchParams(searchParams);
        next.delete('azure_token');
        setSearchParams(next, { replace: true });
      } catch (err) {
        toast.error('Microsoft sign-in failed');
        azureHandled.current = false;
      } finally {
        setAzureBusy(false);
      }
    })();
  }, [searchParams, loginWithToken, setSearchParams]);

  // Handle Google OAuth callback (?google_token= / ?google_error=)
  useEffect(() => {
    const googleError = searchParams.get('google_error');
    if (googleError) {
      toast.error(googleError);
      const next = new URLSearchParams(searchParams);
      next.delete('google_error');
      setSearchParams(next, { replace: true });
      return;
    }

    const googleToken = searchParams.get('google_token');
    if (!googleToken || googleHandled.current) return;
    googleHandled.current = true;
    setGoogleBusy(true);
    (async () => {
      try {
        await loginWithToken(googleToken);
        toast.success('Signed in with Google');
        const next = new URLSearchParams(searchParams);
        next.delete('google_token');
        setSearchParams(next, { replace: true });
      } catch (err) {
        toast.error('Google sign-in failed');
        googleHandled.current = false;
      } finally {
        setGoogleBusy(false);
      }
    })();
  }, [searchParams, loginWithToken, setSearchParams]);

  const resumeOidcRedirect = (oidcRedirect) => {
    if (!oidcRedirect) return false;
    const storedToken = localStorage.getItem('iam_token');
    if (!storedToken) return false;
    clearPendingSso();
    const separator = oidcRedirect.includes('?') ? '&' : '?';
    window.location.href = `${oidcRedirect}${separator}token=${encodeURIComponent(storedToken)}`;
    return true;
  };

  const completeSSOLogin = async (appId, relayStateOverride = null) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const storedToken = localStorage.getItem('iam_token');
    if (storedToken) {
      const pending = readPendingSso();
      const relayState =
        relayStateOverride ??
        searchParams.get('relay_state') ??
        pending.relayState ??
        '';
      let completeUrl = `${BACKEND_ORIGIN}/api/saml/${appId}/complete?token=${encodeURIComponent(storedToken)}`;
      if (relayState) completeUrl += `&relay_state=${encodeURIComponent(relayState)}`;
      clearPendingSso();
      window.location.href = completeUrl;
    } else {
      toast.error('Please login first to continue SSO');
    }
  };

  /** After RefexOne login: finish P2P/SAML/OIDC instead of dumping user on launcher. */
  const resumePendingAppSso = () => {
    if (ssoRedirecting.current) return true;
    const pending = readPendingSso();
    const appId = ssoAppId || searchParams.get('sso_app') || pending.ssoApp;
    const oidcRedirect = searchParams.get('oidc_redirect') || pending.oidcRedirect;

    if (appId) {
      ssoRedirecting.current = true;
      completeSSOLogin(appId, pending.relayState || searchParams.get('relay_state') || '');
      return true;
    }
    if (oidcRedirect) {
      ssoRedirecting.current = true;
      return resumeOidcRedirect(oidcRedirect);
    }
    return false;
  };

  useEffect(() => {
    if (!token) return undefined;

    // Already logged in â€” resume pending app SSO (P2P email View, Feast/QR, etc.)
    if (resumePendingAppSso()) {
      return undefined;
    }

    navigate('/', { replace: true });
    return undefined;
  }, [token, ssoAppId, navigate, searchParams]);

  const startAzureLogin = (configId) => {
    // Keep pending P2P/SSO intent across Microsoft round-trip if used later
    const pending = readPendingSso();
    persistPendingSso({
      ssoApp: searchParams.get('sso_app') || pending.ssoApp,
      relayState: searchParams.get('relay_state') || pending.relayState,
      oidcRedirect: searchParams.get('oidc_redirect') || pending.oidcRedirect,
    });
    const url = configId
      ? `${BACKEND_ORIGIN}/api/auth/azure/login?config_id=${encodeURIComponent(configId)}`
      : `${BACKEND_ORIGIN}/api/auth/azure/login`;
    window.location.href = url;
  };

  const startGoogleLogin = (configId) => {
    const pending = readPendingSso();
    persistPendingSso({
      ssoApp: searchParams.get('sso_app') || pending.ssoApp,
      relayState: searchParams.get('relay_state') || pending.relayState,
      oidcRedirect: searchParams.get('oidc_redirect') || pending.oidcRedirect,
    });
    const url = configId
      ? `${BACKEND_ORIGIN}/api/auth/google/login?config_id=${encodeURIComponent(configId)}`
      : `${BACKEND_ORIGIN}/api/auth/google/login`;
    window.location.href = url;
  };

  const emailDomain = () => {
    const raw = (email || '').trim().toLowerCase();
    if (!raw.includes('@')) return '';
    return raw.split('@').pop() || '';
  };

  /** Prefer domain match from email field; else prefer Refex-labeled config; else first. No 2nd-tap picker. */
  const pickProvider = (providers) => {
    if (!providers?.length) return null;
    if (providers.length === 1) return providers[0];
    const domain = emailDomain();
    if (domain) {
      const byDomain = providers.find((p) =>
        (p.email_domains || []).some(
          (d) => String(d).toLowerCase().replace(/^@/, '') === domain
        )
      );
      if (byDomain) return byDomain;
    }
    const refex = providers.find((p) => /refex/i.test(p.label || ''));
    if (refex) return refex;
    return providers[0];
  };

  const handleGoogleClick = () => {
    const provider = pickProvider(googleProviders);
    if (!provider) {
      toast.error('Google login is not configured yet');
      return;
    }
    startGoogleLogin(provider.id);
  };

  const handleMicrosoftClick = () => {
    const provider = pickProvider(azureProviders);
    if (!provider) {
      toast.error('Microsoft login is not configured yet');
      return;
    }
    startAzureLogin(provider.id);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setIsLoading(true);
    try {
      // Re-persist from URL + existing pending (email deep links / long authorize URLs)
      const existing = readPendingSso();
      persistPendingSso({
        ssoApp: searchParams.get('sso_app') || ssoAppId || existing.ssoApp,
        relayState: searchParams.get('relay_state') || existing.relayState,
        oidcRedirect: searchParams.get('oidc_redirect') || existing.oidcRedirect,
      });
      await login(email, password);
      toast.success('Welcome back!');
      // Critical: resume P2P/SAML/OIDC immediately (don't rely only on useEffect)
      if (resumePendingAppSso()) {
        return;
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const slide = CAROUSEL_SLIDES[currentSlide];
  const pendingSso = readPendingSso();
  const oidcRedirectPending =
    searchParams.get('oidc_redirect') || pendingSso.oidcRedirect;
  const ssoPending = !!(ssoAppId || pendingSso.ssoApp || oidcRedirectPending);

  // Already signed in + app SSO resume: never flash the login form
  if (token && ssoPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" data-testid="login-oidc-resume">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex w-full max-w-[100vw] overflow-x-hidden" data-testid="login-page">
      {/* Left: Carousel */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-zinc-900">
        {/* Background Images */}
        {CAROUSEL_SLIDES.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: i === currentSlide ? 1 : 0 }}
          >
            <img
              src={s.image}
              alt={s.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
          </div>
        ))}

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col justify-end w-full h-full p-10">

          {/* Bottom: Slide Text */}
          <div className="max-w-lg">
            <div
              className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/90 mb-4 rounded-full"
              style={{ backgroundColor: slide.accent + '99' }}
            >
              Our Businesses
            </div>
            <h2 className="text-3xl font-black text-white mb-3 leading-tight">
              {slide.title}
            </h2>
            <p className="text-white/70 text-base leading-relaxed mb-8">
              {slide.description}
            </p>

            {/* Dots */}
            <div className="flex gap-2">
              {CAROUSEL_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className="transition-all duration-300"
                  style={{
                    width: i === currentSlide ? 32 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i === currentSlide ? slide.accent : 'rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Login Form — text-base (16px) avoids iOS input zoom */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 pb-[max(3rem,env(safe-area-inset-bottom))] bg-white w-full">
        <div className="w-full max-w-md">
          {/* Logo top-right, aligned with form */}
          <div className="flex justify-start mb-10">
            <img src={REFEX_LOGO} alt="RefexOne" className="h-12 object-contain" />
          </div>

          {/* SSO Banner */}
          {ssoPending && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 font-medium">
                Sign in to continue to your application
              </p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-zinc-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@refex.co.in"
                className="w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-base focus:outline-none focus:border-zinc-400 focus:bg-white transition-all"
                data-testid="email-input"
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3.5 pr-12 bg-zinc-50 border border-zinc-200 rounded-xl text-base focus:outline-none focus:border-zinc-400 focus:bg-white transition-all"
                  data-testid="password-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || azureBusy || googleBusy}
              className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="submit-button"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </button>
          </form>

          {(azureProviders.length > 0 || googleProviders.length > 0) && (
            <div className="mt-6">
              <div className="relative flex items-center justify-center mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200" />
                </div>
                <span className="relative bg-white px-3 text-xs text-zinc-400 uppercase tracking-wide">
                  or
                </span>
              </div>

              {googleProviders.length > 0 && (
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={googleBusy}
                  data-testid="google-login-button"
                  className="w-full py-3.5 mb-3 border border-zinc-200 hover:border-zinc-300 bg-white text-zinc-800 font-semibold rounded-xl transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.95-2.23 5.45-4.76 7.11l7.73 6.01C42.44 39.68 46.98 32.75 46.98 24.55z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6.01c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  {googleBusy ? 'Signing in…' : 'Sign in with Google'}
                </button>
              )}

              {azureProviders.length > 0 && (
                <button
                  type="button"
                  onClick={handleMicrosoftClick}
                  disabled={azureBusy}
                  data-testid="microsoft-login-button"
                  className="w-full py-3.5 border border-zinc-200 hover:border-zinc-300 bg-white text-zinc-800 font-semibold rounded-xl transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  {azureBusy ? 'Signing in…' : 'Sign in with Microsoft'}
                </button>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-zinc-100 text-center">
            <p className="text-xs text-zinc-400">
              Powered by Refex AI team
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
