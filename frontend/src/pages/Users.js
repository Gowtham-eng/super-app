import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Users, UserPlus, Pencil, Trash2, Search, Shield, AppWindow } from 'lucide-react';

const UsersPage = () => {
  const { API, getAuthHeader, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [samlApps, setSamlApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ email: '', password: '', name: '', app_ids: [] });
  const [editForm, setEditForm] = useState({ name: '', status: '', group_ids: [], role_ids: [], app_ids: [] });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [usersRes, groupsRes, rolesRes, appsRes] = await Promise.all([
        axios.get(`${API}/users`, getAuthHeader()),
        axios.get(`${API}/groups`, getAuthHeader()),
        axios.get(`${API}/roles`, getAuthHeader()),
        axios.get(`${API}/apps/saml`, getAuthHeader()),
      ]);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
      setSamlApps(appsRes.data);
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
      const { app_ids, ...userData } = form;
      const res = await axios.post(`${API}/users`, { ...userData, org_id: currentUser.org_id }, getAuthHeader());
      const newUserId = res.data?.id;
      // Assign apps if selected
      if (newUserId && app_ids.length > 0) {
        for (const appId of app_ids) {
          try {
            await axios.post(`${API}/apps/saml/${appId}/users`, { user_ids: [newUserId] }, getAuthHeader());
          } catch {}
        }
      }
      toast.success('User created');
      setShowModal(false);
      setForm({ email: '', password: '', name: '', app_ids: [] });
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
      const { app_ids, ...updateData } = editForm;
      await axios.put(`${API}/users/${selectedUser.id}`, updateData, getAuthHeader());
      // Update app assignments
      for (const app of samlApps) {
        const isAssigned = app.approved_user_ids?.includes(selectedUser.id);
        const shouldBeAssigned = app_ids.includes(app.id);
        if (shouldBeAssigned && !isAssigned) {
          await axios.post(`${API}/apps/saml/${app.id}/users`, { user_ids: [selectedUser.id] }, getAuthHeader());
        } else if (!shouldBeAssigned && isAssigned) {
          await axios.delete(`${API}/apps/saml/${app.id}/users/${selectedUser.id}`, getAuthHeader());
        }
      }
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
    const userAppIds = samlApps.filter(a => a.approved_user_ids?.includes(user.id)).map(a => a.id);
    setEditForm({
      name: user.name,
      status: user.status,
      group_ids: user.group_ids || [],
      role_ids: user.role_ids || [],
      app_ids: userAppIds,
    });
  };

  const toggleApp = (appId, formSetter, currentIds) => {
    formSetter(prev => ({
      ...prev,
      app_ids: currentIds.includes(appId) ? currentIds.filter(id => id !== appId) : [...currentIds, appId]
    }));
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUserApps = (userId) => samlApps.filter(a => a.approved_user_ids?.includes(userId));

  const statusStyles = {
    active: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-amber-100 text-amber-800',
    inactive: 'bg-slate-100 text-slate-500',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">{users.length} users in your organization</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="btn-primary" data-testid="add-user">
          <UserPlus size={16} className="mr-2" /> Add User
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search users..." className="input-brutalist w-full pl-10" />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Apps</th>
              <th>Status</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const userApps = getUserApps(user.id);
              return (
                <tr key={user.id} data-testid={`user-${user.id}`}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-semibold text-sm">
                        {user.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">{user.name}</div>
                        <div className="text-xs text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                      {user.role === 'org_admin' ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td>
                    {userApps.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {userApps.map(a => (
                          <span key={a.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{a.name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No apps</span>
                    )}
                  </td>
                  <td>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyles[user.status] || statusStyles.inactive}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="text-sm text-slate-400">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => editUser(user)} className="p-2 hover:bg-slate-100 rounded-lg" data-testid={`edit-user-${user.id}`}>
                        <Pencil size={15} className="text-slate-500" />
                      </button>
                      {user.id !== currentUser?.id && (
                        <button onClick={() => deleteUser(user)} className="p-2 hover:bg-red-50 rounded-lg" data-testid={`delete-user-${user.id}`}>
                          <Trash2 size={15} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-lg">Add User</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label className="label-uppercase text-xs">Full Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1.5" placeholder="John Doe" />
              </div>
              <div>
                <Label className="label-uppercase text-xs">Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="input-brutalist w-full mt-1.5" placeholder="john@refex.co.in" />
              </div>
              <div>
                <Label className="label-uppercase text-xs">Password *</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="input-brutalist w-full mt-1.5" placeholder="Min 8 characters" />
              </div>
            </div>

            {/* App Assignment */}
            {samlApps.length > 0 && (
              <div>
                <Label className="label-uppercase text-xs flex items-center gap-1.5">
                  <AppWindow size={14} /> Application Access
                </Label>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">Select apps this user should have access to</p>
                <div className="space-y-2">
                  {samlApps.map(app => (
                    <label key={app.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${form.app_ids.includes(app.id) ? 'bg-emerald-50 border-emerald-300' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={form.app_ids.includes(app.id)}
                        onChange={() => toggleApp(app.id, setForm, form.app_ids)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        data-testid={`create-assign-app-${app.id}`}
                      />
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <span className="font-semibold text-blue-600 text-sm">{app.name.charAt(0)}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-800">{app.name}</span>
                        <span className="text-xs text-slate-400 ml-2">SAML</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create User'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-lg">Edit User - {selectedUser?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-5">
            <div>
              <Label className="label-uppercase text-xs">Full Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className="input-brutalist w-full mt-1.5" />
            </div>
            <div>
              <Label className="label-uppercase text-xs">Status</Label>
              <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input-brutalist w-full mt-1.5 py-2.5 rounded-lg border border-slate-200">
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* App Assignment */}
            {samlApps.length > 0 && (
              <div>
                <Label className="label-uppercase text-xs flex items-center gap-1.5">
                  <AppWindow size={14} /> Application Access
                </Label>
                <div className="space-y-2 mt-2">
                  {samlApps.map(app => (
                    <label key={app.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${editForm.app_ids.includes(app.id) ? 'bg-emerald-50 border-emerald-300' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={editForm.app_ids.includes(app.id)}
                        onChange={() => toggleApp(app.id, setEditForm, editForm.app_ids)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        data-testid={`edit-assign-app-${app.id}`}
                      />
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <span className="font-semibold text-blue-600 text-sm">{app.name.charAt(0)}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-800">{app.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" onClick={() => setSelectedUser(null)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
