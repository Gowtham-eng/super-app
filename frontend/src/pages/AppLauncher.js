import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Search, Lock, ExternalLink } from 'lucide-react';

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

const getColor = (i) => APP_COLORS[i % APP_COLORS.length];

const AppLauncher = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchApps(); }, []);

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

  // Detect if running as installed PWA on mobile
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const launchApp = (app) => {
    if (app.policy_blocked) {
      toast.error(app.policy_reason || 'Access blocked by policy');
      return;
    }
    const baseUrl = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem('iam_token');

    if (app.type === 'saml' && token) {
      const completeUrl = `${baseUrl}/api/saml/${app.id}/complete?token=${encodeURIComponent(token)}`;
      if (isPWA && isMobile) {
        window.location.href = completeUrl;
      } else {
        window.open(completeUrl, '_blank');
      }
    } else if (app.type === 'oidc') {
      const targetUrl = app.home_url || `${baseUrl}${app.launch_url}`;
      if (isPWA && isMobile) {
        window.location.href = targetUrl;
      } else {
        window.open(targetUrl, '_blank');
      }
    } else {
      const targetUrl = `${baseUrl}${app.launch_url}`;
      if (isPWA && isMobile) {
        window.location.href = targetUrl;
      } else {
        window.open(targetUrl, '_blank');
      }
    }
  };

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn" data-testid="app-launcher">
      {/* Welcome Header - Compact card on mobile, normal on desktop */}
      <div className="mb-4 sm:mb-8" data-testid="welcome-header">
        {/* Mobile: Zoho-style welcome card */}
        <div className="sm:hidden bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400 font-medium">{greeting()},</p>
              <h1 className="font-heading text-xl font-bold text-slate-900">
                {user?.name || 'User'}
              </h1>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-800">
              {initials}
            </div>
          </div>
          <div className="relative" data-testid="app-search-mobile">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search apps..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              data-testid="search-input"
            />
          </div>
        </div>

        {/* Desktop: Original header */}
        <div className="hidden sm:block">
          <p className="text-sm text-slate-500 font-medium mb-1">{greeting()},</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-900 mb-5">
            {user?.name || 'User'}
          </h1>
          <div className="relative max-w-md" data-testid="app-search">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search apps..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              data-testid="search-input-desktop"
            />
          </div>
        </div>
      </div>

      {/* Apps Section */}
      <div>
        <h2 className="font-heading text-base sm:text-lg font-semibold text-slate-900 mb-0.5">
          Your Applications
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mb-3 sm:mb-5">{filtered.length} app{filtered.length !== 1 ? 's' : ''} available</p>

        {filtered.length === 0 ? (
          <div className="text-center py-12 sm:py-20 bg-white border border-slate-200 rounded-2xl">
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 bg-slate-100 rounded-xl flex items-center justify-center">
              <Search size={20} className="text-slate-300" />
            </div>
            <h3 className="font-heading font-semibold text-slate-700 mb-1 text-sm sm:text-base">
              {search ? 'No matching apps' : 'No Apps Available'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              {search ? 'Try a different search term.' : 'You have not been assigned to any applications yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: Compact 4-column icon grid (Zoho Workplace style) */}
            <div className="sm:hidden grid grid-cols-4 gap-3" data-testid="apps-grid-mobile">
              {filtered.map((app, i) => {
                const c = getColor(i);
                return (
                  <button
                    key={app.id}
                    onClick={() => launchApp(app)}
                    disabled={app.policy_blocked}
                    data-testid={`launch-app-${app.id}`}
                    className={`group relative flex flex-col items-center p-2 rounded-xl border transition-all duration-150 ${
                      app.policy_blocked
                        ? 'opacity-40 cursor-not-allowed border-slate-200 bg-white'
                        : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md cursor-pointer active:scale-95'
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
                    {app.policy_blocked && (
                      <Lock size={10} className="absolute top-1 right-1 text-red-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Desktop: Card grid (existing layout) */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="apps-grid">
              {filtered.map((app, i) => {
                const c = getColor(i);
                return (
                  <button
                    key={app.id}
                    onClick={() => launchApp(app)}
                    disabled={app.policy_blocked}
                    data-testid={`launch-app-desktop-${app.id}`}
                    className={`group relative text-left p-5 rounded-xl border transition-all duration-200 ${
                      app.policy_blocked
                        ? 'opacity-50 cursor-not-allowed border-slate-200 bg-white'
                        : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-lg cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.border} border flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105`}>
                        {app.logo_url ? (
                          <img src={app.logo_url} alt={app.name} className="w-7 h-7 object-contain" />
                        ) : (
                          <span className={`font-heading font-semibold text-lg ${c.text}`}>
                            {app.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800 truncate pr-5">{app.name}</h3>
                        {app.description ? (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{app.description}</p>
                        ) : (
                          <p className="text-xs text-slate-300 mt-0.5">{app.type?.toUpperCase()} Application</p>
                        )}
                      </div>
                    </div>
                    {app.policy_blocked && (
                      <div className="absolute top-3 right-3">
                        <Lock size={14} className="text-red-400" />
                      </div>
                    )}
                    {!app.policy_blocked && (
                      <ExternalLink size={14} className="absolute top-3 right-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AppLauncher;
