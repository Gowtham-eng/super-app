import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Users, Plus, PencilSimple, Trash, MagnifyingGlass, UserPlus } from '@phosphor-icons/react';

const UsersPage = () => {
  const { API, getAuthHeader, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [editForm, setEditForm] = useState({ name: '', status: '', group_ids: [], role_ids: [] });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [usersRes, groupsRes, rolesRes] = await Promise.all([
        axios.get(`${API}/users`, getAuthHeader()),
        axios.get(`${API}/groups`, getAuthHeader()),
        axios.get(`${API}/roles`, getAuthHeader())
      ]);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${API}/users`, { ...form, org_id: currentUser.org_id }, getAuthHeader());
      toast.success('User created');
      setShowModal(false);
      setForm({ email: '', password: '', name: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/users/${selectedUser.id}`, editForm, getAuthHeader());
      toast.success('User updated');
      setSelectedUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.name}?`)) return;
    try {
      await axios.delete(`${API}/users/${user.id}`, getAuthHeader());
      toast.success('User deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const editUser = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      status: user.status,
      group_ids: user.group_ids || [],
      role_ids: user.role_ids || []
    });
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-[#00CC66]/10 text-[#00CC66]',
      pending: 'bg-[#FFB800]/10 text-[#FFB800]',
      inactive: 'bg-zinc-100 text-zinc-500'
    };
    return <span className={`text-xs font-bold uppercase px-2 py-0.5 ${styles[status] || styles.inactive}`}>{status}</span>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
            <Users weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Users</h1>
            <p className="text-zinc-500">{users.length} users</p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)} className="btn-primary" data-testid="add-user">
          <UserPlus size={18} className="mr-2" /> Add User
        </Button>
      </div>

      {/* Search */}
      <div className="card-brutalist p-4 mb-6">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            className="input-brutalist w-full pl-10"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="card-brutalist overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Groups</th>
              <th>Status</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} data-testid={`user-${user.id}`}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#0051FF] flex items-center justify-center text-white font-bold text-sm">
                      {user.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div className="font-semibold">{user.name}</div>
                      <div className="text-xs text-zinc-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td><span className="text-xs bg-zinc-100 px-2 py-1">{user.role}</span></td>
                <td>{user.group_ids?.length || 0} groups</td>
                <td>{getStatusBadge(user.status)}</td>
                <td className="text-sm text-zinc-500">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => editUser(user)} className="p-2 hover:bg-zinc-100"><PencilSimple size={16} /></button>
                    {user.id !== currentUser?.id && (
                      <button onClick={() => deleteUser(user)} className="p-2 hover:bg-[#FF3333]/10"><Trash size={16} className="text-[#FF3333]" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label className="label-uppercase">Full Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit User - {selectedUser?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label className="label-uppercase">Full Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className="input-brutalist w-full mt-1" />
            </div>
            <div>
              <Label className="label-uppercase">Status</Label>
              <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input-brutalist w-full mt-1 py-2">
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <Label className="label-uppercase">Groups</Label>
              <select multiple value={editForm.group_ids} onChange={(e) => setEditForm({ ...editForm, group_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-24">
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="label-uppercase">Direct Roles</Label>
              <select multiple value={editForm.role_ids} onChange={(e) => setEditForm({ ...editForm, role_ids: Array.from(e.target.selectedOptions, o => o.value) })} className="input-brutalist w-full mt-1 h-24">
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setSelectedUser(null)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
