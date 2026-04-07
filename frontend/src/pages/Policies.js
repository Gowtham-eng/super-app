import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ShieldWarning, Plus, PencilSimple, Trash, Clock, Globe } from '@phosphor-icons/react';

const Policies = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', app_ids: [], enabled: true,
    conditions: { ip_whitelist: [], ip_blacklist: [], time_restrictions: {} }
  });
  const [newIp, setNewIp] = useState({ whitelist: '', blacklist: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [policiesRes, samlRes, oidcRes] = await Promise.all([
        axios.get(`${API}/policies`, getAuthHeader()),
        axios.get(`${API}/apps/saml`, getAuthHeader()),
        axios.get(`${API}/apps/oidc`, getAuthHeader())
      ]);
      setPolicies(policiesRes.data);
      setApps([
        ...samlRes.data.map(a => ({ ...a, type: 'saml' })),
        ...oidcRes.data.map(a => ({ ...a, type: 'oidc' }))
      ]);
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
      const payload = { ...form, org_id: user.org_id };
      if (selectedPolicy) {
        await axios.put(`${API}/policies/${selectedPolicy.id}`, payload, getAuthHeader());
        toast.success('Policy updated');
      } else {
        await axios.post(`${API}/policies`, payload, getAuthHeader());
        toast.success('Policy created');
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const deletePolicy = async (policy) => {
    if (!window.confirm(`Delete ${policy.name}?`)) return;
    try {
      await axios.delete(`${API}/policies/${policy.id}`, getAuthHeader());
      toast.success('Policy deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete policy');
    }
  };

  const toggleEnabled = async (policy) => {
    try {
      await axios.put(`${API}/policies/${policy.id}`, { enabled: !policy.enabled }, getAuthHeader());
      fetchData();
    } catch (error) {
      toast.error('Failed to update policy');
    }
  };

  const editPolicy = (policy) => {
    setSelectedPolicy(policy);
    setForm({
      name: policy.name,
      description: policy.description || '',
      app_ids: policy.app_ids || [],
      enabled: policy.enabled,
      conditions: policy.conditions || { ip_whitelist: [], ip_blacklist: [], time_restrictions: {} }
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedPolicy(null);
    setForm({
      name: '', description: '', app_ids: [], enabled: true,
      conditions: { ip_whitelist: [], ip_blacklist: [], time_restrictions: {} }
    });
    setNewIp({ whitelist: '', blacklist: '' });
  };

  const addIp = (type) => {
    const ip = newIp[type];
    if (ip && !form.conditions[`ip_${type}`].includes(ip)) {
      setForm({
        ...form,
        conditions: {
          ...form.conditions,
          [`ip_${type}`]: [...form.conditions[`ip_${type}`], ip]
        }
      });
      setNewIp({ ...newIp, [type]: '' });
    }
  };

  const removeIp = (type, ip) => {
    setForm({
      ...form,
      conditions: {
        ...form.conditions,
        [`ip_${type}`]: form.conditions[`ip_${type}`].filter(i => i !== ip)
      }
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FF3333] flex items-center justify-center">
            <ShieldWarning weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Access Policies</h1>
            <p className="text-zinc-500">{policies.length} policies</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary" data-testid="add-policy">
          <Plus size={18} className="mr-2" /> Add Policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <div className="card-brutalist p-12 text-center">
          <ShieldWarning size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">No Policies</h3>
          <p className="text-zinc-500">Create access policies to control app access.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div key={policy.id} className="card-brutalist p-6" data-testid={`policy-${policy.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg">{policy.name}</h3>
                    <span className={`text-xs px-2 py-0.5 font-bold ${policy.enabled ? 'bg-[#00CC66]/10 text-[#00CC66]' : 'bg-zinc-100 text-zinc-500'}`}>
                      {policy.enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  {policy.description && <p className="text-sm text-zinc-500 mt-1">{policy.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={policy.enabled} onCheckedChange={() => toggleEnabled(policy)} />
                  <button onClick={() => editPolicy(policy)} className="p-2 hover:bg-zinc-100"><PencilSimple size={18} className="text-zinc-500" /></button>
                  <button onClick={() => deletePolicy(policy)} className="p-2 hover:bg-[#FF3333]/10"><Trash size={18} className="text-[#FF3333]" /></button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-4 text-sm">
                {policy.app_ids?.length > 0 ? (
                  <div>Applies to: {policy.app_ids.length} apps</div>
                ) : (
                  <div className="text-zinc-500">Applies to: All apps</div>
                )}
                {policy.conditions?.ip_whitelist?.length > 0 && (
                  <div className="flex items-center gap-1"><Globe size={14} /> IP Whitelist</div>
                )}
                {policy.conditions?.time_restrictions?.start_hour !== undefined && (
                  <div className="flex items-center gap-1"><Clock size={14} /> Time Restricted</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedPolicy ? 'Edit Policy' : 'Add Policy'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="label-uppercase">Policy Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Apply to Apps</Label>
              <select multiple value={form.app_ids} onChange={(e) => setForm({ ...form, app_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-24">
                {apps.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
              <p className="text-xs text-zinc-500 mt-1">Leave empty to apply to all apps</p>
            </div>
            
            <div className="border-t border-zinc-200 pt-4">
              <Label className="label-uppercase">IP Whitelist</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {form.conditions.ip_whitelist?.map((ip, i) => (
                  <span key={i} className="bg-zinc-100 px-2 py-1 text-sm flex items-center gap-1">
                    {ip}
                    <button type="button" onClick={() => removeIp('whitelist', ip)} className="text-zinc-400 hover:text-[#FF3333]">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input value={newIp.whitelist} onChange={(e) => setNewIp({ ...newIp, whitelist: e.target.value })} placeholder="192.168.1.0/24" className="input-brutalist flex-1" />
                <Button type="button" onClick={() => addIp('whitelist')} className="btn-secondary">Add</Button>
              </div>
            </div>

            <div>
              <Label className="label-uppercase">IP Blacklist</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {form.conditions.ip_blacklist?.map((ip, i) => (
                  <span key={i} className="bg-[#FF3333]/10 text-[#FF3333] px-2 py-1 text-sm flex items-center gap-1">
                    {ip}
                    <button type="button" onClick={() => removeIp('blacklist', ip)} className="hover:text-[#FF3333]">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input value={newIp.blacklist} onChange={(e) => setNewIp({ ...newIp, blacklist: e.target.value })} placeholder="10.0.0.0/8" className="input-brutalist flex-1" />
                <Button type="button" onClick={() => addIp('blacklist')} className="btn-secondary">Add</Button>
              </div>
            </div>

            <div>
              <Label className="label-uppercase">Time Restrictions (UTC)</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label className="text-xs">Start Hour</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={form.conditions.time_restrictions?.start_hour ?? ''}
                    onChange={(e) => setForm({
                      ...form,
                      conditions: {
                        ...form.conditions,
                        time_restrictions: { ...form.conditions.time_restrictions, start_hour: e.target.value ? parseInt(e.target.value) : undefined }
                      }
                    })}
                    placeholder="9"
                    className="input-brutalist w-full mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">End Hour</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={form.conditions.time_restrictions?.end_hour ?? ''}
                    onChange={(e) => setForm({
                      ...form,
                      conditions: {
                        ...form.conditions,
                        time_restrictions: { ...form.conditions.time_restrictions, end_hour: e.target.value ? parseInt(e.target.value) : undefined }
                      }
                    })}
                    placeholder="18"
                    className="input-brutalist w-full mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Switch checked={form.enabled} onCheckedChange={(c) => setForm({ ...form, enabled: c })} />
              <Label>Policy Enabled</Label>
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

export default Policies;
