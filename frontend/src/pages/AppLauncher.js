import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Search, Lock, MessageCircle, X, DollarSign, Zap, Building2, Heart, LayoutGrid, FileText, Plane, ShoppingCart, ListChecks, Target, Flame, GitBranch, Home, Wrench, Utensils, Smartphone, Users as UsersIcon, Briefcase, ChevronRight } from 'lucide-react';

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
  return Briefcase;
};

const CATEGORY_META = {
  Expense: { icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', dot: '#F59E0B' },
  Productivity: { icon: Zap, color: 'text-violet-600', bg: 'bg-violet-50', dot: '#8B5CF6' },
  Facility: { icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50', dot: '#3B82F6' },
  Support: { icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', dot: '#F43F5E' },
  HR: { icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', dot: '#F43F5E' },
};

const CATEGORY_ORDER = ['Expense', 'Productivity', 'Facility', 'Support', 'HR'];

const CATEGORY_LABEL = {
  Expense: 'Expense Management',
  Productivity: 'Productivity',
  Facility: 'Facility Management',
  Support: 'HR & People',
  HR: 'HR & People',
};

const AppLauncher = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState('All');

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

      // Capacitor (Android native wrapper): launch Kissflow URLs directly so MainActivity
      // can intercept and open them in the Kissflow native app via Intent.
      // The Kissflow native app has its own session store — after a one-time sign-in,
      // it remembers the user and opens modules directly without showing the login screen.
      if (isCapacitor && app.home_url && app.home_url.includes('kissflow.com')) {
        window.location.href = app.home_url;
        return;
      }

      if (isPWA && isMobile) {
        if (app.home_url) {
          // Mobile web (PWA, not Capacitor) + module app: backend iframe-based session + redirect
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

  const filtered = apps.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.category || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === 'All') return true;
    return a.category === activeFilter;
  });

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
            {/* Left: Icon + Title + Subtitle */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm">
                <LayoutGrid size={24} className="text-emerald-600" strokeWidth={2} />
              </div>
              <div>
                <h1 className="font-heading text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight leading-none">App Center</h1>
                <p className="text-slate-500 text-sm mt-1.5 font-medium">Enterprise Application Hub</p>
              </div>
            </div>

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

                {/* Desktop: Vibrant gradient tile grid (matches mockup) */}
                <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 gap-4">
                  {catApps.map((app) => {
                    const pal = getTilePalette(app);
                    const AppIcon = pickAppIcon(app.name);
                    const catMeta = CATEGORY_META[app.category] || meta;
                    const blocked = app.policy_blocked && !app.is_placeholder;
                    return (
                      <button
                        key={app.id}
                        onClick={() => launchApp(app)}
                        disabled={blocked}
                        data-testid={`launch-app-desktop-${app.id}`}
                        className={`group relative overflow-hidden rounded-2xl border bg-white transition-all duration-300 text-left flex flex-col ${
                          app.is_placeholder ? 'border-slate-200/70 opacity-75 hover:opacity-100 cursor-pointer hover:shadow-md' :
                          blocked ? 'opacity-50 cursor-not-allowed border-slate-200' :
                          'border-slate-200/60 hover:border-transparent hover:shadow-[0_14px_40px_-12px_rgba(15,23,42,0.18)] hover:-translate-y-1 cursor-pointer'
                        }`}
                      >
                        {/* Top gradient section with white icon squircle */}
                        <div
                          className="relative h-[110px] flex items-center justify-center"
                          style={{
                            background: app.is_placeholder
                              ? '#F1F5F9'
                              : `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)`
                          }}
                        >
                          {/* Decorative ring */}
                          {!app.is_placeholder && (
                            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/15 pointer-events-none" />
                          )}
                          {/* White icon squircle */}
                          <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 ${
                            app.is_placeholder ? 'bg-white/80 border border-slate-200' : 'bg-white shadow-md group-hover:scale-110'
                          }`}>
                            {app.logo_url ? (
                              <img src={app.logo_url} alt={app.name} className="w-8 h-8 object-contain" />
                            ) : (
                              <AppIcon size={26} strokeWidth={2} style={{ color: app.is_placeholder ? '#94A3B8' : pal.to }} />
                            )}
                          </div>

                          {/* SOON badge */}
                          {app.is_placeholder && (
                            <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold tracking-widest bg-slate-700 text-white rounded">
                              SOON
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
                          <h3 className="text-sm font-semibold text-slate-900 text-center leading-snug line-clamp-2 tracking-tight">
                            {app.name}
                          </h3>
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
                            style={{
                              backgroundColor: app.is_placeholder ? '#F1F5F9' : pal.tagBg,
                              color: app.is_placeholder ? '#64748B' : pal.tagText,
                            }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: app.is_placeholder ? '#64748B' : pal.tagText }} />
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
