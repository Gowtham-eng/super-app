import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react';

const REFEX_LOGO = 'https://customer-assets.emergentagent.com/job_kissflow-access-hub/artifacts/7t1td79v_refex-logo.png';

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
  const ssoRedirecting = React.useRef(false);

  const { login, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const API = process.env.REACT_APP_BACKEND_URL + '/api';

  // Carousel auto-rotate
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const ssoApp = searchParams.get('sso_app');
    if (ssoApp) setSsoAppId(ssoApp);
  }, [searchParams]);

  useEffect(() => {
    if (token && ssoAppId && !ssoRedirecting.current) {
      ssoRedirecting.current = true;
      completeSSOLogin(ssoAppId);
    } else if (token && !ssoAppId) {
      navigate('/');
    }
  }, [token, ssoAppId, navigate]);

  const completeSSOLogin = async (appId) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const storedToken = localStorage.getItem('iam_token');
    if (storedToken) {
      const relayState = searchParams.get('relay_state') || '';
      let completeUrl = `${process.env.REACT_APP_BACKEND_URL}/api/saml/${appId}/complete?token=${encodeURIComponent(storedToken)}`;
      if (relayState) completeUrl += `&relay_state=${encodeURIComponent(relayState)}`;
      window.location.href = completeUrl;
    } else {
      toast.error('Please login first to continue SSO');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      if (ssoAppId) {
        completeSSOLogin(ssoAppId);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const slide = CAROUSEL_SLIDES[currentSlide];

  return (
    <div className="min-h-screen flex" data-testid="login-page">
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
        <div className="relative z-10 flex flex-col justify-between w-full h-full p-10">
          {/* Top: Logo */}
          <div>
            <img src={REFEX_LOGO} alt="Refex" className="h-10 object-contain" />
          </div>

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

      {/* Right: Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src={REFEX_LOGO} alt="Refex" className="h-10 object-contain" />
          </div>

          <div className="mb-10">
            <h1 className="text-3xl font-black text-zinc-900 tracking-tight">
              Refex Super App
            </h1>
            <p className="text-zinc-500 mt-2">
              Sign in to your workplace
            </p>
          </div>

          {/* SSO Banner */}
          {ssoAppId && (
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
                className="w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 focus:bg-white transition-all"
                data-testid="email-input"
                autoComplete="email"
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
                  className="w-full px-4 py-3.5 pr-12 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 focus:bg-white transition-all"
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
              disabled={isLoading}
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

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-zinc-100 text-center">
            <p className="text-xs text-zinc-400">
              Refex Industries Limited
            </p>
            <p className="text-xs text-zinc-300 mt-1">
              Sustainability &middot; Innovation &middot; Long-term Value
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
