import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { UsersThree, Plus, PencilSimple, Trash, Users, UserCircleGear } from '@phosphor-icons/react';

const Groups = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', parent_id: '', role_ids: [] });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [groupsRes, rolesRes, usersRes] = await Promise.all([
        axios.get(`${API}/groups`, getAuthHeader()),
        axios.get(`${API}/roles`, getAuthHeader()),
        axios.get(`${API}/users`, getAuthHeader())
      ]);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
      setUsers(usersRes.data);
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
      if (!payload.parent_id) delete payload.parent_id;
      
      if (selectedGroup) {
        await axios.put(`${API}/groups/${selectedGroup.id}`, payload, getAuthHeader());
        toast.success('Group updated');
      } else {
        await axios.post(`${API}/groups`, payload, getAuthHeader());
        toast.success('Group created');
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (group) => {
    if (!window.confirm(`Delete ${group.name}?`)) return;
    try {
      await axios.delete(`${API}/groups/${group.id}`, getAuthHeader());
      toast.success('Group deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete group');
    }
  };

  const editGroup = (group) => {
    setSelectedGroup(group);
    setForm({
      name: group.name,
      description: group.description || '',
      parent_id: group.parent_id || '',
      role_ids: group.role_ids || []
    });
    setShowModal(true);
  };

  const manageMembersFn = (group) => {
    setSelectedGroup(group);
    setShowMembersModal(true);
  };

  const addMember = async (userId) => {
    try {
      await axios.post(`${API}/groups/${selectedGroup.id}/members`, [userId], getAuthHeader());
      toast.success('Member added');
      fetchData();
    } catch (error) {
      toast.error('Failed to add member');
    }
  };

  const removeMember = async (userId) => {
    try {
      await axios.delete(`${API}/groups/${selectedGroup.id}/members`, { ...getAuthHeader(), data: [userId] });
      toast.success('Member removed');
      fetchData();
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };

  const resetForm = () => {
    setSelectedGroup(null);
    setForm({ name: '', description: '', parent_id: '', role_ids: [] });
  };

  const getGroupMembers = (groupId) => users.filter(u => u.group_ids?.includes(groupId));
  const getNonMembers = (groupId) => users.filter(u => !u.group_ids?.includes(groupId));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
            <UsersThree weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Groups</h1>
            <p className="text-zinc-500">{groups.length} groups</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary" data-testid="add-group">
          <Plus size={18} className="mr-2" /> Add Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="card-brutalist p-12 text-center">
          <UsersThree size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">No Groups</h3>
          <p className="text-zinc-500">Create groups to organize users and assign roles.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <div key={group.id} className="card-brutalist p-6" data-testid={`group-${group.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg">{group.name}</h3>
                  {group.description && <p className="text-sm text-zinc-500 mt-1">{group.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => manageMembersFn(group)} className="p-2 hover:bg-zinc-100" title="Manage Members">
                    <Users size={18} className="text-zinc-500" />
                  </button>
                  <button onClick={() => editGroup(group)} className="p-2 hover:bg-zinc-100"><PencilSimple size={18} className="text-zinc-500" /></button>
                  <button onClick={() => deleteGroup(group)} className="p-2 hover:bg-[#FF3333]/10"><Trash size={18} className="text-[#FF3333]" /></button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-zinc-400" />
                  <span>{group.member_count || 0} members</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCircleGear size={16} className="text-zinc-400" />
                  <span>{group.role_ids?.length || 0} roles</span>
                </div>
                {group.parent_id && (
                  <div className="text-zinc-500">
                    Parent: {groups.find(g => g.id === group.parent_id)?.name || 'Unknown'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{selectedGroup ? 'Edit Group' : 'Add Group'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="label-uppercase">Group Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Parent Group</Label>
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="input-brutalist w-full mt-1 py-2">
                <option value="">None (Top Level)</option>
                {groups.filter(g => g.id !== selectedGroup?.id).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="label-uppercase">Assign Roles</Label>
              <select multiple value={form.role_ids} onChange={(e) => setForm({ ...form, role_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-32">
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Manage Members - {selectedGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="label-uppercase">Current Members ({getGroupMembers(selectedGroup?.id).length})</Label>
              <div className="mt-2 max-h-40 overflow-y-auto border border-zinc-200 divide-y">
                {getGroupMembers(selectedGroup?.id).map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-zinc-500">{u.email}</div>
                    </div>
                    <button onClick={() => removeMember(u.id)} className="text-[#FF3333] text-xs hover:underline">Remove</button>
                  </div>
                ))}
                {getGroupMembers(selectedGroup?.id).length === 0 && (
                  <div className="p-4 text-center text-zinc-500 text-sm">No members</div>
                )}
              </div>
            </div>
            <div>
              <Label className="label-uppercase">Add Members</Label>
              <div className="mt-2 max-h-40 overflow-y-auto border border-zinc-200 divide-y">
                {getNonMembers(selectedGroup?.id).map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-zinc-500">{u.email}</div>
                    </div>
                    <button onClick={() => addMember(u.id)} className="text-[#0051FF] text-xs hover:underline">Add</button>
                  </div>
                ))}
                {getNonMembers(selectedGroup?.id).length === 0 && (
                  <div className="p-4 text-center text-zinc-500 text-sm">All users are members</div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Groups;
