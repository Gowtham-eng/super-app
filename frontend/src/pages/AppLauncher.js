import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { SquaresFour, ArrowSquareOut, LockSimple, Warning } from '@phosphor-icons/react';

const AppLauncher = () => {
  const { API, getAuthHeader } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

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
    // Launch URL already includes /api prefix, use base URL
    const baseUrl = process.env.REACT_APP_BACKEND_URL;
    toast.success(`Launching ${app.name}...`);
    window.open(`${baseUrl}${app.launch_url}`, '_blank');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
          <SquaresFour weight="bold" className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">App Launcher</h1>
          <p className="text-zinc-500">Access your applications</p>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="card-brutalist p-12 text-center">
          <SquaresFour size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">No Apps Available</h3>
          <p className="text-zinc-500">You don't have access to any applications yet.</p>
          <p className="text-sm text-zinc-400 mt-2">Request access from the App Catalog.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => launchApp(app)}
              disabled={app.policy_blocked}
              data-testid={`launch-app-${app.id}`}
              className={`card-brutalist p-6 text-center group transition-all ${
                app.policy_blocked 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:border-[#0051FF] hover:shadow-md cursor-pointer'
              }`}
            >
              <div className="relative">
                {app.logo_url ? (
                  <img src={app.logo_url} alt={app.name} className="w-16 h-16 mx-auto mb-3 object-contain" />
                ) : (
                  <div className={`w-16 h-16 mx-auto mb-3 flex items-center justify-center text-white font-bold text-xl ${
                    app.type === 'saml' ? 'bg-[#0051FF]' : 'bg-[#00CC66]'
                  }`}>
                    {app.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {app.policy_blocked && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#FF3333] flex items-center justify-center">
                    <LockSimple size={14} className="text-white" />
                  </div>
                )}
              </div>
              <h3 className="font-bold text-sm truncate">{app.name}</h3>
              <p className="text-xs text-zinc-500 uppercase mt-1">{app.type}</p>
              {!app.policy_blocked && (
                <ArrowSquareOut size={16} className="text-zinc-300 group-hover:text-[#0051FF] mx-auto mt-2 transition-colors" />
              )}
              {app.policy_blocked && (
                <div className="flex items-center justify-center gap-1 mt-2 text-xs text-[#FF3333]">
                  <Warning size={12} /> Blocked
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AppLauncher;
