import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Key, Copy, Trash2, Plus, Shield, ExternalLink, RefreshCw, Upload, CheckCircle, XCircle, Clock, Settings, ArrowUpRight } from 'lucide-react';

const SCIMSetup = () => {
  const { API, getAuthHeader } = useAuth();

  // Inbound SCIM tokens
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  // Kissflow outbound SCIM
  const [kfConfig, setKfConfig] = useState(null);
  const [kfConfigLoading, setKfConfigLoading] = useState(true);
  const [kfBaseUrl, setKfBaseUrl] = useState('');
  const [kfToken, setKfToken] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('outbound');

  useEffect(() => {
    fetchTokens();
    fetchKfConfig();
    fetchSyncLogs();
  }, []);

  const fetchTokens = async () => {
    try {
      const res = await axios.get(`${API}/scim/tokens`, getAuthHeader());
      setTokens(res.data);
    } catch (err) {
      toast.error('Failed to load SCIM tokens');
    } finally {
      setLoading(false);
    }
  };

  const fetchKfConfig = async () => {
    try {
      const res = await axios.get(`${API}/kissflow-scim/config`, getAuthHeader());
      setKfConfig(res.data);
      if (res.data.configured) {
        setKfBaseUrl(res.data.base_url || '');
      }
    } catch (err) {
      console.error('Failed to load Kissflow config');
    } finally {
      setKfConfigLoading(false);
    }
  };

  const fetchSyncLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await axios.get(`${API}/kissflow-scim/logs`, getAuthHeader());
      setSyncLogs(res.data);
    } catch (err) {
      console.error('Failed to load sync logs');
    } finally {
      setLogsLoading(false);
    }
  }, [API, getAuthHeader]);

  const generateToken = async () => {
    if (!label.trim()) { toast.error('Enter a label for the token'); return; }
    setCreating(true);
    try {
      const res = await axios.post(`${API}/scim/tokens`, { label: label.trim() }, getAuthHeader());
      setNewToken(res.data);
      setLabel('');
      fetchTokens();
      toast.success('SCIM token created');
    } catch (err) {
      toast.error('Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (tokenId) => {
    if (!window.confirm('Revoke this token? Any client using it will lose access.')) return;
    try {
      await axios.delete(`${API}/scim/tokens/${tokenId}`, getAuthHeader());
      toast.success('Token revoked');
      fetchTokens();
    } catch (err) {
      toast.error('Failed to revoke token');
    }
  };

  const saveKfConfig = async () => {
    if (!kfBaseUrl.trim() || !kfToken.trim()) {
      toast.error('Both URL and Token are required');
      return;
    }
    setSavingConfig(true);
    try {
      await axios.post(`${API}/kissflow-scim/config`, { base_url: kfBaseUrl, token: kfToken }, getAuthHeader());
      toast.success('Kissflow SCIM config saved');
      setKfToken('');
      fetchKfConfig();
    } catch (err) {
      toast.error('Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  };

  const triggerSync = async () => {
    if (!window.confirm('Push all users to Kissflow? This may take a few minutes for large user bases.')) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await axios.post(`${API}/kissflow-scim/sync`, {}, getAuthHeader());
      if (res.data.status === 'running') {
        toast.success('Sync started in background. Refreshing logs automatically...');
        setSyncResult({ message: 'Sync running in background...' });
        // Auto-refresh logs every 10 seconds while sync is running
        const interval = setInterval(async () => {
          try {
            const logsRes = await axios.get(`${API}/kissflow-scim/logs`, getAuthHeader());
            setSyncLogs(logsRes.data);
            const latest = logsRes.data[0];
            if (latest && latest.status !== 'running') {
              clearInterval(interval);
              setSyncing(false);
              const r = latest.result || {};
              if (r.error) {
                toast.error('Sync failed: ' + r.error);
              } else {
                toast.success(`Sync complete: ${r.created || 0} created, ${r.updated || 0} updated, ${(r.errors || []).length} errors`);
              }
              setSyncResult(r);
            }
          } catch (e) { /* ignore poll errors */ }
        }, 10000);
        // Safety: stop polling after 30 min
        setTimeout(() => { clearInterval(interval); setSyncing(false); }, 1800000);
        return; // Don't set syncing=false yet
      }
      setSyncResult(res.data);
      fetchSyncLogs();
      if (res.data.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Sync complete: ${res.data.created || 0} created, ${res.data.updated || 0} updated`);
      }
    } catch (err) {
      toast.error('Sync failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      if (!syncing) setSyncing(false);
    }
  };

  // Don't reset syncing in finally if background task
  const stopSyncing = () => setSyncing(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading || kfConfigLoading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn" data-testid="scim-setup-page">
      <div className="mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">SCIM User Provisioning</h1>
        <p className="text-sm text-slate-400">Manage inbound SCIM tokens and outbound Kissflow user sync.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit" data-testid="scim-tabs">
        <button
          onClick={() => setActiveTab('outbound')}
          data-testid="tab-outbound"
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'outbound' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Upload size={14} className="inline mr-1.5 -mt-0.5" />
          Push to Kissflow
        </button>
        <button
          onClick={() => setActiveTab('inbound')}
          data-testid="tab-inbound"
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'inbound' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Key size={14} className="inline mr-1.5 -mt-0.5" />
          Inbound SCIM Tokens
        </button>
      </div>

      {/* ==================== OUTBOUND: Push to Kissflow ==================== */}
      {activeTab === 'outbound' && (
        <div className="space-y-6">
          {/* Config Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="kf-config-section">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-semibold text-slate-800 flex items-center gap-2">
                  <Settings size={18} className="text-blue-500" /> Kissflow SCIM Configuration
                </h2>
                <p className="text-xs text-slate-400 mt-1">Configure the Kissflow SCIM endpoint to push users automatically.</p>
              </div>
              {kfConfig?.configured && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full" data-testid="kf-config-status">
                  <CheckCircle size={12} /> Connected
                </span>
              )}
            </div>

            {kfConfig?.configured && (
              <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <ExternalLink size={14} />
                  <span className="font-mono text-xs break-all">{kfConfig.base_url}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 mt-1">
                  <Key size={14} />
                  <span className="font-mono text-xs">{kfConfig.token_masked}</span>
                  <span className="text-xs text-slate-400">(from {kfConfig.source === 'env' ? 'environment' : 'database'})</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">SCIM Base URL</label>
                <input
                  type="text"
                  value={kfBaseUrl}
                  onChange={(e) => setKfBaseUrl(e.target.value)}
                  placeholder="https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  data-testid="kf-base-url-input"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Bearer Token</label>
                <input
                  type="password"
                  value={kfToken}
                  onChange={(e) => setKfToken(e.target.value)}
                  placeholder="At-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  data-testid="kf-token-input"
                />
              </div>
              <button
                onClick={saveKfConfig}
                disabled={savingConfig}
                data-testid="save-kf-config-btn"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>

          {/* Sync Trigger */}
          <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="kf-sync-section">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-semibold text-slate-800 flex items-center gap-2">
                  <ArrowUpRight size={18} className="text-emerald-500" /> Push Users to Kissflow
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Syncs all IAM users to Kissflow. Runs automatically after each nightly HR sync.
                </p>
              </div>
              <button
                onClick={triggerSync}
                disabled={syncing || !kfConfig?.configured}
                data-testid="trigger-kf-sync-btn"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            {!kfConfig?.configured && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                Configure the Kissflow SCIM endpoint above before syncing.
              </div>
            )}

            {/* Sync Result */}
            {syncResult && !syncResult.error && (
              <div className="bg-slate-50 rounded-lg p-4 mt-3" data-testid="sync-result">
                {syncResult.message ? (
                  <div className="flex items-center gap-3 text-blue-600">
                    <RefreshCw size={18} className="animate-spin" />
                    <span className="text-sm font-medium">{syncResult.message}</span>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Latest Sync Result</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                        <div className="text-2xl font-bold text-emerald-600" data-testid="sync-created">{syncResult.created}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Created</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                        <div className="text-2xl font-bold text-blue-600" data-testid="sync-updated">{syncResult.updated}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Updated</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                        <div className="text-2xl font-bold text-slate-600" data-testid="sync-deactivated">{syncResult.deactivated}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Deactivated</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                        <div className="text-2xl font-bold text-amber-500" data-testid="sync-auth-errors">{syncResult.auth_errors || 0}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Auth Errors</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                        <div className="text-2xl font-bold text-red-500" data-testid="sync-errors">{(syncResult.errors || []).length}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Errors</div>
                      </div>
                    </div>
                    {syncResult.auth_errors > 0 && (
                      <div className="mt-3 bg-amber-50 rounded-lg p-3 text-sm text-amber-700">
                        Auth errors detected. Please verify your SCIM token is valid and SCIM is enabled in Kissflow.
                      </div>
                    )}
                    {syncResult.errors && syncResult.errors.length > 0 && (
                      <div className="mt-3 bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <h4 className="text-xs font-semibold text-red-700 mb-1">Errors:</h4>
                        {syncResult.errors.slice(0, 20).map((err, i) => (
                          <p key={i} className="text-xs text-red-600 font-mono truncate">{err}</p>
                        ))}
                        {syncResult.errors.length > 20 && (
                          <p className="text-xs text-red-500 mt-1">...and {syncResult.errors.length - 20} more</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sync Logs */}
          <div className="bg-white rounded-xl border border-slate-200" data-testid="kf-sync-logs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-heading font-semibold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-slate-400" /> Sync History
              </h2>
              <button
                onClick={fetchSyncLogs}
                disabled={logsLoading}
                className="text-xs text-slate-400 hover:text-slate-600"
                data-testid="refresh-logs-btn"
              >
                <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            {syncLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Clock size={32} className="mx-auto mb-3 text-slate-300" />
                No sync history yet. Trigger a sync to get started.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {syncLogs.map((log, i) => {
                  const r = log.result || {};
                  const isRunning = log.status === 'running';
                  const hasError = !isRunning && (r.error || (r.errors && r.errors.length > 0) || r.auth_errors > 0);
                  return (
                    <div key={i} className="px-5 py-3 flex items-center justify-between" data-testid={`sync-log-${i}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          {isRunning ? (
                            <RefreshCw size={14} className="text-blue-500 animate-spin" />
                          ) : hasError ? (
                            <XCircle size={14} className="text-red-400" />
                          ) : (
                            <CheckCircle size={14} className="text-emerald-500" />
                          )}
                          <span className="text-sm font-medium text-slate-800">
                            {isRunning ? 'Syncing...' : r.error ? 'Failed' : `${r.created || 0} created, ${r.updated || 0} updated`}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {log.trigger_type === 'scheduled_hr_sync' ? 'Auto (HR Sync)' : log.trigger_type === 'manual_single' ? `Manual (${log.email})` : 'Manual (Full)'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {r.total ? ` | ${r.total} users processed` : ''}
                          {r.auth_errors > 0 ? ` | ${r.auth_errors} auth errors` : ''}
                          {r.errors && r.errors.length > 0 ? ` | ${r.errors.length} errors` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== INBOUND: SCIM Token Management ==================== */}
      {activeTab === 'inbound' && (
        <div className="space-y-6">
          {/* Setup Guide */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5" data-testid="scim-guide">
            <h3 className="font-semibold text-emerald-800 text-sm mb-2 flex items-center gap-2">
              <Shield size={16} /> How to connect Kissflow to this SCIM Server
            </h3>
            <ol className="text-sm text-emerald-700 space-y-2 list-decimal list-inside">
              <li>Generate a SCIM token below</li>
              <li>In Kissflow, go to <strong>Account Administration &gt; User Provisioning &gt; SCIM &gt; Configure</strong></li>
              <li>Paste the <strong>SCIM Base URL</strong> and <strong>Bearer Token</strong> from below</li>
              <li>Test the connection, then enable SCIM in Kissflow</li>
            </ol>
          </div>

          {/* Generate New Token */}
          <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="generate-token-section">
            <h2 className="font-heading font-semibold text-slate-800 mb-3">Generate SCIM Token</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Token label (e.g., Kissflow Production)"
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                data-testid="token-label-input"
              />
              <button
                onClick={generateToken}
                disabled={creating}
                data-testid="generate-token-btn"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <Plus size={16} /> {creating ? 'Creating...' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Newly Created Token */}
          {newToken && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5" data-testid="new-token-display">
              <h3 className="font-semibold text-amber-800 text-sm mb-3">New Token Created - Copy Now!</h3>
              <p className="text-xs text-amber-600 mb-3">This token will only be shown once. Copy it now.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">SCIM Base URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded-lg text-sm border border-amber-200 break-all" data-testid="scim-base-url">
                      {newToken.scim_base_url}
                    </code>
                    <button onClick={() => copyToClipboard(newToken.scim_base_url)} className="p-2 hover:bg-amber-100 rounded-lg" data-testid="copy-base-url">
                      <Copy size={16} className="text-amber-600" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Bearer Token</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded-lg text-sm border border-amber-200 break-all font-mono" data-testid="scim-bearer-token">
                      {newToken.token}
                    </code>
                    <button onClick={() => copyToClipboard(newToken.token)} className="p-2 hover:bg-amber-100 rounded-lg" data-testid="copy-token">
                      <Copy size={16} className="text-amber-600" />
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={() => setNewToken(null)} className="mt-3 text-xs text-amber-600 hover:text-amber-800">
                Dismiss
              </button>
            </div>
          )}

          {/* Existing Tokens */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-heading font-semibold text-slate-800">Active Tokens</h2>
            </div>
            {tokens.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Key size={32} className="mx-auto mb-3 text-slate-300" />
                No SCIM tokens yet. Generate one to get started.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tokens.map(t => (
                  <div key={t.id} className="px-5 py-4 flex items-center justify-between" data-testid={`token-${t.id}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                        <Key size={14} className="text-emerald-500" />
                        {t.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <ExternalLink size={10} /> {t.scim_base_url}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeToken(t.id)}
                      data-testid={`revoke-${t.id}`}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SCIMSetup;
