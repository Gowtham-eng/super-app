import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { UserCircleGear, Plus, PencilSimple, Trash, LockSimple } from '@phosphor-icons/react';

const Roles = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', permissions: [] });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        axios.get(`${API}/roles`, getAuthHeader()),
        axios.get(`${API}/permissions`, getAuthHeader())
      ]);
      setRoles(rolesRes.data);
      setPermissions(permsRes.data);
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
      if (selectedRole) {
        await axios.put(`${API}/roles/${selectedRole.id}`, form, getAuthHeader());
        toast.success('Role updated');
      } else {
        await axios.post(`${API}/roles`, { ...form, org_id: user.org_id }, getAuthHeader());
        toast.success('Role created');
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role) => {
    if (role.is_system) {
      toast.error('Cannot delete system roles');
      return;
    }
    if (!window.confirm(`Delete ${role.name}?`)) return;
    try {
      await axios.delete(`${API}/roles/${role.id}`, getAuthHeader());
      toast.success('Role deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete role');
    }
  };

  const editRole = (role) => {
    if (role.is_system) {
      toast.error('Cannot edit system roles');
      return;
    }
    setSelectedRole(role);
    setForm({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions || []
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedRole(null);
    setForm({ name: '', description: '', permissions: [] });
  };

  const togglePermission = (permId) => {
    setForm({
      ...form,
      permissions: form.permissions.includes(permId)
        ? form.permissions.filter(p => p !== permId)
        : [...form.permissions, permId]
    });
  };

  const getPermName = (permId) => permissions.find(p => p.id === permId)?.name || permId;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FFB800] flex items-center justify-center">
            <UserCircleGear weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Roles</h1>
            <p className="text-zinc-500">{roles.length} roles</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary" data-testid="add-role">
          <Plus size={18} className="mr-2" /> Add Role
        </Button>
      </div>

      <div className="grid gap-4">
        {roles.map((role) => (
          <div key={role.id} className="card-brutalist p-6" data-testid={`role-${role.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{role.name}</h3>
                  {role.is_system && (
                    <span className="flex items-center gap-1 text-xs bg-zinc-100 px-2 py-0.5 text-zinc-500">
                      <LockSimple size={12} /> System
                    </span>
                  )}
                </div>
                {role.description && <p className="text-sm text-zinc-500 mt-1">{role.description}</p>}
              </div>
              {!role.is_system && (
                <div className="flex items-center gap-2">
                  <button onClick={() => editRole(role)} className="p-2 hover:bg-zinc-100"><PencilSimple size={18} className="text-zinc-500" /></button>
                  <button onClick={() => deleteRole(role)} className="p-2 hover:bg-[#FF3333]/10"><Trash size={18} className="text-[#FF3333]" /></button>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-100">
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500 mb-2">Permissions</div>
              <div className="flex flex-wrap gap-2">
                {role.permissions?.map((permId) => (
                  <span key={permId} className="text-xs bg-[#0051FF]/10 text-[#0051FF] px-2 py-1">
                    {getPermName(permId)}
                  </span>
                ))}
                {(!role.permissions || role.permissions.length === 0) && (
                  <span className="text-xs text-zinc-400">No permissions</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{selectedRole ? 'Edit Role' : 'Add Role'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="label-uppercase">Role Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Permissions</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 max-h-64 overflow-y-auto border border-zinc-200 p-3">
                {permissions.map((perm) => (
                  <label key={perm.id} className="flex items-start gap-3 p-2 hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-sm">{perm.name}</div>
                      <div className="text-xs text-zinc-500">{perm.description}</div>
                    </div>
                  </label>
                ))}
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

export default Roles;
