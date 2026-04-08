import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ShieldCheck, Plus, PencilSimple, Trash, Copy, Download, Eye, Gear, Play, CheckCircle, XCircle, ArrowSquareOut, UserPlus, UserMinus, Users } from '@phosphor-icons/react';

const SAMLApps = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [apps, setApps] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [showKissflowModal, setShowKissflowModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [metadata, setMetadata] = useState('');
  const [kissflowConfig, setKissflowConfig] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appUsers, setAppUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', entity_id: '', acs_url: '', slo_url: '',
    name_id_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    sign_assertions: true, sign_response: true, logo_url: '',
    allowed_group_ids: [], allowed_role_ids: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [appsRes, groupsRes, rolesRes, usersRes] = await Promise.all([
        axios.get(`${API}/apps/saml`, getAuthHeader()),
        axios.get(`${API}/groups`, getAuthHeader()),
        axios.get(`${API}/roles`, getAuthHeader()),
        axios.get(`${API}/users`, getAuthHeader())
      ]);
      setApps(appsRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
      setOrgUsers(usersRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedApp) {
        await axios.put(`${API}/apps/saml/${selectedApp.id}`, form, getAuthHeader());
        toast.success('App updated');
      } else {
        await axios.post(`${API}/apps/saml`, { ...form, org_id: user.org_id }, getAuthHeader());
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
      await axios.delete(`${API}/apps/saml/${app.id}`, getAuthHeader());
      toast.success('App deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete app');
    }
  };

  const viewMetadata = async (app) => {
    try {
      const response = await axios.get(`${API}/apps/saml/${app.id}/metadata`);
      setMetadata(response.data);
      setSelectedApp(app);
      setShowMetadataModal(true);
    } catch (error) {
      toast.error('Failed to load metadata');
    }
  };

  const viewKissflowConfig = async (app) => {
    try {
      const response = await axios.get(`${API}/apps/saml/${app.id}/kissflow-config`, getAuthHeader());
      setKissflowConfig(response.data);
      setSelectedApp(app);
      setShowKissflowModal(true);
    } catch (error) {
      toast.error('Failed to load Kissflow config');
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label || 'Value'} copied!`);
  };

  const copyMetadata = () => {
    navigator.clipboard.writeText(metadata);
    toast.success('Copied to clipboard');
  };

  const downloadMetadata = () => {
    const blob = new Blob([metadata], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedApp?.name || 'saml'}-metadata.xml`;
    a.click();
  };

  const testSSO = async (app) => {
    setSelectedApp(app);
    setTestLoading(true);
    setTestResult(null);
    setShowTestModal(true);
    try {
      const response = await axios.get(`${API}/saml/${app.id}/test`, getAuthHeader());
      setTestResult(response.data);
    } catch (error) {
      setTestResult({ status: 'error', error: error.response?.data?.detail || 'Failed to generate SAML assertion' });
    } finally {
      setTestLoading(false);
    }
  };

  const launchRealSSO = () => {
    if (!testResult || !testResult.saml_response_b64) return;
    // Create a temporary form and auto-submit to ACS URL
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = testResult.acs_url;
    form.target = '_blank';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'SAMLResponse';
    input.value = testResult.saml_response_b64;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
    toast.success('SAML Response sent to ' + selectedApp?.name);
  };

  const openUsersModal = async (app) => {
    setSelectedApp(app);
    setShowUsersModal(true);
    setUsersLoading(true);
    try {
      const response = await axios.get(`${API}/apps/saml/${app.id}/users`, getAuthHeader());
      setAppUsers(response.data);
    } catch (error) {
      toast.error('Failed to load assigned users');
    } finally {
      setUsersLoading(false);
    }
  };

  const assignUser = async (userId) => {
    if (!selectedApp) return;
    try {
      await axios.post(`${API}/apps/saml/${selectedApp.id}/users`, { user_ids: [userId] }, getAuthHeader());
      const response = await axios.get(`${API}/apps/saml/${selectedApp.id}/users`, getAuthHeader());
      setAppUsers(response.data);
      toast.success('User assigned');
    } catch (error) {
      toast.error('Failed to assign user');
    }
  };

  const removeUser = async (userId) => {
    if (!selectedApp) return;
    try {
      await axios.delete(`${API}/apps/saml/${selectedApp.id}/users/${userId}`, getAuthHeader());
      setAppUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('User removed');
    } catch (error) {
      toast.error('Failed to remove user');
    }
  };

  const editApp = (app) => {
    setSelectedApp(app);
    setForm({
      name: app.name, description: app.description || '', entity_id: app.entity_id,
      acs_url: app.acs_url, slo_url: app.slo_url || '',
      name_id_format: app.name_id_format, sign_assertions: app.sign_assertions,
      sign_response: app.sign_response, logo_url: app.logo_url || '',
      allowed_group_ids: app.allowed_group_ids || [], allowed_role_ids: app.allowed_role_ids || []
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedApp(null);
    setForm({
      name: '', description: '', entity_id: '', acs_url: '', slo_url: '',
      name_id_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      sign_assertions: true, sign_response: true, logo_url: '',
      allowed_group_ids: [], allowed_role_ids: []
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
            <ShieldCheck weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">SAML Applications</h1>
            <p className="text-zinc-500">{apps.length} applications configured</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary" data-testid="add-saml-app">
          <Plus size={18} className="mr-2" /> Add SAML App
        </Button>
      </div>

      {apps.length === 0 ? (
        <div className="card-brutalist p-12 text-center">
          <ShieldCheck size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">No SAML Apps</h3>
          <p className="text-zinc-500">Add your first SAML 2.0 application to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {apps.map((app) => (
            <div key={app.id} className="card-brutalist p-6" data-testid={`saml-app-${app.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {app.logo_url ? (
                    <img src={app.logo_url} alt={app.name} className="w-12 h-12 object-contain" />
                  ) : (
                    <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center text-white font-bold">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-lg">{app.name}</h3>
                    <p className="text-sm text-zinc-500 font-mono">{app.entity_id}</p>
                    {app.description && <p className="text-sm text-zinc-600 mt-1">{app.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openUsersModal(app)} className="p-2 hover:bg-[#9333EA]/10" title="Manage Users" data-testid={`manage-users-${app.id}`}>
                    <Users size={18} className="text-[#9333EA]" />
                  </button>
                  <button onClick={() => testSSO(app)} className="p-2 hover:bg-[#00CC66]/10" title="Test SSO" data-testid={`test-sso-${app.id}`}>
                    <Play size={18} className="text-[#00CC66]" weight="fill" />
                  </button>
                  <button onClick={() => viewKissflowConfig(app)} className="p-2 hover:bg-[#0051FF]/10" title="Kissflow Config">
                    <Gear size={18} className="text-[#0051FF]" />
                  </button>
                  <button onClick={() => viewMetadata(app)} className="p-2 hover:bg-zinc-100" title="View Metadata">
                    <Eye size={18} className="text-zinc-500" />
                  </button>
                  <button onClick={() => editApp(app)} className="p-2 hover:bg-zinc-100" title="Edit">
                    <PencilSimple size={18} className="text-zinc-500" />
                  </button>
                  <button onClick={() => deleteApp(app)} className="p-2 hover:bg-[#FF3333]/10" title="Delete">
                    <Trash size={18} className="text-[#FF3333]" />
                  </button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-4 text-sm">
                <div><span className="text-zinc-500">ACS URL:</span> <span className="font-mono">{app.acs_url}</span></div>
                <div className="flex items-center gap-1 text-[#9333EA]">
                  <Users size={14} /> {app.approved_user_ids?.length || 0} user(s) assigned
                </div>
                {(app.allowed_group_ids?.length > 0 || app.allowed_role_ids?.length > 0) && (
                  <div className="text-[#FFB800]">Restricted Access</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedApp ? 'Edit SAML App' : 'Add SAML App'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">App Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1" />
              </div>
              <div>
                <Label className="label-uppercase">Logo URL</Label>
                <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} className="input-brutalist w-full mt-1" placeholder="https://..." />
              </div>
            </div>
            <div>
              <Label className="label-uppercase">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Entity ID / Client ID *</Label>
              <Input value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} required className="input-brutalist w-full mt-1 font-mono" placeholder="https://app.kissflow.com/saml/" />
            </div>
            <div>
              <Label className="label-uppercase">ACS URL *</Label>
              <Input value={form.acs_url} onChange={(e) => setForm({ ...form, acs_url: e.target.value })} required className="input-brutalist w-full mt-1 font-mono" placeholder="https://app.kissflow.com/signin/.../saml/?acs" />
            </div>
            <div>
              <Label className="label-uppercase">SLO URL</Label>
              <Input value={form.slo_url} onChange={(e) => setForm({ ...form, slo_url: e.target.value })} className="input-brutalist w-full mt-1 font-mono" />
            </div>
            <div>
              <Label className="label-uppercase">Name ID Format</Label>
              <select value={form.name_id_format} onChange={(e) => setForm({ ...form, name_id_format: e.target.value })} className="input-brutalist w-full mt-1 py-2">
                <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">Email Address</option>
                <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">Persistent</option>
                <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">Transient</option>
              </select>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.sign_assertions} onCheckedChange={(c) => setForm({ ...form, sign_assertions: c })} />
                <Label>Sign Assertions</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.sign_response} onCheckedChange={(c) => setForm({ ...form, sign_response: c })} />
                <Label>Sign Response</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">Allowed Groups</Label>
                <select multiple value={form.allowed_group_ids} onChange={(e) => setForm({ ...form, allowed_group_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-24">
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Leave empty for all users</p>
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

      {/* Metadata Modal */}
      <Dialog open={showMetadataModal} onOpenChange={setShowMetadataModal}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>SAML Metadata - {selectedApp?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            <Button onClick={copyMetadata} className="btn-secondary"><Copy size={16} className="mr-2" /> Copy</Button>
            <Button onClick={downloadMetadata} className="btn-primary"><Download size={16} className="mr-2" /> Download</Button>
          </div>
          <pre className="code-display max-h-96 overflow-auto text-xs">{metadata}</pre>
        </DialogContent>
      </Dialog>

      {/* Kissflow Configuration Modal */}
      <Dialog open={showKissflowModal} onOpenChange={setShowKissflowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gear size={20} className="text-[#0051FF]" />
              Kissflow SSO Configuration - {selectedApp?.name}
            </DialogTitle>
          </DialogHeader>
          
          {kissflowConfig && (
            <div className="space-y-4">
              <div className="p-4 bg-[#0051FF]/5 border border-[#0051FF]/20 text-sm">
                <p className="font-semibold text-[#0051FF] mb-2">Use these values in Kissflow Admin &rarr; SSO Settings</p>
                <p className="text-zinc-600">Copy each value and paste it into the corresponding field in Kissflow.</p>
              </div>

              {/* IdP URL */}
              <div className="p-4 bg-zinc-50 border border-zinc-200">
                <Label className="label-uppercase">IdP URL (Single Sign-On URL)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input value={kissflowConfig.idp_url} readOnly className="input-brutalist flex-1 font-mono text-sm" />
                  <Button onClick={() => copyToClipboard(kissflowConfig.idp_url, 'IdP URL')} className="btn-secondary py-2 px-3">
                    <Copy size={16} />
                  </Button>
                </div>
              </div>

              {/* Sign-out URL */}
              <div className="p-4 bg-zinc-50 border border-zinc-200">
                <Label className="label-uppercase">Sign-out URL (Single Logout URL)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input value={kissflowConfig.slo_url} readOnly className="input-brutalist flex-1 font-mono text-sm" />
                  <Button onClick={() => copyToClipboard(kissflowConfig.slo_url, 'Sign-out URL')} className="btn-secondary py-2 px-3">
                    <Copy size={16} />
                  </Button>
                </div>
              </div>

              {/* Security Key */}
              <div className="p-4 bg-[#FFB800]/10 border border-[#FFB800]">
                <Label className="label-uppercase text-[#FFB800]">Security Key (Certificate Fingerprint SHA256)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input value={kissflowConfig.security_key} readOnly className="input-brutalist flex-1 font-mono text-xs" />
                  <Button onClick={() => copyToClipboard(kissflowConfig.security_key, 'Security Key')} className="btn-secondary py-2 px-3">
                    <Copy size={16} />
                  </Button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">This is the SHA256 fingerprint of the signing certificate</p>
              </div>

              {/* Metadata URL */}
              <div className="p-4 bg-zinc-50 border border-zinc-200">
                <Label className="label-uppercase">Metadata URL (Optional)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input value={kissflowConfig.metadata_url} readOnly className="input-brutalist flex-1 font-mono text-sm" />
                  <Button onClick={() => copyToClipboard(kissflowConfig.metadata_url, 'Metadata URL')} className="btn-secondary py-2 px-3">
                    <Copy size={16} />
                  </Button>
                </div>
              </div>

              {/* Entity ID */}
              <div className="p-4 bg-zinc-50 border border-zinc-200">
                <Label className="label-uppercase">Entity ID</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input value={kissflowConfig.entity_id} readOnly className="input-brutalist flex-1 font-mono text-sm" />
                  <Button onClick={() => copyToClipboard(kissflowConfig.entity_id, 'Entity ID')} className="btn-secondary py-2 px-3">
                    <Copy size={16} />
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="border-t border-zinc-200 pt-4">
                <h4 className="font-bold mb-3">Setup Instructions</h4>
                <ol className="space-y-2 text-sm text-zinc-600">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                    <span>Go to Kissflow Admin &rarr; App Store &rarr; Configure App &rarr; SSO Settings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                    <span>Choose "Manual configuration" or enter values manually</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                    <span>Paste the <strong>IdP URL</strong> in the "IdP URL" field</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                    <span>Paste the <strong>Security Key</strong> (SHA256 fingerprint) in the "Security key" field</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                    <span>Save and test the SSO connection</span>
                  </li>
                </ol>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test SSO Modal */}
      <Dialog open={showTestModal} onOpenChange={setShowTestModal}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play size={20} weight="fill" className="text-[#00CC66]" />
              Test SSO - {selectedApp?.name}
            </DialogTitle>
          </DialogHeader>

          {testLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
              <span className="ml-3 text-zinc-500">Generating SAML assertion...</span>
            </div>
          )}

          {testResult && testResult.status === 'error' && (
            <div className="p-4 bg-[#FF3333]/10 border border-[#FF3333]/30">
              <div className="flex items-center gap-2 text-[#FF3333] font-bold mb-1">
                <XCircle size={18} /> SSO Test Failed
              </div>
              <p className="text-sm text-zinc-600">{testResult.error}</p>
            </div>
          )}

          {testResult && testResult.status === 'success' && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div className={`p-4 border ${testResult.signed ? 'bg-[#00CC66]/10 border-[#00CC66]/30' : 'bg-[#FFB800]/10 border-[#FFB800]/30'}`}>
                <div className="flex items-center gap-2 font-bold mb-1">
                  {testResult.signed
                    ? <><CheckCircle size={18} className="text-[#00CC66]" /> SAML Response Generated &amp; Signed</>
                    : <><XCircle size={18} className="text-[#FFB800]" /> SAML Response Generated (Unsigned)</>
                  }
                </div>
                <p className="text-sm text-zinc-600">
                  {testResult.signed
                    ? 'The SAML assertion is signed with RSA-SHA256. Ready to send to the Service Provider.'
                    : 'Warning: The assertion could not be signed. The SP may reject this response.'
                  }
                </p>
              </div>

              {/* Assertion Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-50 border border-zinc-200">
                  <Label className="label-uppercase text-xs">Issuer</Label>
                  <p className="font-mono text-xs mt-1 break-all">{testResult.issuer}</p>
                </div>
                <div className="p-3 bg-zinc-50 border border-zinc-200">
                  <Label className="label-uppercase text-xs">Destination (ACS URL)</Label>
                  <p className="font-mono text-xs mt-1 break-all">{testResult.destination}</p>
                </div>
                <div className="p-3 bg-zinc-50 border border-zinc-200">
                  <Label className="label-uppercase text-xs">NameID (User)</Label>
                  <p className="font-mono text-xs mt-1">{testResult.name_id}</p>
                </div>
                <div className="p-3 bg-zinc-50 border border-zinc-200">
                  <Label className="label-uppercase text-xs">Audience</Label>
                  <p className="font-mono text-xs mt-1 break-all">{testResult.audience}</p>
                </div>
                <div className="p-3 bg-zinc-50 border border-zinc-200">
                  <Label className="label-uppercase text-xs">Issue Instant</Label>
                  <p className="font-mono text-xs mt-1">{testResult.issue_instant}</p>
                </div>
                <div className="p-3 bg-zinc-50 border border-zinc-200">
                  <Label className="label-uppercase text-xs">Valid Until</Label>
                  <p className="font-mono text-xs mt-1">{testResult.not_on_or_after}</p>
                </div>
              </div>

              {/* Attributes */}
              <div className="p-3 bg-zinc-50 border border-zinc-200">
                <Label className="label-uppercase text-xs">SAML Attributes</Label>
                <div className="mt-2 space-y-1">
                  {Object.entries(testResult.attributes || {}).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-zinc-700 min-w-[60px]">{key}:</span>
                      <span className="font-mono text-zinc-600">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SAML XML */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="label-uppercase text-xs">SAML Response XML</Label>
                  <Button
                    onClick={() => copyToClipboard(testResult.saml_response_xml, 'SAML XML')}
                    className="btn-secondary py-1 px-2 text-xs"
                    data-testid="copy-saml-xml"
                  >
                    <Copy size={12} className="mr-1" /> Copy XML
                  </Button>
                </div>
                <pre className="code-display max-h-48 overflow-auto text-xs whitespace-pre-wrap" data-testid="saml-xml-output">
                  {testResult.saml_response_xml}
                </pre>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2 border-t border-zinc-200">
                <Button
                  onClick={launchRealSSO}
                  className="btn-primary flex-1"
                  data-testid="launch-sso-btn"
                >
                  <ArrowSquareOut size={16} className="mr-2" />
                  Send to {selectedApp?.name}
                </Button>
                <Button
                  onClick={() => copyToClipboard(testResult.saml_response_b64, 'Base64 SAMLResponse')}
                  className="btn-secondary"
                  data-testid="copy-b64-btn"
                >
                  <Copy size={16} className="mr-2" />
                  Copy Base64
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User Management Modal */}
      <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users size={20} className="text-[#9333EA]" />
              Manage Users - {selectedApp?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Add User */}
          <div className="space-y-4">
            <div>
              <Label className="label-uppercase text-xs">Add User</Label>
              <select
                onChange={(e) => { if (e.target.value) { assignUser(e.target.value); e.target.value = ''; } }}
                className="input-brutalist w-full mt-1"
                data-testid="assign-user-select"
              >
                <option value="">Select a user to assign...</option>
                {orgUsers
                  .filter(u => !appUsers.some(au => au.id === u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>
                  ))
                }
              </select>
            </div>

            {/* Assigned Users List */}
            <div>
              <Label className="label-uppercase text-xs">
                Assigned Users ({appUsers.length})
              </Label>
              {usersLoading ? (
                <div className="flex items-center justify-center py-8"><div className="spinner" /></div>
              ) : appUsers.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 border border-zinc-200 mt-2">
                  <Users size={32} className="text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No users assigned yet.</p>
                  <p className="text-xs text-zinc-400 mt-1">Only assigned users can see this app in the Launcher.</p>
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {appUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200" data-testid={`assigned-user-${u.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#9333EA]/10 flex items-center justify-center text-[#9333EA] text-xs font-bold">
                          {(u.name || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{u.name || u.email}</p>
                          <p className="text-xs text-zinc-500">{u.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeUser(u.id)}
                        className="p-1.5 hover:bg-red-50 rounded"
                        title="Remove user"
                        data-testid={`remove-user-${u.id}`}
                      >
                        <UserMinus size={16} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SAMLApps;
