import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Key, Plus, PencilSimple, Trash, Copy, Eye, EyeSlash, X } from '@phosphor-icons/react';

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

  const [form, setForm] = useState({
    name: '', description: '', redirect_uris: [], logout_uris: [],
    scopes: ['openid', 'profile', 'email'], grant_types: ['authorization_code'],
    logo_url: '', allowed_group_ids: [], allowed_role_ids: []
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
      allowed_group_ids: app.allowed_group_ids || [], allowed_role_ids: app.allowed_role_ids || []
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedApp(null);
    setForm({
      name: '', description: '', redirect_uris: [], logout_uris: [],
      scopes: ['openid', 'profile', 'email'], grant_types: ['authorization_code'],
      logo_url: '', allowed_group_ids: [], allowed_role_ids: []
    });
    setNewRedirectUri('');
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

  const toggleScope = (scope) => {
    if (scope === 'openid') return;
    setForm({
      ...form,
      scopes: form.scopes.includes(scope)
        ? form.scopes.filter(s => s !== scope)
        : [...form.scopes, scope]
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  const availableScopes = ['openid', 'profile', 'email', 'address', 'phone'];

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
                    <img src={app.logo_url} alt={app.name} className="w-12 h-12 object-contain" />
                  ) : (
                    <div className="w-12 h-12 bg-[#00CC66] flex items-center justify-center text-white font-bold">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-lg">{app.name}</h3>
                    <p className="text-sm text-zinc-500">Client ID: <span className="font-mono">{app.client_id}</span></p>
                    {app.description && <p className="text-sm text-zinc-600 mt-1">{app.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => editApp(app)} className="p-2 hover:bg-zinc-100"><PencilSimple size={18} className="text-zinc-500" /></button>
                  <button onClick={() => deleteApp(app)} className="p-2 hover:bg-[#FF3333]/10"><Trash size={18} className="text-[#FF3333]" /></button>
                </div>
              </div>
              
              {showSecret[app.id] && (
                <div className="mt-4 p-3 bg-[#FFB800]/10 border border-[#FFB800]">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase text-[#FFB800]">Client Secret (save now!)</span>
                      <p className="font-mono text-sm break-all">{showSecret[app.id]}</p>
                    </div>
                    <Button onClick={() => copyToClipboard(showSecret[app.id])} className="btn-secondary py-1 px-2">
                      <Copy size={14} />
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-zinc-100">
                <div className="text-sm"><span className="text-zinc-500">Redirect URIs:</span></div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {app.redirect_uris?.map((uri, i) => (
                    <span key={i} className="font-mono text-xs bg-zinc-100 px-2 py-1">{uri}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedApp ? 'Edit OIDC App' : 'Add OIDC App'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">App Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1" />
              </div>
              <div>
                <Label className="label-uppercase">Logo URL</Label>
                <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} className="input-brutalist w-full mt-1" />
              </div>
            </div>
            <div>
              <Label className="label-uppercase">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-brutalist w-full mt-1" />
            </div>
            
            <div>
              <Label className="label-uppercase">Redirect URIs *</Label>
              <div className="space-y-2 mt-1">
                {form.redirect_uris.map((uri, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={uri} readOnly className="input-brutalist flex-1 font-mono text-sm" />
                    <button type="button" onClick={() => removeRedirectUri(uri)} className="p-2 text-[#FF3333]"><X size={16} /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={newRedirectUri}
                    onChange={(e) => setNewRedirectUri(e.target.value)}
                    placeholder="https://app.kissflow.com/callback"
                    className="input-brutalist flex-1 font-mono text-sm"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRedirectUri())}
                  />
                  <Button type="button" onClick={addRedirectUri} className="btn-secondary py-2 px-3"><Plus size={16} /></Button>
                </div>
              </div>
            </div>

            <div>
              <Label className="label-uppercase">Scopes</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {availableScopes.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    disabled={scope === 'openid'}
                    className={`px-3 py-1.5 text-sm font-medium ${
                      form.scopes.includes(scope) ? 'bg-[#0051FF] text-white' : 'bg-zinc-100 text-zinc-600'
                    } ${scope === 'openid' ? 'cursor-not-allowed' : ''}`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">Allowed Groups</Label>
                <select multiple value={form.allowed_group_ids} onChange={(e) => setForm({ ...form, allowed_group_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-24">
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="label-uppercase">Allowed Roles</Label>
                <select multiple value={form.allowed_role_ids} onChange={(e) => setForm({ ...form, allowed_role_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-24">
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OIDCApps;
