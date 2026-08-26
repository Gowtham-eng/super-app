import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';

const emptyForm = () => ({
  label: '',
  client_id: '',
  client_secret: '',
  email_domains: '',
  hosted_domain: '',
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

const GoogleSetup = () => {
  const { API, getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, metaRes] = await Promise.all([
        axios.get(`${API}/google-oauth/configs`, getAuthHeader()),
        axios.get(`${API}/google-oauth/callback-url`, getAuthHeader()),
      ]);
      setConfigs(cfgRes.data || []);
      setMeta(metaRes.data || null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load Google OAuth configs');
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
      client_id: cfg.client_id || '',
      client_secret: '',
      email_domains: (cfg.email_domains || []).join(', '),
      hosted_domain: cfg.hosted_domain || '',
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
    if (!form.label.trim() || !form.client_id.trim()) {
      toast.error('Label and Client ID are required');
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
        client_id: form.client_id.trim(),
        email_domains: domains,
        hosted_domain: form.hosted_domain.trim() || null,
        redirect_uri: form.redirect_uri.trim() || meta?.redirect_uri,
        status: form.status,
        scopes: ['openid', 'profile', 'email'],
      };
      if (form.client_secret.trim()) {
        payload.client_secret = form.client_secret.trim();
      }

      if (editingId) {
        await axios.put(`${API}/google-oauth/configs/${editingId}`, payload, getAuthHeader());
        toast.success('Google config updated');
      } else {
        await axios.post(`${API}/google-oauth/configs`, payload, getAuthHeader());
        toast.success('Google config added');
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
        `${API}/google-oauth/configs/${cfg.id}`,
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
    if (!window.confirm(`Delete Google config "${cfg.label}"?`)) return;
    try {
      await axios.delete(`${API}/google-oauth/configs/${cfg.id}`, getAuthHeader());
      toast.success('Deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
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
    <div className="animate-fadeIn" data-testid="google-oauth-setup-page">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">
            Google Login
          </h1>
          <p className="text-sm text-slate-400">
            Configure Google Workspace OAuth for RefexOne login (OIDC — not SAML).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
          data-testid="google-oauth-add"
        >
          <Plus size={16} />
          Add Google OAuth
        </button>
      </div>

      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-800 mb-1">Google Workspace setup</p>
          <p className="text-xs text-slate-500">
            Create an OAuth client in Google Cloud Console (Web application). Users must already
            exist in RefexOne (HR sync or admin-created). Google passwords are never copied —
            users sign in with Google on the login page.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">Redirect URI</span>
            <code className="text-xs bg-white border border-slate-200 px-2 py-1 rounded break-all">
              {meta?.redirect_uri || 'https://refexone.com/api/auth/google/callback'}
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
            <span className="text-slate-500 w-28 shrink-0">Setup guide</span>
            <a
              href={meta?.setup_guide_url || '/google-workspace-setup.html'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"
            >
              google-workspace-setup.html <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {configs.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center">
          <Mail className="mx-auto text-slate-300 mb-3" size={36} />
          <p className="text-slate-600 font-medium mb-1">No Google OAuth configurations yet</p>
          <p className="text-sm text-slate-400 mb-4">
            Add Client ID, Secret, and email domains for your Google Workspace.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm rounded-lg"
          >
            <Plus size={16} /> Add first Google OAuth
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              data-testid={`google-oauth-row-${cfg.id}`}
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
                <p className="text-xs text-slate-400 font-mono truncate mb-1">
                  Client ID: {cfg.client_id}
                </p>
                <p className="text-xs text-slate-500">
                  Domains: {(cfg.email_domains || []).map((d) => `@${d}`).join(', ')}
                  {cfg.hosted_domain ? ` · Workspace: @${cfg.hosted_domain}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleStatus(cfg)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Power size={14} />
                  {cfg.status === 'active' ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(cfg)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(cfg)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-red-100 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {editingId ? 'Edit Google OAuth' : 'Add Google OAuth'}
              </h2>
              <button type="button" onClick={() => setEditorOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Display name" required hint="Shown on login company picker">
                <input
                  className={inputClass}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Refex Google Workspace"
                />
              </Field>
              <Field label="OAuth Client ID" required>
                <input
                  className={monoClass}
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  placeholder="xxxx.apps.googleusercontent.com"
                />
              </Field>
              <Field
                label="OAuth Client Secret"
                required={!editingId}
                hint={editingId ? 'Leave blank to keep existing secret' : 'From Google Cloud Console'}
              >
                <input
                  className={monoClass}
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                  placeholder={editingId ? '•••••••• (unchanged)' : 'Client secret'}
                  autoComplete="new-password"
                />
              </Field>
              <Field
                label="Email domains"
                required
                hint="Comma-separated. Users with these domains can use this Google login."
              >
                <input
                  className={inputClass}
                  value={form.email_domains}
                  onChange={(e) => setForm({ ...form, email_domains: e.target.value })}
                  placeholder="refex.co.in"
                />
              </Field>
              <Field
                label="Hosted domain (optional)"
                hint="Google Workspace domain hint (hd=). Restricts account picker to this org."
              >
                <input
                  className={inputClass}
                  value={form.hosted_domain}
                  onChange={(e) => setForm({ ...form, hosted_domain: e.target.value })}
                  placeholder="refex.co.in"
                />
              </Field>
              <Field label="Redirect URI" hint="Must match Google OAuth client exactly">
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

export default GoogleSetup;
