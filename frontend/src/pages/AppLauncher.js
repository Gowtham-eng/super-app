import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Search, Lock, ExternalLink, LayoutGrid, List, ChevronDown } from 'lucide-react';

const APP_COLORS = [
  { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', icon: '#3B82F6' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', icon: '#10B981' },
  { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100', icon: '#8B5CF6' },
  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', icon: '#F59E0B' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100', icon: '#06B6D4' },
  { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', icon: '#F43F5E' },
  { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', icon: '#F97316' },
  { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100', icon: '#14B8A6' },
];

const getColor = (i) => APP_COLORS[i % APP_COLORS.length];

const AppLauncher = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('usage');
  const [showSort, setShowSort] = useState(false);

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

  let filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase())
  );

  if (sortBy === 'name') {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'type') {
    filtered = [...filtered].sort((a, b) => (a.type || '').localeCompare(b.type || ''));
  }
  // sortBy === 'usage' keeps the backend order (most used first)

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn" data-testid="app-launcher">
      {/* Header */}
      <div className="mb-6" data-testid="welcome-header">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">Explore</h1>
        <p className="text-sm text-slate-400">{filtered.length} application{filtered.length !== 1 ? 's' : ''} available</p>
      </div>

      {/* Search + Sort + View Toggle Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:max-w-xs" data-testid="app-search">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Type here to search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            data-testid="search-input"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSort(!showSort)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              data-testid="sort-dropdown"
            >
              Sort: <span className="text-slate-700 font-medium">{sortBy === 'usage' ? 'Most Used' : sortBy === 'name' ? 'Name' : 'Type'}</span>
              <ChevronDown size={14} />
            </button>
            {showSort && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                {[{ key: 'usage', label: 'Most Used' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { setSortBy(opt.key); setShowSort(false); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${sortBy === opt.key ? 'text-blue-600 font-medium' : 'text-slate-600'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'bg-white text-slate-400 hover:text-slate-600'}`}
              data-testid="view-list"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-700' : 'bg-white text-slate-400 hover:text-slate-600'}`}
              data-testid="view-grid"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <div className="w-14 h-14 mx-auto mb-3 bg-slate-100 rounded-xl flex items-center justify-center">
            <Search size={22} className="text-slate-300" />
          </div>
          <h3 className="font-heading font-semibold text-slate-700 mb-1">
            {search ? 'No matching apps' : 'No Apps Available'}
          </h3>
          <p className="text-sm text-slate-400">
            {search ? 'Try a different search term.' : 'You have not been assigned to any applications yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: Compact 4-column icon grid */}
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
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer active:scale-95'
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

          {/* Desktop: Kissflow Explore-style cards */}
          {viewMode === 'grid' ? (
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5" data-testid="apps-grid">
              {filtered.map((app, i) => {
                const c = getColor(i);
                return (
                  <button
                    key={app.id}
                    onClick={() => launchApp(app)}
                    disabled={app.policy_blocked}
                    data-testid={`launch-app-desktop-${app.id}`}
                    className={`group relative text-left bg-white rounded-xl transition-all duration-200 flex flex-col ${
                      app.policy_blocked
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-lg cursor-pointer active:scale-[0.98]'
                    }`}
                    style={{ boxShadow: app.policy_blocked ? '0 0 0 1.5px #cbd5e1' : '0 0 0 1.5px #94a3b8, 0 1px 3px 0 rgba(0,0,0,0.06)' }}
                    onMouseEnter={(e) => { if (!app.policy_blocked) e.currentTarget.style.boxShadow = '0 0 0 2px #60a5fa, 0 4px 12px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={(e) => { if (!app.policy_blocked) e.currentTarget.style.boxShadow = '0 0 0 1.5px #94a3b8, 0 1px 3px 0 rgba(0,0,0,0.06)'; }}
                  >
                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col">
                      {/* App Icon */}
                      <div className={`w-11 h-11 rounded-lg ${c.bg} ${c.border} border flex items-center justify-center mb-4 transition-transform group-hover:scale-105`}>
                        {app.logo_url ? (
                          <img src={app.logo_url} alt={app.name} className="w-6 h-6 object-contain" />
                        ) : (
                          <span className={`font-heading font-bold text-lg ${c.text}`}>
                            {app.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-slate-800 mb-1 pr-4">{app.name}</h3>

                      {/* Description */}
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 flex-1">
                        {app.description || 'No description added'}
                      </p>
                    </div>

                    {/* Hover indicator */}
                    {app.policy_blocked ? (
                      <div className="absolute top-4 right-4">
                        <Lock size={14} className="text-red-400" />
                      </div>
                    ) : (
                      <ExternalLink size={14} className="absolute top-4 right-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="hidden sm:block bg-white rounded-xl divide-y divide-slate-200" style={{ boxShadow: '0 0 0 1.5px #94a3b8, 0 1px 3px 0 rgba(0,0,0,0.06)' }} data-testid="apps-list">
              {filtered.map((app, i) => {
                const c = getColor(i);
                return (
                  <button
                    key={app.id}
                    onClick={() => launchApp(app)}
                    disabled={app.policy_blocked}
                    data-testid={`launch-app-list-${app.id}`}
                    className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-all ${
                      app.policy_blocked
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${c.bg} ${c.border} border flex items-center justify-center flex-shrink-0`}>
                      {app.logo_url ? (
                        <img src={app.logo_url} alt={app.name} className="w-6 h-6 object-contain" />
                      ) : (
                        <span className={`font-heading font-bold text-sm ${c.text}`}>
                          {app.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{app.name}</h3>
                      <p className="text-xs text-slate-400 truncate">{app.description || 'No description added'}</p>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full flex-shrink-0">
                      {app.type === 'saml' ? 'SAML' : 'OIDC'}
                    </span>
                    {app.policy_blocked ? (
                      <Lock size={14} className="text-red-400 flex-shrink-0" />
                    ) : (
                      <ExternalLink size={14} className="text-slate-300 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AppLauncher;
