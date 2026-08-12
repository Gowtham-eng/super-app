import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  Building2,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

const emptyForm = () => ({
  label: '',
  tenant_id: '',
  client_id: '',
  client_secret: '',
  email_domains: '',
  redirect_uri: '',
  status: 'active',
});

const Field = ({ label, hint, children, required }) => (
  <div>
    <label className="text-xs font-medium text-slate-500 block mb-1">
      {label}
      {required ? ' *' : ''}
    </label>
    {children}
    {hint ? <p className="text-[11px] text-slate-400 mt-1">{hint}</p> : null}
  </div>
);

const inputClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const monoClass = `${inputClass} font-mono text-[13px]`;

const AzureADSetup = () => {
  const { API, getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, metaRes] = await Promise.all([
        axios.get(`${API}/azure-ad/configs`, getAuthHeader()),
        axios.get(`${API}/azure-ad/callback-url`, getAuthHeader()),
      ]);
      setConfigs(cfgRes.data || []);
      setMeta(metaRes.data || null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load Azure AD configs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      redirect_uri: meta?.redirect_uri || '',
    });
    setEditorOpen(true);
  };

  const openEdit = (cfg) => {
    setEditingId(cfg.id);
    setForm({
      label: cfg.label || '',
      tenant_id: cfg.tenant_id || '',
      client_id: cfg.client_id || '',
      client_secret: '',
      email_domains: (cfg.email_domains || []).join(', '),
      redirect_uri: cfg.redirect_uri || meta?.redirect_uri || '',
      status: cfg.status || 'active',
    });
    setEditorOpen(true);
  };

  const parseDomains = (raw) =>
    (raw || '')
      .split(/[,;\s]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);

  const save = async () => {
    if (!form.label.trim() || !form.tenant_id.trim() || !form.client_id.trim()) {
      toast.error('Label, Tenant ID and Client ID are required');
      return;
    }
    if (!editingId && !form.client_secret.trim()) {
      toast.error('Client Secret is required for new configs');
      return;
    }
    const domains = parseDomains(form.email_domains);
    if (!domains.length) {
      toast.error('Add at least one email domain (e.g. refex.co.in)');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        tenant_id: form.tenant_id.trim(),
        client_id: form.client_id.trim(),
        email_domains: domains,
        redirect_uri: form.redirect_uri.trim() || meta?.redirect_uri,
        status: form.status,
        scopes: ['openid', 'profile', 'email', 'offline_access'],
      };
      if (form.client_secret.trim()) {
        payload.client_secret = form.client_secret.trim();
      }

      if (editingId) {
        await axios.put(`${API}/azure-ad/configs/${editingId}`, payload, getAuthHeader());
        toast.success('Azure AD config updated');
      } else {
        await axios.post(`${API}/azure-ad/configs`, payload, getAuthHeader());
        toast.success('Azure AD config added');
      }
      setEditorOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (cfg) => {
    const next = cfg.status === 'active' ? 'disabled' : 'active';
    try {
      await axios.put(
        `${API}/azure-ad/configs/${cfg.id}`,
        { status: next },
        getAuthHeader()
      );
      toast.success(next === 'active' ? 'Enabled' : 'Disabled');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Update failed');
    }
  };

  const remove = async (cfg) => {
    if (!window.confirm(`Delete Azure AD config "${cfg.label}"?`)) return;
    try {
      await axios.delete(`${API}/azure-ad/configs/${cfg.id}`, getAuthHeader());
      toast.success('Deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const syncUsers = async (cfg) => {
    if (
      !window.confirm(
        `Pull users from "${cfg.label}" Azure AD into RefexOne?\n\nRequires Graph permission User.Read.All + admin consent on that app.`
      )
    ) {
      return;
    }
    setSyncingId(cfg.id);
    setLastSync(null);
    try {
      const res = await axios.post(
        `${API}/azure-ad/configs/${cfg.id}/sync-users`,
        {},
        getAuthHeader()
      );
      setLastSync(res.data);
      toast.success(
        `${cfg.label}: ${res.data.created || 0} created, ${res.data.updated || 0} updated, ${res.data.disabled || 0} disabled`
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || 'User sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn" data-testid="azure-ad-setup-page">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">
            Azure AD Login
          </h1>
          <p className="text-sm text-slate-400">
            Configure multiple Microsoft Entra ID tenants for RefexOne login (OIDC — not SAML).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
          data-testid="azure-ad-add"
        >
          <Plus size={16} />
          Add Azure AD
        </button>
      </div>

      {/* Handoff info */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-800 mb-1">Multi-company setup (Extrovis, Kavipharm, …)</p>
          <p className="text-xs text-slate-500">
            Add <strong>one Azure AD config per company</strong>. Use <strong>Sync users</strong> on each row to pull
            that tenant’s users into RefexOne. Ask each AD team for Application permission{' '}
            <code className="bg-white border px-1 rounded">User.Read.All</code> + admin consent.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">Redirect URI</span>
            <code className="text-xs bg-white border border-slate-200 px-2 py-1 rounded break-all">
              {meta?.redirect_uri || 'https://refexone.com/api/auth/azure/callback'}
            </code>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-800"
              onClick={() => copy(meta?.redirect_uri || '')}
            >
              <Copy size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">AD setup page</span>
            <a
              href={meta?.setup_guide_url || '/azure-ad-team-setup.html'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"
            >
              azure-ad-team-setup.html <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {lastSync && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-900">
          Last sync (<strong>{lastSync.label}</strong>): fetched {lastSync.fetched}, created {lastSync.created},
          updated {lastSync.updated}, disabled {lastSync.disabled}, skipped {lastSync.skipped}
          {lastSync.errors?.length ? (
            <span className="block text-amber-800 mt-1 text-xs">
              {lastSync.errors.length} error(s): {lastSync.errors[0]}
            </span>
          ) : null}
        </div>
      )}

      {configs.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center">
          <Building2 className="mx-auto text-slate-300 mb-3" size={36} />
          <p className="text-slate-600 font-medium mb-1">No Azure AD configurations yet</p>
          <p className="text-sm text-slate-400 mb-4">
            Add one config per company Entra tenant (Tenant ID, Client ID, Secret, domains).
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm rounded-lg"
          >
            <Plus size={16} /> Add first Azure AD
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              data-testid={`azure-ad-row-${cfg.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900 truncate">{cfg.label}</h3>
                  {cfg.status === 'active' ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle size={12} /> Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono truncate mb-1">
                  Tenant: {cfg.tenant_id}
                </p>
                <p className="text-xs text-slate-500 font-mono truncate mb-1">
                  Client: {cfg.client_id}
                </p>
                <p className="text-xs text-slate-600">
                  Domains:{' '}
                  {(cfg.email_domains || []).map((d) => (
                    <span
                      key={d}
                      className="inline-block mr-1 mb-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-700"
                    >
                      @{d}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <button
                  type="button"
                  title="Pull users from this Azure AD"
                  onClick={() => syncUsers(cfg)}
                  disabled={syncingId === cfg.id || cfg.status !== 'active'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  {syncingId === cfg.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Sync users
                </button>
                <button
                  type="button"
                  title={cfg.status === 'active' ? 'Disable' : 'Enable'}
                  onClick={() => toggleStatus(cfg)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Power size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(cfg)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(cfg)}
                  className="p-2 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {editingId ? 'Edit Azure AD' : 'Add Azure AD'}
              </h2>
              <button type="button" onClick={() => setEditorOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Display name" required hint="Shown on login company picker">
                <input
                  className={inputClass}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Refex Group Entra"
                />
              </Field>
              <Field label="Directory (Tenant) ID" required>
                <input
                  className={monoClass}
                  value={form.tenant_id}
                  onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Application (Client) ID" required>
                <input
                  className={monoClass}
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field
                label="Client Secret"
                required={!editingId}
                hint={editingId ? 'Leave blank to keep existing secret' : 'Paste the secret Value from Azure'}
              >
                <input
                  className={monoClass}
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                  placeholder={editingId ? '•••••••• (unchanged)' : 'Secret value'}
                  autoComplete="new-password"
                />
              </Field>
              <Field
                label="Email domains"
                required
                hint="Comma-separated. Users with these domains use this AD."
              >
                <input
                  className={inputClass}
                  value={form.email_domains}
                  onChange={(e) => setForm({ ...form, email_domains: e.target.value })}
                  placeholder="refex.co.in, refex.group"
                />
              </Field>
              <Field label="Redirect URI" hint="Must match Azure App Registration exactly">
                <input
                  className={monoClass}
                  value={form.redirect_uri}
                  onChange={(e) => setForm({ ...form, redirect_uri: e.target.value })}
                  placeholder={meta?.redirect_uri}
                />
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white inline-flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {editingId ? 'Save changes' : 'Add config'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AzureADSetup;
