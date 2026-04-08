import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Search, Lock, ExternalLink } from 'lucide-react';

const WELCOME_BG = 'https://images.unsplash.com/photo-1690203178211-589fa80baa95?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA0MTJ8MHwxfHNlYXJjaHwxfHx3aW5kJTIwdHVyYmluZXMlMjBncmVlbiUyMGVuZXJneSUyMGxhbmRzY2FwZXxlbnwwfHx8fDE3NzU2MzEwNTB8MA&ixlib=rb-4.1.0&q=85';

const APP_COLORS = [
  { bg: 'bg-blue-50', text: 'text-blue-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { bg: 'bg-violet-50', text: 'text-violet-600' },
  { bg: 'bg-amber-50', text: 'text-amber-600' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600' },
  { bg: 'bg-rose-50', text: 'text-rose-600' },
  { bg: 'bg-orange-50', text: 'text-orange-600' },
  { bg: 'bg-teal-50', text: 'text-teal-600' },
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

  const launchApp = (app) => {
    if (app.policy_blocked) {
      toast.error(app.policy_reason || 'Access blocked by policy');
      return;
    }
    const baseUrl = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem('iam_token');
    if (app.type === 'saml' && token) {
      window.open(`${baseUrl}/api/saml/${app.id}/complete?token=${encodeURIComponent(token)}`, '_blank');
    } else {
      window.open(`${baseUrl}${app.launch_url}`, '_blank');
    }
  };

  const filtered = apps.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn max-w-5xl">
      {/* Welcome Banner */}
      <div className="relative rounded-2xl overflow-hidden mb-10" data-testid="welcome-header">
        <div className="absolute inset-0">
          <img src={WELCOME_BG} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/50" />
        <div className="relative z-10 px-8 py-10">
          <p className="text-sm text-slate-500 font-medium mb-1">{greeting()},</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-900 mb-5">
            {user?.name || 'User'}
          </h1>
          <div className="relative max-w-md" data-testid="app-search">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search your apps..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/80 backdrop-blur border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              data-testid="search-input"
            />
          </div>
        </div>
      </div>

      {/* Apps */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-slate-900 mb-5">
          Your Applications
          <span className="ml-2 text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {filtered.length}
          </span>
        </h2>

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
            <div className="w-14 h-14 mx-auto mb-4 bg-slate-100 rounded-xl flex items-center justify-center">
              <Search size={24} className="text-slate-300" />
            </div>
            <h3 className="font-heading font-semibold text-slate-700 mb-1">
              {search ? 'No matching apps' : 'No Apps Available'}
            </h3>
            <p className="text-sm text-slate-400">
              {search ? 'Try a different search term.' : 'You have not been assigned to any applications yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5" data-testid="apps-grid">
            {filtered.map((app, i) => {
              const c = getColor(i);
              return (
                <button
                  key={app.id}
                  onClick={() => launchApp(app)}
                  disabled={app.policy_blocked}
                  data-testid={`launch-app-${app.id}`}
                  className={`group relative flex flex-col items-center p-6 rounded-xl border transition-all duration-200 ${
                    app.policy_blocked
                      ? 'opacity-50 cursor-not-allowed border-slate-200 bg-white'
                      : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-lg cursor-pointer active:scale-[0.97]'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-xl ${c.bg} flex items-center justify-center mb-4 transition-transform group-hover:scale-105`}>
                    {app.logo_url ? (
                      <img src={app.logo_url} alt={app.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <span className={`font-heading font-semibold text-xl ${c.text}`}>
                        {app.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-800 truncate w-full text-center">
                    {app.name}
                  </span>
                  {app.policy_blocked && (
                    <div className="absolute top-2 right-2">
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
        )}
      </div>
    </div>
  );
};

export default AppLauncher;
