import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Key, Plus, PencilSimple, Trash, Copy, Eye, X, Upload, Globe } from '@phosphor-icons/react';

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
  const logoInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '', description: '', redirect_uris: [], logout_uris: [],
    scopes: ['openid', 'profile', 'email'], grant_types: ['authorization_code'],
    logo_url: '', home_url: '', allowed_group_ids: [], allowed_role_ids: []
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
      const res = await axios.post(`${API}/upload/logo`, formData, {
        headers: { ...getAuthHeader().headers, 'Content-Type': 'multipart/form-data' }
      });
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
      allowed_group_ids: app.allowed_group_ids || [], allowed_role_ids: app.allowed_role_ids || []
    });
    setLogoPreview(app.logo_url || null);
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedApp(null);
    setForm({
      name: '', description: '', redirect_uris: [], logout_uris: [],
      scopes: ['openid', 'profile', 'email'], grant_types: ['authorization_code'],
      logo_url: '', home_url: '', allowed_group_ids: [], allowed_role_ids: []
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#00CC66] flex items-center justify-center">
            <Key weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">OIDC Applications</h1>
            <p className="text-zinc-500">{apps.length} applications configured</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary" data-testid="add-oidc-app">
          <Plus size={18} className="mr-2" /> Add OIDC App
        </Button>
      </div>

      {apps.length === 0 ? (
        <div className="card-brutalist p-12 text-center">
          <Key size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">No OIDC Apps</h3>
          <p className="text-zinc-500">Add your first OpenID Connect application.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {apps.map((app) => (
            <div key={app.id} className="card-brutalist p-6" data-testid={`oidc-app-${app.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {app.logo_url ? (
                    <img src={app.logo_url} alt={app.name} className="w-12 h-12 object-contain rounded-lg" />
                  ) : (
                    <div className="w-12 h-12 bg-[#00CC66] flex items-center justify-center text-white font-bold rounded-lg">
                      {app.name?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-lg">{app.name}</h3>
                    {app.description && <p className="text-zinc-500 text-sm mt-0.5">{app.description}</p>}
                    {app.home_url && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-zinc-400">
                        <Globe size={12} /> {app.home_url}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 font-medium rounded">{app.status || 'active'}</span>
                      <span className="font-mono">ID: {app.client_id}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => editApp(app)} className="p-2 hover:bg-zinc-100 rounded" data-testid={`edit-oidc-${app.id}`}>
                    <PencilSimple size={18} className="text-zinc-500" />
                  </button>
                  <button onClick={() => deleteApp(app)} className="p-2 hover:bg-red-50 rounded" data-testid={`delete-oidc-${app.id}`}>
                    <Trash size={18} className="text-red-500" />
                  </button>
                </div>
              </div>

              {/* Redirect URIs */}
              <div className="mt-4 pt-4 border-t border-zinc-100">
                <div className="text-sm"><span className="text-zinc-500">Redirect URIs:</span></div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {app.redirect_uris?.map((uri, i) => (
                    <span key={i} className="font-mono text-xs bg-zinc-100 px-2 py-1 rounded">{uri}</span>
                  ))}
                </div>
              </div>

              {/* Integration Config */}
              <div className="mt-4 pt-4 border-t border-zinc-100">
                <p className="text-xs font-bold uppercase text-zinc-400 mb-3">Integration Credentials</p>
                <div className="grid gap-2">
                  {[
                    { label: 'Client ID', value: app.client_id },
                    { label: 'Authorization URL', value: app.authorization_endpoint },
                    { label: 'Token URL', value: app.token_endpoint },
                    { label: 'UserInfo URL', value: `${process.env.REACT_APP_BACKEND_URL}/api/oidc/userinfo` },
                    { label: 'Discovery URL', value: `${process.env.REACT_APP_BACKEND_URL}/api/apps/oidc/${app.id}/.well-known/openid-configuration` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between bg-zinc-50 px-3 py-2 rounded group hover:bg-zinc-100 transition-colors">
                      <div className="min-w-0 flex-1">
                        <span className="text-zinc-500 text-xs">{label}</span>
                        <p className="font-mono text-xs break-all text-zinc-800">{value}</p>
                      </div>
                      <button onClick={() => copyToClipboard(value)} className="p-1.5 hover:bg-zinc-200 rounded ml-2 shrink-0" data-testid={`copy-${label.toLowerCase().replace(/ /g, '-')}-${app.id}`}>
                        <Copy size={14} className="text-zinc-400" />
                      </button>
                    </div>
                  ))}

                  {/* Client Secret */}
                  {showSecret[app.id] ? (
                    <div className="flex items-center justify-between bg-amber-50 px-3 py-2 rounded border border-amber-200">
                      <div className="min-w-0 flex-1">
                        <span className="text-amber-700 text-xs font-medium">Client Secret</span>
                        <p className="font-mono text-xs break-all text-amber-900">{showSecret[app.id]}</p>
                      </div>
                      <button onClick={() => copyToClipboard(showSecret[app.id])} className="p-1.5 hover:bg-amber-100 rounded ml-2 shrink-0">
                        <Copy size={14} className="text-amber-600" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const res = await axios.get(`${API}/apps/oidc/${app.id}?include_secret=true`, getAuthHeader());
                          setShowSecret({ ...showSecret, [app.id]: res.data.client_secret });
                        } catch { toast.error('Failed to fetch secret'); }
                      }}
                      className="flex items-center gap-2 text-xs text-[#00CC66] hover:text-emerald-700 font-medium py-2"
                      data-testid={`reveal-secret-${app.id}`}
                    >
                      <Eye size={14} /> Reveal Client Secret
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRedirectUri())}
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
