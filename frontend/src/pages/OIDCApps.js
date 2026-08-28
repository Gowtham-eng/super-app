import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { Key, Plus, PencilSimple, Trash, Copy, Eye, EyeSlash, X, Upload, Globe, MagnifyingGlass, Lock } from '@phosphor-icons/react';

const OIDCApps = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState({});
  const [newRedirectUri, setNewRedirectUri] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [editingUris, setEditingUris] = useState({}); // {appId: [uri,uri]}
  const [newUriInput, setNewUriInput] = useState({}); // {appId: 'https://...'}
  const [savingUris, setSavingUris] = useState({});
  const [editingField, setEditingField] = useState({}); // {appId_fieldKey: 'new value'}
  const [savingField, setSavingField] = useState({});
  const logoInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '', description: '', redirect_uris: [], logout_uris: [],
    scopes: ['openid', 'profile', 'email'], grant_types: ['authorization_code'],
    logo_url: '', home_url: '', allowed_group_ids: [], allowed_role_ids: [],
    category: '', sort_order: 99, is_placeholder: false, restricted: false
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [appsRes, groupsRes, rolesRes] = await Promise.all([
        axios.get(`${API}/apps/oidc`, getAuthHeader()),
        axios.get(`${API}/groups`, getAuthHeader()),
        axios.get(`${API}/roles`, getAuthHeader())
      ]);
      setApps(appsRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/upload/logo`, formData, getAuthHeader());
      setForm({ ...form, logo_url: res.data.logo_url });
      setLogoPreview(res.data.logo_url);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error('Upload failed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.redirect_uris.length === 0) {
      toast.error('At least one redirect URI is required');
      return;
    }
    setSaving(true);
    try {
      if (selectedApp) {
        await axios.put(`${API}/apps/oidc/${selectedApp.id}`, form, getAuthHeader());
        toast.success('App updated');
      } else {
        const response = await axios.post(`${API}/apps/oidc`, { ...form, org_id: user.org_id }, getAuthHeader());
        if (response.data.client_secret) {
          toast.success('App created! Copy the client secret now - it won\'t be shown again.', { duration: 10000 });
          setShowSecret({ [response.data.id]: response.data.client_secret });
        }
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save app');
    } finally {
      setSaving(false);
    }
  };

  const deleteApp = async (app) => {
    if (!window.confirm(`Delete ${app.name}?`)) return;
    try {
      await axios.delete(`${API}/apps/oidc/${app.id}`, getAuthHeader());
      toast.success('App deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete app');
    }
  };

  const editApp = (app) => {
    setSelectedApp(app);
    setForm({
      name: app.name, description: app.description || '', redirect_uris: app.redirect_uris || [],
      logout_uris: app.logout_uris || [], scopes: app.scopes || ['openid', 'profile', 'email'],
      grant_types: app.grant_types || ['authorization_code'], logo_url: app.logo_url || '',
      home_url: app.home_url || '',
      allowed_group_ids: app.allowed_group_ids || [], allowed_role_ids: app.allowed_role_ids || [],
      category: app.category || '', sort_order: app.sort_order ?? 99,
      is_placeholder: !!app.is_placeholder, restricted: !!app.restricted
    });
    setLogoPreview(app.logo_url || null);
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedApp(null);
    setForm({
      name: '', description: '', redirect_uris: [], logout_uris: [],
      scopes: ['openid', 'profile', 'email'], grant_types: ['authorization_code'],
      logo_url: '', home_url: '', allowed_group_ids: [], allowed_role_ids: [],
      category: '', sort_order: 99, is_placeholder: false, restricted: false
    });
    setNewRedirectUri('');
    setLogoPreview(null);
  };

  const addRedirectUri = () => {
    if (newRedirectUri && !form.redirect_uris.includes(newRedirectUri)) {
      setForm({ ...form, redirect_uris: [...form.redirect_uris, newRedirectUri] });
      setNewRedirectUri('');
    }
  };

  const removeRedirectUri = (uri) => {
    setForm({ ...form, redirect_uris: form.redirect_uris.filter(u => u !== uri) });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  // Inline edit helpers for Redirect URIs
  const startEditUris = (app) => {
    setEditingUris({ ...editingUris, [app.id]: [...(app.redirect_uris || [])] });
    setNewUriInput({ ...newUriInput, [app.id]: '' });
  };
  const cancelEditUris = (appId) => {
    const next = { ...editingUris };
    delete next[appId];
    setEditingUris(next);
  };
  const addUriDraft = (appId) => {
    const v = (newUriInput[appId] || '').trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) {
      toast.error('URI must start with http:// or https://');
      return;
    }
    const list = editingUris[appId] || [];
    if (list.includes(v)) { toast.error('Already added'); return; }
    setEditingUris({ ...editingUris, [appId]: [...list, v] });
    setNewUriInput({ ...newUriInput, [appId]: '' });
  };
  const removeUriDraft = (appId, idx) => {
    const list = [...(editingUris[appId] || [])];
    list.splice(idx, 1);
    setEditingUris({ ...editingUris, [appId]: list });
  };
  const saveUris = async (appId) => {
    setSavingUris({ ...savingUris, [appId]: true });
    try {
      await axios.put(`${API}/apps/oidc/${appId}`, { redirect_uris: editingUris[appId] || [] }, getAuthHeader());
      toast.success('Redirect URIs updated');
      cancelEditUris(appId);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSavingUris({ ...savingUris, [appId]: false });
    }
  };

  const regenerateSecret = async (app) => {
    if (!window.confirm(`Regenerate client secret for "${app.name}"?\n\nThis will invalidate the current secret immediately. You must update it in the SP application.`)) return;
    try {
      const res = await axios.post(`${API}/apps/oidc/${app.id}/regenerate-secret`, {}, getAuthHeader());
      setShowSecret({ ...showSecret, [app.id]: res.data.client_secret });
      toast.success('Client secret regenerated. Copy it now — it will only be shown once.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to regenerate');
    }
  };

  // Inline edit a single credential field (client_id / *_endpoint)
  const startEditField = (appId, key, currentValue) => {
    setEditingField({ ...editingField, [`${appId}_${key}`]: currentValue || '' });
  };
  const cancelEditField = (appId, key) => {
    const next = { ...editingField };
    delete next[`${appId}_${key}`];
    setEditingField(next);
  };
  const saveField = async (appId, key) => {
    const value = (editingField[`${appId}_${key}`] || '').trim();
    if (!value) {
      toast.error('Value cannot be empty');
      return;
    }
    if (key !== 'client_id' && !/^https?:\/\//i.test(value)) {
      toast.error('URL must start with http:// or https://');
      return;
    }
    setSavingField({ ...savingField, [`${appId}_${key}`]: true });
    try {
      await axios.put(`${API}/apps/oidc/${appId}`, { [key]: value }, getAuthHeader());
      toast.success(`${key.replace(/_/g, ' ')} updated`);
      cancelEditField(appId, key);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      const next = { ...savingField };
      delete next[`${appId}_${key}`];
      setSavingField(next);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  // Gradient palette per category (for logo tile background)
  const categoryGradient = (cat) => {
    const map = {
      Expense: 'from-amber-100 to-orange-50',
      Productivity: 'from-violet-100 to-indigo-50',
      Facility: 'from-sky-100 to-cyan-50',
      Reports: 'from-teal-100 to-emerald-50',
      Support: 'from-emerald-100 to-teal-50',
      HR: 'from-rose-100 to-pink-50',
    };
    return map[cat] || 'from-emerald-100 to-teal-50';
  };
  const categoryBadge = (cat) => {
    const map = {
      Expense: 'bg-amber-50 text-amber-700 border-amber-200',
      Productivity: 'bg-violet-50 text-violet-700 border-violet-200',
      Facility: 'bg-sky-50 text-sky-700 border-sky-200',
      Reports: 'bg-teal-50 text-teal-700 border-teal-200',
      Support: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      HR: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    return map[cat] || 'bg-slate-50 text-slate-600 border-slate-200';
  };

  const filteredApps = apps.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q) ||
      a.client_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-fadeIn" data-testid="oidc-apps-page">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-100 p-6 mb-6">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-emerald-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-4 bottom-0 w-32 h-32 bg-cyan-200/40 rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-emerald-100 flex items-center justify-center">
              <Key weight="duotone" className="text-emerald-600 w-7 h-7" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">OIDC Applications</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/70 border border-emerald-100 text-emerald-700 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {apps.length} application{apps.length !== 1 ? 's' : ''} configured
                </span>
              </p>
            </div>
          </div>
          <Button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-5 py-2.5 shadow-sm hover:shadow-md transition-all"
            data-testid="add-oidc-app"
          >
            <Plus size={18} className="mr-2" /> Add OIDC App
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {apps.length > 0 && (
        <div className="relative mb-6">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, description, category or client ID..."
            className="pl-11 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-emerald-200"
            data-testid="oidc-search-input"
          />
        </div>
      )}

      {apps.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 mx-auto mb-4 flex items-center justify-center">
            <Key size={32} className="text-emerald-500" weight="duotone" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-2 text-slate-700">No OIDC Apps yet</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">Configure your first OpenID Connect application to enable secure SSO via OAuth2.</p>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
            <Plus size={16} className="mr-2" /> Create your first app
          </Button>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <MagnifyingGlass size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No apps match &quot;{search}&quot;</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredApps.map((app) => {
            const isExpanded = !!expanded[app.id];
            return (
              <div
                key={app.id}
                className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-emerald-200 hover:-translate-y-0.5 transition-all duration-200"
                data-testid={`oidc-app-${app.id}`}
              >
                {/* Card Header */}
                <div className="p-5 flex items-start gap-4">
                  {/* Logo tile */}
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${categoryGradient(app.category)} flex items-center justify-center shrink-0 border border-white shadow-sm`}>
                    {app.logo_url ? (
                      <img src={app.logo_url} alt={app.name} className="w-12 h-12 object-contain" />
                    ) : (
                      <span className="text-2xl font-semibold text-slate-700">{app.name?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-lg text-slate-900 truncate">{app.name}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {app.status || 'active'}
                      </span>
                      {app.category && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${categoryBadge(app.category)}`}>
                          {app.category}
                        </span>
                      )}
                      {app.is_placeholder && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    {app.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{app.description}</p>
                    )}
                    {app.home_url && (
                      <a href={app.home_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-600 hover:text-emerald-700 hover:underline">
                        <Globe size={12} /> {app.home_url}
                      </a>
                    )}
                  </div>

                  {/* Actions — always visible on the card */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => editApp(app)}
                      className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded-xl px-3 py-2 text-sm font-medium transition-all"
                      data-testid={`edit-oidc-${app.id}`}
                    >
                      <PencilSimple size={15} className="mr-1.5" /> Edit
                    </Button>
                    <Button
                      onClick={() => deleteApp(app)}
                      className="bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl p-2 transition-all"
                      data-testid={`delete-oidc-${app.id}`}
                      aria-label="Delete"
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                </div>

                {/* Quick info strip */}
                <div className="px-5 pb-3 flex items-center gap-4 flex-wrap text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Key size={12} />
                    <span className="font-mono text-slate-600">{app.client_id}</span>
                    <button
                      onClick={() => copyToClipboard(app.client_id)}
                      className="text-slate-300 hover:text-emerald-600 transition-colors"
                      title="Copy Client ID"
                    >
                      <Copy size={11} />
                    </button>
                  </span>
                  <span>•</span>
                  <span>{app.redirect_uris?.length || 0} redirect URI{(app.redirect_uris?.length || 0) !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span>{app.scopes?.length || 0} scope{(app.scopes?.length || 0) !== 1 ? 's' : ''}</span>
                </div>

                {/* Toggle for details */}
                <button
                  onClick={() => setExpanded({ ...expanded, [app.id]: !isExpanded })}
                  className="w-full px-5 py-2.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/60 border-t border-slate-100 flex items-center justify-center gap-1.5 transition-colors"
                  data-testid={`toggle-details-${app.id}`}
                >
                  {isExpanded ? 'Hide integration details' : 'Show integration details'}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-5 space-y-4">
                    {/* Redirect URIs — editable */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Redirect URIs</p>
                        {editingUris[app.id] === undefined ? (
                          <button
                            onClick={() => startEditUris(app)}
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
                            data-testid={`edit-uris-${app.id}`}
                          >
                            <PencilSimple size={12} /> Edit URIs
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => cancelEditUris(app.id)}
                              className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                            >
                              Cancel
                            </button>
                            <Button
                              onClick={() => saveUris(app.id)}
                              disabled={savingUris[app.id]}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 h-auto rounded-md"
                              data-testid={`save-uris-${app.id}`}
                            >
                              {savingUris[app.id] ? 'Saving...' : 'Save'}
                            </Button>
                          </div>
                        )}
                      </div>

                      {editingUris[app.id] === undefined ? (
                        <div className="flex flex-wrap gap-2">
                          {app.redirect_uris?.length ? app.redirect_uris.map((uri, i) => (
                            <span key={i} className="font-mono text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-md text-slate-700">{uri}</span>
                          )) : <span className="text-xs text-slate-400 italic">None configured</span>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(editingUris[app.id] || []).length === 0 && (
                            <p className="text-xs text-slate-400 italic">No redirect URIs yet. Add one below.</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {(editingUris[app.id] || []).map((uri, i) => (
                              <span key={i} className="font-mono text-xs bg-white border border-emerald-200 px-2.5 py-1 rounded-md text-slate-700 flex items-center gap-1.5">
                                {uri}
                                <button
                                  onClick={() => removeUriDraft(app.id, i)}
                                  className="text-slate-400 hover:text-red-600 transition-colors"
                                  aria-label="Remove URI"
                                  data-testid={`remove-uri-${app.id}-${i}`}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Input
                              value={newUriInput[app.id] || ''}
                              onChange={(e) => setNewUriInput({ ...newUriInput, [app.id]: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUriDraft(app.id); } }}
                              placeholder="https://app.example.com/callback"
                              className="font-mono text-xs h-9 rounded-md border-slate-200 bg-white focus-visible:ring-emerald-200"
                              data-testid={`new-uri-input-${app.id}`}
                            />
                            <Button
                              type="button"
                              onClick={() => addUriDraft(app.id)}
                              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md h-9 px-3 text-xs whitespace-nowrap"
                              data-testid={`add-uri-${app.id}`}
                            >
                              <Plus size={13} className="mr-1" /> Add URI
                            </Button>
                          </div>
                          <p className="text-[11px] text-slate-400">Press Enter or click &quot;Add URI&quot; to append. Click Save to persist.</p>
                        </div>
                      )}
                    </div>

                    {/* Integration Credentials */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Integration Credentials</p>
                        <span className="text-[10px] text-slate-400 italic">Click <PencilSimple size={9} className="inline -mt-0.5" /> to edit</span>
                      </div>
                      <div className="grid gap-2">
                        {[
                          { label: 'Client ID', key: 'client_id', value: app.client_id },
                          { label: 'Authorization URL', key: 'authorization_endpoint', value: app.authorization_endpoint },
                          { label: 'Token URL', key: 'token_endpoint', value: app.token_endpoint },
                          { label: 'UserInfo URL', key: 'userinfo_endpoint', value: app.userinfo_endpoint || `${process.env.REACT_APP_BACKEND_URL}/api/oidc/userinfo` },
                          { label: 'Discovery URL', key: 'discovery_endpoint', value: app.discovery_endpoint || `${process.env.REACT_APP_BACKEND_URL}/api/apps/oidc/${app.id}/.well-known/openid-configuration` },
                        ].map(({ label, key, value }) => {
                          const editKey = `${app.id}_${key}`;
                          const isEditing = editingField[editKey] !== undefined;
                          return (
                            <div key={label} className="bg-white border border-slate-200 px-3 py-2 rounded-lg hover:border-emerald-200 transition-colors">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="text-slate-400 text-[10px] font-medium uppercase tracking-wide">{label}</span>
                                  {isEditing ? (
                                    <Input
                                      value={editingField[editKey]}
                                      onChange={(e) => setEditingField({ ...editingField, [editKey]: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); saveField(app.id, key); }
                                        if (e.key === 'Escape') { cancelEditField(app.id, key); }
                                      }}
                                      autoFocus
                                      className="mt-1 h-8 font-mono text-xs rounded-md border-emerald-200 focus-visible:ring-emerald-200"
                                      data-testid={`edit-input-${key}-${app.id}`}
                                    />
                                  ) : (
                                    <p className="font-mono text-xs break-all text-slate-700 mt-0.5">{value}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isEditing ? (
                                    <>
                                      <button
                                        onClick={() => saveField(app.id, key)}
                                        disabled={savingField[editKey]}
                                        className="px-2 py-1 text-[11px] font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                        data-testid={`save-${key}-${app.id}`}
                                      >
                                        {savingField[editKey] ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        onClick={() => cancelEditField(app.id, key)}
                                        className="px-2 py-1 text-[11px] font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => copyToClipboard(value)}
                                        className="p-1.5 hover:bg-emerald-50 rounded-md text-slate-400 hover:text-emerald-600 transition-colors"
                                        data-testid={`copy-${label.toLowerCase().replace(/ /g, '-')}-${app.id}`}
                                        title="Copy"
                                      >
                                        <Copy size={13} />
                                      </button>
                                      <button
                                        onClick={() => startEditField(app.id, key, value)}
                                        className="p-1.5 hover:bg-emerald-50 rounded-md text-slate-400 hover:text-emerald-600 transition-colors"
                                        data-testid={`edit-${key}-${app.id}`}
                                        title={`Edit ${label}`}
                                      >
                                        <PencilSimple size={13} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Client Secret */}
                        {showSecret[app.id] ? (
                          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                            <div className="min-w-0 flex-1">
                              <span className="text-amber-700 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1">
                                <Lock size={10} /> Client Secret
                              </span>
                              <p className="font-mono text-xs break-all text-amber-900 mt-0.5">{showSecret[app.id]}</p>
                            </div>
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <button onClick={() => copyToClipboard(showSecret[app.id])} className="p-2 hover:bg-amber-100 rounded-md text-amber-700" title="Copy">
                                <Copy size={13} />
                              </button>
                              <button onClick={() => setShowSecret({ ...showSecret, [app.id]: null })} className="p-2 hover:bg-amber-100 rounded-md text-amber-700" title="Hide">
                                <EyeSlash size={13} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={async () => {
                              try {
                                const res = await axios.get(`${API}/apps/oidc/${app.id}?include_secret=true`, getAuthHeader());
                                setShowSecret({ ...showSecret, [app.id]: res.data.client_secret });
                              } catch { toast.error('Failed to fetch secret'); }
                            }}
                            className="flex items-center justify-center gap-2 text-xs text-emerald-700 hover:text-emerald-800 font-medium py-2.5 bg-white border border-dashed border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-lg transition-colors"
                            data-testid={`reveal-secret-${app.id}`}
                          >
                            <Eye size={14} /> Reveal Client Secret
                          </button>
                        )}

                        {/* Regenerate Secret */}
                        <button
                          onClick={() => regenerateSecret(app)}
                          className="flex items-center justify-center gap-2 text-xs text-rose-700 hover:text-rose-800 font-medium py-2 bg-white border border-dashed border-rose-200 hover:border-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
                          data-testid={`regenerate-secret-${app.id}`}
                        >
                          <Key size={13} /> Regenerate Client Secret
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{selectedApp ? 'Edit OIDC App' : 'Add OIDC App'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Logo Upload + App Name */}
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 shrink-0 border-2 border-dashed border-zinc-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-[#00CC66] hover:bg-emerald-50 transition-colors overflow-hidden"
                onClick={() => logoInputRef.current?.click()}
                data-testid="oidc-logo-upload"
              >
                {(logoPreview || form.logo_url) ? (
                  <img src={logoPreview || form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Upload size={24} className="text-zinc-400" />
                )}
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <Label className="label-uppercase">App Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Canteen App" className="input-brutalist w-full mt-1" data-testid="oidc-name-input" />
                </div>
                <div>
                  <Label className="label-uppercase">Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Internal canteen ordering app" className="input-brutalist w-full mt-1" />
                </div>
              </div>
            </div>

            {/* Home URL */}
            <div>
              <Label className="label-uppercase">Home URL</Label>
              <p className="text-xs text-zinc-400 mt-0.5 mb-1">The URL users will be redirected to after login</p>
              <Input value={form.home_url} onChange={(e) => setForm({ ...form, home_url: e.target.value })} placeholder="https://canteen.example.com" className="input-brutalist w-full" data-testid="oidc-home-url-input" />
            </div>

            {/* Category & Sort */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">Category (App Launcher)</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input-brutalist w-full mt-1 py-2.5 rounded-lg border border-zinc-200"
                  data-testid="oidc-category-select"
                >
                  <option value="">None (hidden from launcher)</option>
                  <option value="Expense">Expense</option>
                  <option value="Productivity">Productivity</option>
                  <option value="Facility">Facility</option>
                  <option value="Reports">Reports</option>
                  <option value="Support">HR / Support</option>
                  <option value="HR">HR</option>
                </select>
              </div>
              <div>
                <Label className="label-uppercase">Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || '99', 10) })}
                  className="input-brutalist w-full mt-1"
                  placeholder="99"
                  data-testid="oidc-sort-order-input"
                />
              </div>
            </div>

            {/* Coming Soon */}
            <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
              <div>
                <Label className="text-sm font-semibold text-zinc-700">Coming Soon</Label>
                <p className="text-xs text-zinc-400 mt-0.5">Show as placeholder tile (dashed, &quot;Soon&quot; badge) — non-clickable launch</p>
              </div>
              <Switch
                checked={!!form.is_placeholder}
                onCheckedChange={(c) => setForm({ ...form, is_placeholder: c })}
                data-testid="oidc-coming-soon-switch"
              />
            </div>

            {/* Restricted */}
            <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
              <div>
                <Label className="text-sm font-semibold text-zinc-700">Restricted</Label>
                <p className="text-xs text-zinc-400 mt-0.5">Block launch for non-admin users. Tile shows with a lock badge; click shows &quot;You do not have permission&quot; toast.</p>
              </div>
              <Switch
                checked={!!form.restricted}
                onCheckedChange={(c) => setForm({ ...form, restricted: c })}
                data-testid="oidc-restricted-switch"
              />
            </div>


            {/* Redirect URIs */}
            <div>
              <Label className="label-uppercase">Redirect URIs *</Label>
              <p className="text-xs text-zinc-400 mt-0.5 mb-1">OAuth callback URLs for your application</p>
              <div className="space-y-2">
                {form.redirect_uris.map((uri, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={uri} readOnly className="input-brutalist flex-1 font-mono text-sm" />
                    <button type="button" onClick={() => removeRedirectUri(uri)} className="p-2 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={newRedirectUri}
                    onChange={(e) => setNewRedirectUri(e.target.value)}
                    placeholder="https://canteen.example.com/auth/callback"
                    className="input-brutalist flex-1 font-mono text-sm"
                    onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRedirectUri(); } }}
                  />
                  <Button type="button" onClick={addRedirectUri} className="btn-secondary py-2 px-3"><Plus size={16} /></Button>
                </div>
              </div>
            </div>

            {/* Access Control */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">Allowed Groups</Label>
                <select multiple value={form.allowed_group_ids} onChange={(e) => setForm({ ...form, allowed_group_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-20 text-sm">
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="label-uppercase">Allowed Roles</Label>
                <select multiple value={form.allowed_role_ids} onChange={(e) => setForm({ ...form, allowed_role_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-20 text-sm">
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary" data-testid="oidc-save-btn">{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OIDCApps;
