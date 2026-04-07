import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Users as UsersIcon,
  Plus,
  Trash,
  PencilSimple,
  MagnifyingGlass,
  UserPlus,
  Robot,
  Lightning
} from '@phosphor-icons/react';

const Users = () => {
  const { API, getAuthHeader, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'user',
    provisioning_type: 'manual'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`, getAuthHeader());
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await axios.post(`${API}/users/provision`, formData, getAuthHeader());
      setUsers([...users, response.data]);
      setShowAddModal(false);
      resetForm();
      
      if (response.data.temp_password) {
        toast.success(`User created! Temporary password: ${response.data.temp_password}`, {
          duration: 10000
        });
      } else {
        toast.success('User provisioned successfully');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add user');
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await axios.put(
        `${API}/users/${selectedUser.id}`,
        {
          name: formData.name,
          role: formData.role,
          status: formData.status
        },
        getAuthHeader()
      );
      
      setUsers(users.map(u => u.id === selectedUser.id ? response.data : u));
      setShowEditModal(false);
      resetForm();
      toast.success('User updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await axios.delete(`${API}/users/${userId}`, getAuthHeader());
      setUsers(users.filter(u => u.id !== userId));
      toast.success('User deleted successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      provisioning_type: user.provisioning_type
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      role: 'user',
      provisioning_type: 'manual'
    });
    setSelectedUser(null);
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProvisioningIcon = (type) => {
    switch (type) {
      case 'scim':
        return <Robot size={14} className="text-[#0051FF]" />;
      case 'jit':
        return <Lightning size={14} className="text-[#FFB800]" />;
      default:
        return <UserPlus size={14} className="text-zinc-400" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="badge-success">Active</span>;
      case 'pending':
        return <span className="badge-warning">Pending</span>;
      case 'inactive':
        return <span className="badge-error">Inactive</span>;
      default:
        return <span className="badge-info">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
            <UsersIcon weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">
              User Management
            </h1>
            <p className="text-zinc-500">{users.length} users provisioned</p>
          </div>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          data-testid="add-user-button"
          className="btn-primary"
        >
          <Plus size={18} className="mr-2" />
          Add User
        </Button>
      </div>

      {/* Search */}
      <div className="card-brutalist p-4 mb-6">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by name or email..."
            data-testid="search-users"
            className="input-brutalist w-full pl-10"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="card-brutalist overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Provisioning</th>
                <th>Status</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-zinc-500">
                    {searchTerm ? 'No users found matching your search' : 'No users yet. Add your first user.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} data-testid={`user-row-${user.id}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-600">
                          {user.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-900">{user.name}</div>
                          <div className="text-sm text-zinc-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`px-2 py-1 text-xs font-bold uppercase ${
                        user.role === 'admin' ? 'bg-[#0051FF]/10 text-[#0051FF]' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {getProvisioningIcon(user.provisioning_type)}
                        <span className="text-sm capitalize">{user.provisioning_type}</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(user.status)}</td>
                    <td className="text-sm text-zinc-500">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(user)}
                          data-testid={`edit-user-${user.id}`}
                          className="p-2 text-zinc-500 hover:text-[#0051FF] hover:bg-zinc-100 transition-colors"
                        >
                          <PencilSimple size={18} />
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            data-testid={`delete-user-${user.id}`}
                            className="p-2 text-zinc-500 hover:text-[#FF3333] hover:bg-[#FF3333]/10 transition-colors"
                          >
                            <Trash size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-xl">Provision New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div>
              <Label className="label-uppercase">Email Address *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@company.com"
                required
                data-testid="add-user-email"
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div>
              <Label className="label-uppercase">Full Name *</Label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
                required
                data-testid="add-user-name"
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">Role</Label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  data-testid="add-user-role"
                  className="input-brutalist w-full mt-1 py-2"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <Label className="label-uppercase">Provisioning Type</Label>
                <select
                  value={formData.provisioning_type}
                  onChange={(e) => setFormData({ ...formData, provisioning_type: e.target.value })}
                  data-testid="add-user-provisioning"
                  className="input-brutalist w-full mt-1 py-2"
                >
                  <option value="manual">Manual</option>
                  <option value="scim">SCIM</option>
                  <option value="jit">JIT</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="btn-secondary"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                data-testid="submit-add-user"
                className="btn-primary"
              >
                {saving ? 'Adding...' : 'Add User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-xl">Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div>
              <Label className="label-uppercase">Email Address</Label>
              <Input
                type="email"
                value={formData.email}
                disabled
                className="input-brutalist w-full mt-1 bg-zinc-100"
              />
            </div>
            <div>
              <Label className="label-uppercase">Full Name *</Label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="edit-user-name"
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="label-uppercase">Role</Label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  data-testid="edit-user-role"
                  className="input-brutalist w-full mt-1 py-2"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <Label className="label-uppercase">Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  data-testid="edit-user-status"
                  className="input-brutalist w-full mt-1 py-2"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => { setShowEditModal(false); resetForm(); }}
                className="btn-secondary"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                data-testid="submit-edit-user"
                className="btn-primary"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
