import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Users, UserPlus, Pencil, Trash2, Search, AppWindow, X, Building2, Phone, MapPin, CalendarDays, BadgeCheck, UserCog, Download, KeyRound, Check, CheckSquare, Square, UserCheck, UserX, RefreshCw, ChevronLeft, ChevronRight, Briefcase, Mail, Link2 } from 'lucide-react';

// Reusable Application Access selector (used in both Create and Edit modals)
const AppAccessSelector = ({ samlApps, selectedIds, onToggle, onSelectAll, onClear, testIdPrefix = 'assign-app' }) => {
  const [appSearch, setAppSearch] = useState('');
  const filteredApps = samlApps.filter(a => a.name.toLowerCase().includes(appSearch.toLowerCase()));
  const allSelected = samlApps.length > 0 && samlApps.every(a => selectedIds.includes(a.id));

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
            <AppWindow size={14} className="text-emerald-700" strokeWidth={2.25} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 leading-none">Application Access</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">{selectedIds.length} of {samlApps.length} selected</p>
          </div>
        </div>
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline transition"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <div className="relative mb-2.5">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={appSearch}
          onChange={(e) => setAppSearch(e.target.value)}
          placeholder="Filter apps..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
        />
      </div>

      <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 -mr-1">
        {filteredApps.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-6">No apps match "{appSearch}"</p>
        ) : filteredApps.map(app => {
          const isSelected = selectedIds.includes(app.id);
          return (
            <label
              key={app.id}
              className={`group relative flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all duration-150 ${
                isSelected
                  ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}
              data-testid={`${testIdPrefix}-row-${app.id}`}
            >
              {/* Hidden native checkbox for accessibility */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(app.id)}
                className="sr-only"
                data-testid={`${testIdPrefix}-${app.id}`}
              />
              {/* Custom checkbox visual */}
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300 group-hover:border-emerald-400'
              }`}>
                {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
              {/* App icon */}
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                {app.logo_url ? (
                  <img src={app.logo_url} alt={app.name} className="w-5 h-5 object-contain" />
                ) : (
                  <span className="font-semibold text-blue-600 text-sm">{app.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              {/* App name + type */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{app.name}</p>
                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">SAML 2.0</p>
              </div>
              {isSelected && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Granted</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
};

const Field = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-slate-800 mt-0.5 break-words" title={String(value)}>{value}</dd>
    </div>
  );
};

const Section = ({ icon: Icon, title, children }) => {
  const fields = React.Children.toArray(children).filter(Boolean);
  if (fields.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
        <Icon size={13} /> {title}
      </h4>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
        {children}
      </dl>
    </div>
  );
};

// Avatar gradient palette — deterministic by name (matches App Launcher tiles)
const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
];
const hashUser = (s = '') => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
};
const userAvatarGradient = (u) => AVATAR_GRADIENTS[hashUser(u.email || u.name || '') % AVATAR_GRADIENTS.length];

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
  const [detailUser, setDetailUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');

  const [form, setForm] = useState({ email: '', password: '', name: '', designation: '', department: '', company: '', app_ids: [] });
  const [editForm, setEditForm] = useState({ name: '', status: '', designation: '', department: '', company: '', group_ids: [], role_ids: [], app_ids: [] });
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Reset to first page when filter/search changes
  useEffect(() => { setPage(1); }, [searchTerm, quickFilter]);

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
      if (newUserId && app_ids.length > 0) {
        for (const appId of app_ids) {
          try { await axios.post(`${API}/apps/saml/${appId}/users`, { user_ids: [newUserId] }, getAuthHeader()); } catch {}
        }
      }
      toast.success('User created');
      setShowModal(false);
      setForm({ email: '', password: '', name: '', app_ids: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally { setSaving(false); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { app_ids, ...updateData } = editForm;
      await axios.put(`${API}/users/${selectedUser.id}`, updateData, getAuthHeader());
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
    } finally { setSaving(false); }
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

  const handleResetPassword = async () => {
    if (!resetPassword || resetPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/users/${resetUser.id}/reset-password`, { password: resetPassword }, getAuthHeader());
      toast.success(`Password reset for ${resetUser.name}`);
      setResetUser(null);
      setResetPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const editUser = (user) => {
    setSelectedUser(user);
    const userAppIds = samlApps.filter(a => a.approved_user_ids?.includes(user.id)).map(a => a.id);
    setEditForm({ name: user.name, status: user.status, designation: user.designation || '', department: user.department || '', company: user.company || '', group_ids: user.group_ids || [], role_ids: user.role_ids || [], app_ids: userAppIds });
  };

  const toggleApp = (appId, formSetter, currentIds) => {
    formSetter(prev => ({ ...prev, app_ids: currentIds.includes(appId) ? currentIds.filter(id => id !== appId) : [...currentIds, appId] }));
  };

  const exportUsers = async (format) => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/users/export?format=${format}`, {
        ...getAuthHeader(),
        responseType: 'blob',
      });
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_export.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported as ${ext.toUpperCase()}`);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    // Text search
    const matchesSearch = !searchTerm || [u.name, u.email, u.designation, u.department, u.company, u.adrenalin_employee_id]
      .some(f => f?.toLowerCase().includes(searchTerm.toLowerCase()));

    // Quick filter
    let matchesFilter = true;
    if (quickFilter === 'no_mobile') {
      matchesFilter = (!u.work_mobile || u.work_mobile === '0') && (!u.employee_mobile || u.employee_mobile === '0');
    } else if (quickFilter === 'active') {
      matchesFilter = u.status === 'active';
    } else if (quickFilter === 'disabled') {
      matchesFilter = u.status === 'disabled';
    } else if (quickFilter === 'no_email') {
      matchesFilter = !u.personal_email;
    } else if (quickFilter === 'no_manager') {
      matchesFilter = !u.supervisor_email;
    } else if (quickFilter === 'hr_synced') {
      matchesFilter = u.created_via === 'adrenalin_sync';
    }

    return matchesSearch && matchesFilter;
  });

  const getUserApps = (userId) => samlApps.filter(a => a.approved_user_ids?.includes(userId));

  const statusStyles = {
    active: 'bg-emerald-100 text-emerald-800',
    disabled: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-800',
    inactive: 'bg-slate-100 text-slate-500',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  // Stats for top cards
  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    disabled: users.filter(u => u.status === 'disabled').length,
    synced: users.filter(u => !!u.kissflow_user_id).length,
  };

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedUsers = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="animate-fadeIn" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">User Master</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage workspace identities, access, and HR sync</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button
              disabled={exporting}
              className="btn-secondary"
              data-testid="export-btn"
              onClick={() => exportUsers('xlsx')}
            >
              <Download size={16} /> {exporting ? 'Exporting...' : 'Export'}
            </button>
            <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden hidden group-hover:block z-20 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
              <button onClick={() => exportUsers('xlsx')} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2" data-testid="export-xlsx">
                <Download size={14} className="text-emerald-600" /> Export as Excel
              </button>
              <button onClick={() => exportUsers('csv')} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2 border-t border-slate-100" data-testid="export-csv">
                <Download size={14} className="text-emerald-600" /> Export as CSV
              </button>
            </div>
          </div>
          <Button onClick={() => setShowModal(true)} className="btn-primary" data-testid="add-user">
            <UserPlus size={16} className="mr-2" /> Add User
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5" data-testid="user-stats">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'from-blue-500 to-indigo-600', dot: '#3B82F6' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'from-emerald-500 to-teal-600', dot: '#10B981' },
          { label: 'Disabled', value: stats.disabled, icon: UserX, color: 'from-rose-500 to-red-500', dot: '#F43F5E' },
          { label: 'Kissflow Synced', value: stats.synced, icon: RefreshCw, color: 'from-violet-500 to-purple-600', dot: '#8B5CF6' },
        ].map((s) => {
          const SIcon = s.icon;
          return (
            <div key={s.label} className="group relative overflow-hidden bg-white border border-slate-200/70 rounded-xl p-4 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-all duration-200">
              <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${s.color} opacity-10 group-hover:opacity-20 transition-opacity blur-xl`} />
              <div className="relative flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center shadow-sm`}>
                  <SIcon size={16} className="text-white" strokeWidth={2.25} />
                </div>
                <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">{s.label.split(' ')[0]}</span>
              </div>
              <p className="relative text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{s.value.toLocaleString()}</p>
              <p className="relative text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Search + Quick Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by name, email, designation, department, or company..."
            className="input-brutalist w-full !pl-11 pr-4 text-ellipsis"
            data-testid="search-users"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All', count: users.length },
            { key: 'active', label: 'Active', count: users.filter(u => u.status === 'active').length },
            { key: 'disabled', label: 'Disabled', count: users.filter(u => u.status === 'disabled').length },
            { key: 'no_mobile', label: 'Missing Mobile', count: users.filter(u => (!u.work_mobile || u.work_mobile === '0') && (!u.employee_mobile || u.employee_mobile === '0')).length },
            { key: 'no_email', label: 'Missing Personal Email', count: users.filter(u => !u.personal_email).length },
            { key: 'no_manager', label: 'Missing Manager', count: users.filter(u => !u.supervisor_email).length },
            { key: 'hr_synced', label: 'HR Synced', count: users.filter(u => u.created_via === 'adrenalin_sync').length },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              data-testid={`filter-${f.key}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                quickFilter === f.key
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                quickFilter === f.key ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-200 text-slate-500'
              }`}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ width: '320px' }}>Employee</th>
                <th className="hidden md:table-cell" style={{ width: '160px' }}>Designation</th>
                <th className="hidden lg:table-cell" style={{ width: '160px' }}>Department</th>
                <th className="hidden xl:table-cell" style={{ width: '180px' }}>Company</th>
                <th className="text-right sticky right-0 bg-white shadow-[-6px_0_8px_-8px_rgba(15,23,42,0.08)]" style={{ width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                        <Users size={22} className="text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700 mb-1">No users found</p>
                      <p className="text-xs text-slate-400">{searchTerm ? 'Try a different search term or clear filters' : 'Add your first user to get started'}</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedUsers.map((user) => {
                const gradient = userAvatarGradient(user);
                const isSynced = !!user.kissflow_user_id;
                return (
                  <tr
                    key={user.id}
                    data-testid={`user-${user.id}`}
                    className="group cursor-pointer hover:bg-slate-50/70 transition-colors"
                    onClick={() => setDetailUser(detailUser?.id === user.id ? null : user)}
                  >
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`relative w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-sm`}>
                          {user.profile_pic ? (
                            <img src={user.profile_pic} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (user.name?.charAt(0)?.toUpperCase() || 'U')}
                          {user.status === 'active' && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {/* Name row */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm truncate max-w-[180px]">{user.title ? `${user.title} ` : ''}{user.name}</span>
                            {user.role === 'org_admin' && (
                              <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">ADMIN</span>
                            )}
                          </div>
                          {/* Email */}
                          <div className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                            <Mail size={11} className="text-slate-300 flex-shrink-0" /> <span className="truncate">{user.email}</span>
                          </div>
                          {/* Status + Sync + Employee ID badges row */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusStyles[user.status] || statusStyles.inactive}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                user.status === 'active' ? 'bg-emerald-500' :
                                user.status === 'disabled' ? 'bg-red-500' :
                                user.status === 'pending' ? 'bg-amber-500' : 'bg-slate-400'
                              }`} />
                              {user.status}
                            </span>
                            {isSynced && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200/60 px-1.5 py-0.5 rounded" title={`Kissflow ID: ${user.kissflow_user_id}`}>
                                <Link2 size={9} strokeWidth={2.5} /> Kissflow
                              </span>
                            )}
                            {user.adrenalin_employee_id && (
                              <span className="text-[10px] text-slate-400 font-mono">{user.adrenalin_employee_id}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="text-sm text-slate-700 truncate block" title={user.designation || ''}>{user.designation || <span className="text-slate-300">—</span>}</span>
                    </td>
                    <td className="hidden lg:table-cell">
                      <span className="text-sm text-slate-700 truncate block" title={user.department || ''}>{user.department || <span className="text-slate-300">—</span>}</span>
                    </td>
                    <td className="hidden xl:table-cell">
                      <span className="text-xs text-slate-600 truncate block" title={user.company || ''}>{user.company || <span className="text-slate-300">—</span>}</span>
                    </td>
                    <td className="sticky right-0 bg-white group-hover:bg-slate-50/70 shadow-[-6px_0_8px_-8px_rgba(15,23,42,0.08)] transition-colors">
                      <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setResetUser(user); setResetPassword(''); }} className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors" title="Reset Password" data-testid={`reset-pwd-${user.id}`}>
                          <KeyRound size={15} className="text-amber-500" />
                        </button>
                        <button onClick={() => editUser(user)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors" title="Edit" data-testid={`edit-user-${user.id}`}>
                          <Pencil size={15} className="text-slate-500" />
                        </button>
                        {user.id !== currentUser?.id && (
                          <button onClick={() => deleteUser(user)} className="p-1.5 hover:bg-red-100 rounded-lg transition-colors" title="Delete" data-testid={`delete-user-${user.id}`}>
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

        {/* Pagination */}
        {filteredUsers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40">
            <p className="text-xs text-slate-500" data-testid="pagination-info">
              Showing <span className="font-semibold text-slate-700">{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredUsers.length)}</span> of <span className="font-semibold text-slate-700">{filteredUsers.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                data-testid="prev-page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs font-semibold text-slate-700 px-3 tabular-nums" data-testid="current-page">
                Page {currentPage} <span className="text-slate-400 font-normal">of {totalPages}</span>
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                data-testid="next-page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Panel (slide-in from right) */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="user-detail-panel">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDetailUser(null)} />
          <div className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto animate-slideInRight">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-heading font-semibold text-lg text-slate-900">{detailUser.title ? `${detailUser.title} ` : ''}{detailUser.name}</h2>
                <p className="text-sm text-slate-400">{detailUser.email}</p>
              </div>
              <button onClick={() => setDetailUser(null)} className="p-2 hover:bg-slate-100 rounded-lg" data-testid="close-detail">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Identity */}
              <Section icon={BadgeCheck} title="Identity">
                <Field label="Employee ID" value={detailUser.adrenalin_employee_id} />
                <Field label="Title" value={detailUser.title} />
                <Field label="First Name" value={detailUser.first_name} />
                <Field label="Last Name" value={detailUser.last_name} />
                <Field label="Gender" value={detailUser.sex === 'M' ? 'Male' : detailUser.sex === 'F' ? 'Female' : detailUser.sex} />
                <Field label="Date of Birth" value={detailUser.date_of_birth} />
                <Field label="PAN Number" value={detailUser.pan_number} />
                <Field label="System Role" value={detailUser.role === 'org_admin' ? 'Admin' : 'User'} />
                <Field label="Status" value={detailUser.status} />
              </Section>

              {/* Contact */}
              <Section icon={Phone} title="Contact">
                <Field label="Work Email" value={detailUser.email} />
                <Field label="Personal Email" value={detailUser.personal_email} />
                <Field label="Work Mobile" value={detailUser.work_mobile} />
                <Field label="Personal Mobile" value={detailUser.employee_mobile} />
                <Field label="Pincode" value={detailUser.employee_pincode} />
              </Section>

              {/* Organization */}
              <Section icon={Building2} title="Organization">
                <Field label="Designation" value={detailUser.designation} />
                <Field label="Department" value={detailUser.department} />
                <Field label="Dept Code" value={detailUser.department_code} />
                <Field label="Grade" value={detailUser.grade} />
                <Field label="Company" value={detailUser.company} />
                <Field label="Legal Entity" value={detailUser.legal_entity_code} />
                <Field label="Business Line" value={detailUser.business_line} />
                <Field label="Branch" value={detailUser.branch_code} />
              </Section>

              {/* Location */}
              <Section icon={MapPin} title="Location">
                <Field label="Location" value={detailUser.location} />
                <Field label="Office Location" value={detailUser.office_location} />
              </Section>

              {/* Reporting */}
              <Section icon={UserCog} title="Reporting Chain">
                <Field label="L1 Manager" value={detailUser.supervisor_name} />
                <Field label="L1 Email" value={detailUser.supervisor_email} />
                <Field label="L1 Employee Code" value={detailUser.supervisor_employee_code} />
                <Field label="L2 Manager" value={detailUser.l2_manager_name} />
                <Field label="L2 Email" value={detailUser.l2_manager_email} />
                <Field label="L2 Employee Code" value={detailUser.l2_manager_employee_code} />
              </Section>

              {/* Employment */}
              <Section icon={CalendarDays} title="Employment">
                <Field label="Employee Status" value={detailUser.employee_status_description} />
                <Field label="Employment Status" value={detailUser.employment_status_description} />
                <Field label="Joining Date" value={detailUser.joining_date} />
                <Field label="Date of Exit" value={detailUser.date_of_exit} />
                <Field label="Added On" value={detailUser.emp_added_on} />
                <Field label="Created Via" value={detailUser.created_via} />
                <Field label="Last HR Sync" value={detailUser.hr_synced_at ? new Date(detailUser.hr_synced_at).toLocaleString('en-IN') : ''} />
              </Section>

              {/* App Access */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <AppWindow size={13} /> Application Access
                </h4>
                <div className="flex flex-wrap gap-2">
                  {getUserApps(detailUser.id).map(a => (
                    <span key={a.id} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium">{a.name}</span>
                  ))}
                  {getUserApps(detailUser.id).length === 0 && (
                    <span className="text-xs text-slate-400">No apps assigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
            <DialogTitle className="font-heading text-lg">Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Basic */}
              <div className="space-y-4">
                <div>
                  <Label className="label-uppercase text-xs">Full Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-brutalist w-full mt-1.5" placeholder="John Doe" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="label-uppercase text-xs">Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="input-brutalist w-full mt-1.5" placeholder="john@refex.co.in" />
                  </div>
                  <div>
                    <Label className="label-uppercase text-xs">Password *</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="input-brutalist w-full mt-1.5" placeholder="Min 8 characters" />
                  </div>
                </div>
              </div>

              {/* Organization */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Briefcase size={13} className="text-blue-700" strokeWidth={2.25} />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">Organization Details</h4>
                  <span className="text-[10px] text-slate-400 font-medium">Optional</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="label-uppercase text-xs">Designation</Label>
                    <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="input-brutalist w-full mt-1.5" placeholder="e.g. Senior Manager" data-testid="create-designation" />
                  </div>
                  <div>
                    <Label className="label-uppercase text-xs">Department</Label>
                    <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="input-brutalist w-full mt-1.5" placeholder="e.g. Information Technology" data-testid="create-department" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="label-uppercase text-xs">Company</Label>
                    <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="input-brutalist w-full mt-1.5" placeholder="e.g. Refex Industries Limited" data-testid="create-company" />
                  </div>
                </div>
              </div>

              {samlApps.length > 0 && (
                <AppAccessSelector
                  samlApps={samlApps}
                  selectedIds={form.app_ids}
                  onToggle={(id) => toggleApp(id, setForm, form.app_ids)}
                  onSelectAll={() => setForm({ ...form, app_ids: samlApps.map(a => a.id) })}
                  onClear={() => setForm({ ...form, app_ids: [] })}
                  testIdPrefix="create-assign-app"
                />
              )}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
              <Button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create User'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
            <DialogTitle className="font-heading text-lg">Edit User - {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="label-uppercase text-xs">Full Name *</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className="input-brutalist w-full mt-1.5" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="label-uppercase text-xs">Status</Label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input-brutalist w-full mt-1.5 py-2.5 rounded-lg border border-slate-200">
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Organization */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Briefcase size={13} className="text-blue-700" strokeWidth={2.25} />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">Organization Details</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="label-uppercase text-xs">Designation</Label>
                    <Input value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} className="input-brutalist w-full mt-1.5" placeholder="e.g. Senior Manager" data-testid="edit-designation" />
                  </div>
                  <div>
                    <Label className="label-uppercase text-xs">Department</Label>
                    <Input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} className="input-brutalist w-full mt-1.5" placeholder="e.g. Information Technology" data-testid="edit-department" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="label-uppercase text-xs">Company</Label>
                    <Input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} className="input-brutalist w-full mt-1.5" placeholder="e.g. Refex Industries Limited" data-testid="edit-company" />
                  </div>
                </div>
              </div>

              {samlApps.length > 0 && (
                <AppAccessSelector
                  samlApps={samlApps}
                  selectedIds={editForm.app_ids}
                  onToggle={(id) => toggleApp(id, setEditForm, editForm.app_ids)}
                  onSelectAll={() => setEditForm({ ...editForm, app_ids: samlApps.map(a => a.id) })}
                  onClear={() => setEditForm({ ...editForm, app_ids: [] })}
                  testIdPrefix="edit-assign-app"
                />
              )}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
              <Button type="button" onClick={() => setSelectedUser(null)} className="btn-secondary">Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Reset Password Modal */}
      <Dialog open={!!resetUser} onOpenChange={() => setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-heading text-lg">Reset Password</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700"><span className="font-semibold">{resetUser?.name}</span></p>
              <p className="text-xs text-slate-400">{resetUser?.email}</p>
            </div>
            <div>
              <Label className="label-uppercase text-xs">New Password *</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                className="input-brutalist w-full mt-1.5"
                data-testid="reset-password-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setResetUser(null)} className="btn-secondary">Cancel</Button>
            <Button onClick={handleResetPassword} disabled={saving} className="btn-primary" data-testid="reset-password-submit">
              {saving ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
