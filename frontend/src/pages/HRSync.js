import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle, AlertTriangle, Users, UserMinus, UserCheck } from 'lucide-react';

const HRSync = () => {
  const { API, getAuthHeader } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API}/hr-sync/logs`, getAuthHeader());
      setLogs(res.data);
    } catch (err) {
      toast.error('Failed to load sync logs');
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await axios.post(`${API}/hr-sync/trigger`, {}, getAuthHeader());
      setLastResult(res.data);
      if (res.data.errors?.length) {
        toast.error(res.data.errors[0]);
      } else {
        const updated = res.data.updated || 0;
        toast.success(
          `Sync complete: ${updated} user profiles updated, ${res.data.created} created, ${res.data.disabled} disabled`
        );
      }
      fetchLogs();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail) {
        setLastResult({ total: 0, created: 0, disabled: 0, updated: 0, errors: [detail] });
      }
      toast.error(detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  const displayResult = lastResult || logs[0]?.result;

  return (
    <div className="animate-fadeIn" data-testid="hr-sync-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">HR Sync</h1>
          <p className="text-sm text-slate-400">
            Pulls employee data from Adrenalin into RefexOne users (department, manager, location, etc.).
          </p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          data-testid="trigger-sync-btn"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {displayResult && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6" data-testid="sync-stats">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-blue-500" />
              <span className="text-xs text-slate-400">From Adrenalin</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{displayResult.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={16} className="text-indigo-500" />
              <span className="text-xs text-slate-400">Profiles Updated</span>
            </div>
            <p className="text-2xl font-bold text-indigo-600">{displayResult.updated || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-emerald-500" />
              <span className="text-xs text-slate-400">Created</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{displayResult.created || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserMinus size={16} className="text-amber-500" />
              <span className="text-xs text-slate-400">Disabled</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{displayResult.disabled || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className="text-red-500" />
              <span className="text-xs text-slate-400">Errors</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{displayResult.errors?.length || 0}</p>
          </div>
        </div>
      )}

      {displayResult && !displayResult.errors?.length && (displayResult.updated || displayResult.created) > 0 && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          User data is updated in RefexOne. View details on the{' '}
          <Link to="/users" className="font-semibold underline">Users</Link> page
          (department, designation, manager, location). Kissflow SCIM push runs in the background.
        </div>
      )}

      {displayResult?.errors?.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800 mb-1">Sync errors</p>
          <ul className="text-xs text-red-700 space-y-1 list-disc pl-4">
            {displayResult.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-heading font-semibold text-slate-800">Sync History</h2>
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No sync runs yet. Click "Sync Now" to start.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log, i) => (
              <div key={i} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid={`sync-log-${i}`}>
                <div>
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{new Date(log.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                  {log.result?.errors?.length > 0 && (
                    <p className="text-xs text-red-400 mt-0.5">{log.result.errors.length} error(s)</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-400">Total: <span className="font-medium text-slate-700">{log.result?.total || 0}</span></span>
                  <span className="text-indigo-600">{log.result?.updated || 0} updated</span>
                  <span className="text-emerald-600">+{log.result?.created || 0} created</span>
                  <span className="text-amber-600">{log.result?.disabled || 0} disabled</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HRSync;
