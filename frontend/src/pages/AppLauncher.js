import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Search, Lock, ExternalLink, MessageCircle, X, DollarSign, Zap, Building2, Headphones, LayoutGrid } from 'lucide-react';

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

// Desktop palette — refined enterprise tints (tinted bg + matching icon color)
// Inspired by Linear/Stripe/Notion: subtle, restrained, sophisticated.
const DESKTOP_CIRCLE_COLORS = [
  { bg: '#F0FDF4', fg: '#15803D', logoBg: '#DCFCE7' }, // Emerald
  { bg: '#EFF6FF', fg: '#1D4ED8', logoBg: '#DBEAFE' }, // Blue
  { bg: '#FFF7ED', fg: '#C2410C', logoBg: '#FFEDD5' }, // Orange
  { bg: '#FAF5FF', fg: '#7E22CE', logoBg: '#F3E8FF' }, // Purple
  { bg: '#FEF2F2', fg: '#B91C1C', logoBg: '#FEE2E2' }, // Rose
  { bg: '#ECFEFF', fg: '#0E7490', logoBg: '#CFFAFE' }, // Cyan
  { bg: '#FEFCE8', fg: '#A16207', logoBg: '#FEF3C7' }, // Amber
  { bg: '#F5F3FF', fg: '#6D28D9', logoBg: '#EDE9FE' }, // Violet
  { bg: '#FDF4FF', fg: '#A21CAF', logoBg: '#FAE8FF' }, // Fuchsia
  { bg: '#F0FDFA', fg: '#0F766E', logoBg: '#CCFBF1' }, // Teal
];

const hashString = (str = '') => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return Math.abs(h);
};

const getDesktopColor = (app) => {
  return DESKTOP_CIRCLE_COLORS[hashString(app.id || app.name) % DESKTOP_CIRCLE_COLORS.length];
};

const CATEGORY_META = {
  Expense: { icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  Productivity: { icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50' },
  Facility: { icon: Building2, color: 'text-violet-600', bg: 'bg-violet-50' },
  Support: { icon: Headphones, color: 'text-amber-600', bg: 'bg-amber-50' },
};

const CATEGORY_ORDER = ['Expense', 'Productivity', 'Facility', 'Support'];

const getColor = () => {
  return { bg: 'bg-white', text: 'text-slate-900', border: 'border-slate-200' };
};

const AppLauncher = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => { fetchApps(); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  const formatDate = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const formatTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const firstName = (user?.name || user?.full_name || 'there').split(' ')[0];

  const fetchApps = async () => {
    try {
      const response = await axios.get(`${API}/launcher/apps`, getAuthHeader());
      setApps(response.data);
    } catch (error) {
      toast.error('Failed to load apps');
    } finally {
      setLoading(false);
    }
  };

  // Detect Capacitor (native Android/iOS wrapper) — display-mode standalone does NOT match in Capacitor
  const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const isPWA = isCapacitor || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const isMobile = isCapacitor || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const launchApp = (app) => {
    if (app.is_placeholder) {
      toast.info(`${app.name} is coming soon`);
      return;
    }
    if (app.policy_blocked) {
      toast.error(app.policy_reason || 'Access blocked by policy');
      return;
    }
    const baseUrl = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem('iam_token');

    if (app.type === 'saml' && token) {
      const completeUrl = `${baseUrl}/api/saml/${app.id}/complete?token=${encodeURIComponent(token)}`;

      if (isPWA && isMobile) {
        if (app.home_url) {
          // Mobile + module app: pass module URL to backend for iframe-based session + redirect
          window.location.href = completeUrl + '&mobile_module=' + encodeURIComponent(app.home_url);
        } else {
          // Mobile + primary app: direct SSO
          window.location.href = completeUrl;
        }
      } else if (app.home_url) {
        // Desktop + module app: Two-step named window SSO
        // Step 1: Open SSO in a named tab to establish Kissflow session
        const windowName = 'kf_sso_' + app.id.substring(0, 8);
        window.open(completeUrl, windowName);
        // Step 2: After session is established, redirect same tab to module URL
        setTimeout(() => {
          window.open(app.home_url, windowName);
        }, 3500);
      } else {
        // Desktop + primary app: direct SSO
        window.open(completeUrl, '_blank');
      }
    } else if (app.type === 'oidc') {
      const targetUrl = app.home_url || `${baseUrl}${app.launch_url}`;
      if (isPWA && isMobile) { window.location.href = targetUrl; } else { window.open(targetUrl, '_blank'); }
    } else {
      const targetUrl = `${baseUrl}${app.launch_url}`;
      if (isPWA && isMobile) { window.location.href = targetUrl; } else { window.open(targetUrl, '_blank'); }
    }
  };

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.category || '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = {};
  for (const cat of CATEGORY_ORDER) {
    const catApps = filtered.filter(a => a.category === cat);
    if (catApps.length > 0) grouped[cat] = catApps;
  }
  // Uncategorized
  const uncategorized = filtered.filter(a => !a.category || !CATEGORY_ORDER.includes(a.category));
  if (uncategorized.length > 0) grouped['Other'] = uncategorized;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn" data-testid="app-launcher">
      {/* Mobile header — UNCHANGED */}
      <div className="sm:hidden mb-6" data-testid="welcome-header">
        <h1 className="font-heading text-2xl font-semibold text-slate-900 mb-1">Explore</h1>
        <p className="text-sm text-slate-400">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</p>
      </div>

      {/* Desktop Hero Banner — refined enterprise gradient */}
      <div className="hidden sm:block mb-8" data-testid="desktop-hero-banner">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60" style={{ background: 'linear-gradient(120deg, #064E3B 0%, #047857 55%, #059669 100%)' }}>
          {/* subtle noise/dot pattern overlay */}
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="absolute -top-20 -right-10 w-80 h-80 rounded-full bg-white/5 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-16 w-96 h-96 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />

          <div className="relative px-8 py-9 flex items-center justify-between gap-6">
            {/* Left: title */}
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <LayoutGrid size={20} className="text-white" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-heading text-2xl lg:text-[28px] font-semibold text-white tracking-tight leading-none">App Center</h1>
                <p className="text-emerald-100/70 text-xs mt-1.5 tracking-wide uppercase">Unified workspace</p>
              </div>
            </div>

            {/* Center: greeting */}
            <div className="hidden lg:block text-center flex-1 px-6">
              <p className="text-white text-lg font-medium tracking-tight">Hello {firstName}</p>
              <p className="text-emerald-100/80 text-sm mt-1">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</p>
            </div>

            {/* Right: live date/time */}
            <div className="text-right text-white">
              <p className="text-xs font-medium text-emerald-100/80 tracking-wide" data-testid="hero-date">{formatDate(now)}</p>
              <p className="text-xl font-semibold tabular-nums tracking-tight mt-1" data-testid="hero-time">{formatTime(now)}</p>
            </div>
          </div>

          {/* Greeting on medium screens */}
          <div className="lg:hidden relative px-8 pb-6 -mt-2">
            <p className="text-white text-base font-medium">Hello {firstName}</p>
            <p className="text-emerald-100/80 text-sm">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative max-w-md" data-testid="app-search">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            data-testid="search-input"
          />
        </div>
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
            const meta = CATEGORY_META[category] || { icon: Zap, color: 'text-slate-600', bg: 'bg-slate-50' };
            const Icon = meta.icon;
            return (
              <div key={category} data-testid={`category-${category.toLowerCase()}`}>
                {/* Category Header — refined */}
                <div className="flex items-center gap-2 mb-4 sm:mb-5">
                  <Icon size={14} className={`${meta.color}`} strokeWidth={2} />
                  <h2 className="font-heading text-[13px] font-semibold text-slate-700 uppercase tracking-wider">{category}</h2>
                  <span className="text-[11px] text-slate-400 font-medium tabular-nums">{catApps.length}</span>
                  <div className="flex-1 h-px bg-slate-100 ml-1.5 hidden sm:block" />
                </div>

                {/* Mobile: 4-col grid */}
                <div className="sm:hidden grid grid-cols-4 gap-3">
                  {catApps.map((app) => {
                    const c = getColor();
                    return (
                      <button
                        key={app.id}
                        onClick={() => launchApp(app)}
                        disabled={app.policy_blocked}
                        data-testid={`launch-app-${app.id}`}
                        className={`group relative flex flex-col items-center p-2 rounded-xl border transition-all duration-150 ${
                          app.is_placeholder ? 'opacity-60 border-dashed border-slate-300 bg-slate-50' :
                          app.policy_blocked ? 'opacity-40 cursor-not-allowed border-slate-200 bg-white' :
                          'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer active:scale-95'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.border} border flex items-center justify-center mb-1.5`}>
                          {app.logo_url ? (
                            <img src={app.logo_url} alt={app.name} className="w-7 h-7 object-contain" />
                          ) : (
                            <span className={`font-heading font-bold text-base ${c.text}`}>
                              {app.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-slate-700 text-center leading-tight line-clamp-2 w-full">
                          {app.name}
                        </span>
                        {app.policy_blocked && <Lock size={10} className="absolute top-1 right-1 text-red-400" />}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: Refined enterprise tile grid */}
                <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-9 4xl:grid-cols-12 gap-3">
                  {catApps.map((app) => {
                    const dc = getDesktopColor(app);
                    return (
                      <button
                        key={app.id}
                        onClick={() => launchApp(app)}
                        disabled={app.policy_blocked && !app.is_placeholder}
                        data-testid={`launch-app-desktop-${app.id}`}
                        className={`group relative bg-white rounded-xl border transition-all duration-200 flex flex-col items-center justify-start py-5 px-3 min-h-[158px] ${
                          app.is_placeholder ? 'border-dashed border-slate-200 bg-slate-50/40 cursor-pointer hover:bg-slate-50' :
                          app.policy_blocked ? 'opacity-50 cursor-not-allowed border-slate-200' :
                          'border-slate-200/70 hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 cursor-pointer'
                        }`}
                      >
                        {/* Soft tinted icon container */}
                        <div
                          className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-[1.03]"
                          style={{ backgroundColor: dc.bg }}
                        >
                          {app.logo_url ? (
                            <img src={app.logo_url} alt={app.name} className="w-9 h-9 object-contain" />
                          ) : (
                            <span className="font-heading font-semibold text-xl" style={{ color: dc.fg }}>
                              {app.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* App name */}
                        <h3 className="text-[13px] font-medium text-slate-800 text-center leading-snug px-1 line-clamp-2 tracking-tight">
                          {app.name}
                        </h3>

                        {app.is_placeholder && (
                          <span className="mt-1.5 inline-block text-[10px] font-medium text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-full">Coming Soon</span>
                        )}
                        {app.policy_blocked && !app.is_placeholder && (
                          <div className="absolute top-2.5 right-2.5"><Lock size={12} className="text-red-400" /></div>
                        )}
                        {!app.policy_blocked && !app.is_placeholder && (
                          <ExternalLink size={12} className="absolute top-2.5 right-2.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
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
      <div className="fixed bottom-6 right-6 z-50" data-testid="refexions-chatbot">
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
