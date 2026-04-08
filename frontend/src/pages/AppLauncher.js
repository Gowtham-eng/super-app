import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { MagnifyingGlass, LockSimple, Warning, User, ArrowSquareOut } from '@phosphor-icons/react';

const APP_COLORS = [
  { bg: '#EEF2FF', icon: '#4F46E5' },
  { bg: '#FEF3C7', icon: '#D97706' },
  { bg: '#DCFCE7', icon: '#16A34A' },
  { bg: '#FCE7F3', icon: '#DB2777' },
  { bg: '#E0F2FE', icon: '#0284C7' },
  { bg: '#FEE2E2', icon: '#DC2626' },
  { bg: '#F3E8FF', icon: '#9333EA' },
  { bg: '#CCFBF1', icon: '#0D9488' },
];

const getAppColor = (index) => APP_COLORS[index % APP_COLORS.length];

const AppLauncher = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchApps();
  }, []);

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

  const filteredApps = apps.filter(app =>
    app.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">
      {/* Welcome Header */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 mb-8" data-testid="welcome-header">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-500 text-sm">Welcome</p>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">
              {user?.name || 'User'}
            </h1>
          </div>
          <div className="w-14 h-14 rounded-full bg-zinc-200 flex items-center justify-center border-2 border-zinc-300">
            <User size={28} className="text-zinc-500" />
          </div>
        </div>

        {/* Search */}
        <div className="mt-5 relative" data-testid="app-search">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 transition-colors"
            data-testid="search-input"
          />
        </div>
      </div>

      {/* Workplace Apps */}
      <div>
        <h2 className="font-heading font-bold text-lg text-zinc-900 mb-4">Workplace Apps</h2>

        {filteredApps.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 bg-zinc-100 rounded-2xl flex items-center justify-center">
              <MagnifyingGlass size={28} className="text-zinc-300" />
            </div>
            <h3 className="font-bold text-base mb-1 text-zinc-700">
              {search ? 'No matching apps' : 'No Apps Available'}
            </h3>
            <p className="text-sm text-zinc-400">
              {search ? 'Try a different search term.' : 'You have not been assigned to any applications yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" data-testid="apps-grid">
            {filteredApps.map((app, index) => {
              const color = getAppColor(index);
              return (
                <button
                  key={app.id}
                  onClick={() => launchApp(app)}
                  disabled={app.policy_blocked}
                  data-testid={`launch-app-${app.id}`}
                  className={`group relative flex flex-col items-center p-5 rounded-2xl border transition-all duration-200 ${
                    app.policy_blocked
                      ? 'opacity-50 cursor-not-allowed border-zinc-200 bg-zinc-50'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg cursor-pointer active:scale-[0.97]'
                  }`}
                >
                  {/* App Icon */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: color.bg }}
                  >
                    {app.logo_url ? (
                      <img src={app.logo_url} alt={app.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="font-bold text-xl" style={{ color: color.icon }}>
                        {app.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* App Name */}
                  <span className="text-sm font-semibold text-zinc-800 truncate w-full text-center">
                    {app.name}
                  </span>

                  {/* Blocked badge */}
                  {app.policy_blocked && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                      <LockSimple size={12} className="text-red-500" />
                    </div>
                  )}

                  {/* Hover arrow */}
                  {!app.policy_blocked && (
                    <ArrowSquareOut
                      size={14}
                      className="absolute top-2 right-2 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
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
