import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Key, Copy, Trash2, Plus, Shield, ExternalLink } from 'lucide-react';

const SCIMSetup = () => {
  const { API, getAuthHeader } = useAuth();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchTokens(); }, []);

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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn" data-testid="scim-setup-page">
      <div className="mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">SCIM Provisioning</h1>
        <p className="text-sm text-slate-400">Configure SCIM v2 endpoints for automatic user provisioning with Kissflow or other IdPs.</p>
      </div>

      {/* Setup Guide */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6" data-testid="scim-guide">
        <h3 className="font-semibold text-emerald-800 text-sm mb-2 flex items-center gap-2">
          <Shield size={16} /> How to connect with Kissflow
        </h3>
        <ol className="text-sm text-emerald-700 space-y-2 list-decimal list-inside">
          <li>Generate a SCIM token below</li>
          <li>In Kissflow, go to <strong>Account Administration &gt; User Provisioning &gt; SCIM &gt; Configure</strong></li>
          <li>Paste the <strong>SCIM Base URL</strong> and <strong>Bearer Token</strong> from below</li>
          <li>Test the connection, then enable SCIM in Kissflow</li>
        </ol>
      </div>

      {/* Generate New Token */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6" data-testid="generate-token-section">
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

      {/* Newly Created Token (shown once) */}
      {newToken && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6" data-testid="new-token-display">
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
  );
};

export default SCIMSetup;
