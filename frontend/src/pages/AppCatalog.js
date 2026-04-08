import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Search, Check, Clock, Send } from 'lucide-react';

const APP_COLORS = [
  { bg: 'bg-blue-50', text: 'text-blue-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { bg: 'bg-violet-50', text: 'text-violet-600' },
  { bg: 'bg-amber-50', text: 'text-amber-600' },
  { bg: 'bg-cyan-50', text: 'text-cyan-600' },
  { bg: 'bg-rose-50', text: 'text-rose-600' },
];

const getColor = (i) => APP_COLORS[i % APP_COLORS.length];

const AppCatalog = () => {
  const { API, getAuthHeader } = useAuth();
  const [apps, setApps] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [appsRes, reqRes] = await Promise.all([
        axios.get(`${API}/catalog/apps`, getAuthHeader()),
        axios.get(`${API}/access-requests/my`, getAuthHeader()).catch(() => ({ data: [] }))
      ]);
      setApps(appsRes.data);
      setPendingRequests(reqRes.data);
    } catch (error) {
      toast.error('Failed to load catalog');
    } finally {
      setLoading(false);
    }
  };

  const requestAccess = async (appId) => {
    try {
      await axios.post(`${API}/access-requests`, { app_id: appId, reason: 'Access needed for work' }, getAuthHeader());
      toast.success('Access requested! An admin will review your request.');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request access');
    }
  };

  const getRequestStatus = (appId) => {
    const req = pendingRequests.find(r => r.app_id === appId);
    return req?.status || null;
  };

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn max-w-5xl" data-testid="app-catalog">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          App Catalog
        </h1>
        <p className="text-sm text-slate-500 mt-1">Browse available applications and request access</p>
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-8">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search applications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            data-testid="catalog-search"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-xl">
          <Search size={32} className="text-slate-300 mx-auto mb-3" />
          <h3 className="font-heading font-semibold text-slate-700">No applications found</h3>
          <p className="text-sm text-slate-400 mt-1">No applications match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="catalog-grid">
          {filtered.map((app, i) => {
            const c = getColor(i);
            const reqStatus = getRequestStatus(app.id);
            return (
              <div key={app.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-emerald-200 transition-all" data-testid={`catalog-app-${app.id}`}>
                <div className="flex items-start gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                    {app.logo_url ? (
                      <img src={app.logo_url} alt={app.name} className="w-7 h-7 object-contain" />
                    ) : (
                      <span className={`font-heading font-semibold text-lg ${c.text}`}>{app.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-semibold text-slate-800">{app.name}</h3>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase font-medium">{app.type}</span>
                  </div>
                </div>
                {app.description && <p className="text-sm text-slate-500 mb-4 line-clamp-2">{app.description}</p>}

                {/* Access Status */}
                {app.has_access ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <Check size={16} className="text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">Access Granted</span>
                  </div>
                ) : reqStatus === 'pending' ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Clock size={16} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-700">Request Pending</span>
                  </div>
                ) : (
                  <Button onClick={() => requestAccess(app.id)} className="btn-primary w-full" data-testid={`request-access-${app.id}`}>
                    <Send size={14} className="mr-2" /> Request Access
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AppCatalog;
