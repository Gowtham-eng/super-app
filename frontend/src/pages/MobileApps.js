import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { DeviceMobile, Plus, PencilSimple, Trash, Upload, AppleLogo, GooglePlayLogo, DownloadSimple } from '@phosphor-icons/react';

const defaultUpdateConfig = {
  enabled: false,
  android: {
    min_build: 5,
    latest_build: 5,
    store_url: 'https://play.google.com/store/apps/details?id=com.refex.refexone',
    force_title: 'Update required',
    force_message: 'A new version of RefexOne is required to continue. Please update from the Play Store.',
    optional_title: 'Update available',
    optional_message: 'A new version of RefexOne is available on the Play Store.',
  },
  ios: {
    min_build: 1,
    latest_build: 1,
    store_url: 'https://apps.apple.com/',
    force_title: 'Update required',
    force_message: 'A new version of RefexOne is required to continue. Please update from the App Store.',
    optional_title: 'Update available',
    optional_message: 'A new version of RefexOne is available on the App Store.',
  },
};

const MobileApps = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const logoInputRef = useRef(null);
  const [updateConfig, setUpdateConfig] = useState(defaultUpdateConfig);
  const [savingUpdate, setSavingUpdate] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', app_store_url: '', play_store_url: '',
    logo_url: '', allowed_group_ids: [], allowed_role_ids: [],
    category: '', sort_order: 99, is_placeholder: false, restricted: false
  });

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    if (!loading && (window.location.hash === '#app-updates' || window.location.pathname.includes('/settings/app-update'))) {
      document.getElementById('app-updates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

  const fetchData = async () => {
    try {
      const [appsRes, groupsRes, rolesRes, updateRes] = await Promise.all([
        axios.get(`${API}/apps/mobile`, getAuthHeader()),
        axios.get(`${API}/groups`, getAuthHeader()),
        axios.get(`${API}/roles`, getAuthHeader()),
        axios.get(`${API}/app-update/config`, getAuthHeader()).catch(() => ({ data: defaultUpdateConfig })),
      ]);
      setApps(appsRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
      setUpdateConfig({
        ...defaultUpdateConfig,
        ...updateRes.data,
        android: { ...defaultUpdateConfig.android, ...(updateRes.data?.android || {}) },
        ios: { ...defaultUpdateConfig.ios, ...(updateRes.data?.ios || {}) },
      });
    } catch (error) {
      toast.error('Failed to load mobile apps');
    } finally {
      setLoading(false);
    }
  };

  const setPlatformField = (platform, key, value) => {
    setUpdateConfig((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [key]: value },
    }));
  };

  const saveUpdateConfig = async () => {
    setSavingUpdate(true);
    try {
      const res = await axios.put(`${API}/app-update/config`, updateConfig, getAuthHeader());
      setUpdateConfig({
        ...defaultUpdateConfig,
        ...res.data,
        android: { ...defaultUpdateConfig.android, ...(res.data?.android || {}) },
        ios: { ...defaultUpdateConfig.ios, ...(res.data?.ios || {}) },
      });
      toast.success('App update settings saved');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save update settings');
    } finally {
      setSavingUpdate(false);
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
    if (!form.app_store_url && !form.play_store_url) {
      toast.error('At least one of App Store or Play Store URL is required');
      return;
    }
    setSaving(true);
    try {
      if (selectedApp) {
        await axios.put(`${API}/apps/mobile/${selectedApp.id}`, form, getAuthHeader());
        toast.success('App updated');
      } else {
        await axios.post(`${API}/apps/mobile`, { ...form, org_id: user.org_id }, getAuthHeader());
        toast.success('App created');
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
      await axios.delete(`${API}/apps/mobile/${app.id}`, getAuthHeader());
      toast.success('App deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete app');
    }
  };

  const editApp = (app) => {
    setSelectedApp(app);
    setForm({
      name: app.name, description: app.description || '',
      app_store_url: app.app_store_url || '', play_store_url: app.play_store_url || '',
      logo_url: app.logo_url || '',
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
      name: '', description: '', app_store_url: '', play_store_url: '',
      logo_url: '', allowed_group_ids: [], allowed_role_ids: [],
      category: '', sort_order: 99, is_placeholder: false, restricted: false
    });
    setLogoPreview(null);
  };

  const renderPlatformFields = (platform, label, Icon) => (
    <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 space-y-4 hover:border-emerald-200 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-heading font-semibold text-sm text-slate-700 flex items-center gap-2">
          <Icon size={16} weight="fill" /> {label}
        </h4>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">
          Min {updateConfig[platform].min_build} · Latest {updateConfig[platform].latest_build}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="label-uppercase text-xs">Min build (force below)</Label>
          <Input
            type="number"
            min={1}
            value={updateConfig[platform].min_build}
            onChange={(e) => setPlatformField(platform, 'min_build', parseInt(e.target.value || '1', 10))}
            className="input-brutalist w-full mt-1.5"
            data-testid={`update-${platform}-min-build`}
          />
          <p className="text-xs text-slate-400 mt-1">Users below this build must update</p>
        </div>
        <div>
          <Label className="label-uppercase text-xs">Latest build (optional prompt)</Label>
          <Input
            type="number"
            min={1}
            value={updateConfig[platform].latest_build}
            onChange={(e) => setPlatformField(platform, 'latest_build', parseInt(e.target.value || '1', 10))}
            className="input-brutalist w-full mt-1.5"
            data-testid={`update-${platform}-latest-build`}
          />
          <p className="text-xs text-slate-400 mt-1">Users below this see optional update</p>
        </div>
      </div>
      <div>
        <Label className="label-uppercase text-xs">Store URL</Label>
        <Input
          value={updateConfig[platform].store_url}
          onChange={(e) => setPlatformField(platform, 'store_url', e.target.value)}
          className="input-brutalist w-full mt-1.5 font-mono text-sm"
          data-testid={`update-${platform}-store-url`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="label-uppercase text-xs">Force title</Label>
          <Input
            value={updateConfig[platform].force_title}
            onChange={(e) => setPlatformField(platform, 'force_title', e.target.value)}
            className="input-brutalist w-full mt-1.5"
          />
        </div>
        <div>
          <Label className="label-uppercase text-xs">Optional title</Label>
          <Input
            value={updateConfig[platform].optional_title}
            onChange={(e) => setPlatformField(platform, 'optional_title', e.target.value)}
            className="input-brutalist w-full mt-1.5"
          />
        </div>
      </div>
      <div>
        <Label className="label-uppercase text-xs">Force message</Label>
        <Input
          value={updateConfig[platform].force_message}
          onChange={(e) => setPlatformField(platform, 'force_message', e.target.value)}
          className="input-brutalist w-full mt-1.5"
        />
      </div>
      <div>
        <Label className="label-uppercase text-xs">Optional message</Label>
        <Input
          value={updateConfig[platform].optional_message}
          onChange={(e) => setPlatformField(platform, 'optional_message', e.target.value)}
          className="input-brutalist w-full mt-1.5"
        />
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn" data-testid="mobile-apps-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Mobile Apps</h1>
          <p className="text-sm text-slate-500">{apps.length} native apps (App Store / Play Store)</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary" data-testid="add-mobile-app">
          <Plus size={18} className="mr-2" /> Add Mobile App
        </Button>
      </div>

      <div id="app-updates" className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-sm" data-testid="app-update-config">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900 flex items-center gap-2">
              <DownloadSimple size={20} className="text-emerald-600" />
              App Update Control
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Force or optionally prompt RefexOne Android / iOS users to update. Compare against Android versionCode and iOS CFBundleVersion.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Switch
                checked={!!updateConfig.enabled}
                onCheckedChange={(c) => setUpdateConfig({ ...updateConfig, enabled: c })}
                data-testid="update-enabled-switch"
              />
              <span className={`text-sm font-medium ${updateConfig.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                {updateConfig.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <Button onClick={saveUpdateConfig} disabled={savingUpdate} className="btn-primary" data-testid="save-update-config">
              {savingUpdate ? 'Saving...' : 'Save Update Settings'}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
          <div className="grid gap-4 lg:grid-cols-2">
            {renderPlatformFields('android', 'Android (versionCode)', GooglePlayLogo)}
            {renderPlatformFields('ios', 'iOS (CFBundleVersion / build)', AppleLogo)}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-3">Dialog preview</p>
            <div className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-teal-500 px-4 pt-5 pb-4 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-white/20 border border-white/30 flex items-center justify-center mb-3">
                  <DownloadSimple size={22} className="text-white" weight="bold" />
                </div>
                <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-[10px] font-bold">
                  Required update
                </span>
              </div>
              <div className="px-4 py-4 text-center">
                <p className="text-sm font-semibold text-slate-900">{updateConfig.android.force_title || 'Update required'}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {updateConfig.android.force_message || 'A new version of RefexOne is required.'}
                </p>
                <p className="text-[11px] text-slate-400 mt-3">
                  Your build · Latest {updateConfig.android.latest_build}
                </p>
                <div className="mt-4 space-y-2">
                  <div className="h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                    Update now
                  </div>
                  <div className="h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-semibold flex items-center justify-center">
                    Remind me later
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-center">
              Force dialog hides Later. Optional shows both actions.
            </p>
          </div>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <DeviceMobile size={48} className="text-slate-300 mx-auto mb-4" />
          <h3 className="font-heading font-semibold text-lg mb-2 text-slate-700">No Mobile Apps</h3>
          <p className="text-slate-400 text-sm">Add native mobile apps available on App Store or Play Store.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {apps.map((app) => (
            <div key={app.id} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md hover:border-emerald-200 transition-all" data-testid={`mobile-app-${app.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {app.logo_url ? (
                    <img src={app.logo_url} alt={app.name} className="w-12 h-12 rounded-lg object-contain border border-slate-100 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 font-semibold text-lg shrink-0">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading font-semibold text-slate-900 truncate">{app.name}</h3>
                    {app.description && <p className="text-sm text-slate-500 mt-0.5">{app.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {app.app_store_url && (
                        <a href={app.app_store_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-700">
                          <AppleLogo size={12} weight="fill" /> App Store
                        </a>
                      )}
                      {app.play_store_url && (
                        <a href={app.play_store_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">
                          <GooglePlayLogo size={12} weight="fill" /> Play Store
                        </a>
                      )}
                      {app.category && (
                        <span className="inline-flex items-center text-xs px-2 py-1 rounded-md bg-violet-50 text-violet-700 border border-violet-100">
                          {app.category}
                        </span>
                      )}
                      {app.is_placeholder && (
                        <span className="inline-flex items-center text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          Coming Soon
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button onClick={() => editApp(app)} className="btn-secondary p-2" data-testid={`edit-mobile-${app.id}`}>
                    <PencilSimple size={16} />
                  </Button>
                  <Button onClick={() => deleteApp(app)} className="btn-secondary p-2 text-red-600" data-testid={`delete-mobile-${app.id}`}>
                    <Trash size={16} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedApp ? 'Edit Mobile App' : 'Add Mobile App'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 shrink-0 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors overflow-hidden"
                onClick={() => logoInputRef.current?.click()}
                data-testid="mobile-logo-upload"
              >
                {(logoPreview || form.logo_url) ? (
                  <img src={logoPreview || form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Upload size={24} className="text-slate-400" />
                )}
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <Label className="label-uppercase text-xs">App Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Refex Mobility" className="input-brutalist w-full mt-1.5" data-testid="mobile-name-input" />
                </div>
                <div>
                  <Label className="label-uppercase text-xs">Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Cab booking & ride mobility" className="input-brutalist w-full mt-1.5" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <h4 className="font-heading font-semibold text-sm text-slate-700">Store Links (at least one required)</h4>
              <div>
                <Label className="label-uppercase text-xs flex items-center gap-1.5"><AppleLogo size={14} /> App Store URL (iOS)</Label>
                <Input value={form.app_store_url} onChange={(e) => setForm({ ...form, app_store_url: e.target.value })} placeholder="https://apps.apple.com/in/app/.../id123456" className="input-brutalist w-full mt-1.5 font-mono text-sm" data-testid="mobile-appstore-input" />
              </div>
              <div>
                <Label className="label-uppercase text-xs flex items-center gap-1.5"><GooglePlayLogo size={14} /> Play Store URL (Android)</Label>
                <Input value={form.play_store_url} onChange={(e) => setForm({ ...form, play_store_url: e.target.value })} placeholder="https://play.google.com/store/apps/details?id=com.example.app" className="input-brutalist w-full mt-1.5 font-mono text-sm" data-testid="mobile-playstore-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase text-xs">Category (App Launcher)</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input-brutalist w-full mt-1.5 py-2.5 rounded-lg border border-slate-200"
                  data-testid="mobile-category-select"
                >
                  <option value="">None (hidden from launcher)</option>
                  <option value="Expense">Expense</option>
                  <option value="Productivity">Productivity</option>
                  <option value="Facility">Facility</option>
                  <option value="Support">HR / Support</option>
                  <option value="HR">HR</option>
                </select>
              </div>
              <div>
                <Label className="label-uppercase text-xs">Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || '99', 10) })}
                  className="input-brutalist w-full mt-1.5"
                  placeholder="99"
                  data-testid="mobile-sort-order-input"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <Label className="text-sm font-semibold text-slate-700">Coming Soon</Label>
                <p className="text-xs text-slate-400 mt-0.5">Show as placeholder tile (dashed, &quot;Soon&quot; badge)</p>
              </div>
              <Switch
                checked={!!form.is_placeholder}
                onCheckedChange={(c) => setForm({ ...form, is_placeholder: c })}
                data-testid="mobile-coming-soon-switch"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <Label className="text-sm font-semibold text-slate-700">Restricted</Label>
                <p className="text-xs text-slate-400 mt-0.5">Block launch for non-admin users. Tile shows with a lock badge; click shows &quot;You do not have permission&quot; toast.</p>
              </div>
              <Switch
                checked={!!form.restricted}
                onCheckedChange={(c) => setForm({ ...form, restricted: c })}
                data-testid="mobile-restricted-switch"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase text-xs">Allowed Groups</Label>
                <select multiple value={form.allowed_group_ids} onChange={(e) => setForm({ ...form, allowed_group_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1.5 h-20 text-sm">
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Empty = all users</p>
              </div>
              <div>
                <Label className="label-uppercase text-xs">Allowed Roles</Label>
                <select multiple value={form.allowed_role_ids} onChange={(e) => setForm({ ...form, allowed_role_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1.5 h-20 text-sm">
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Empty = all roles</p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary" data-testid="mobile-save-btn">
                {saving ? 'Saving...' : (selectedApp ? 'Save Changes' : 'Create App')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MobileApps;
