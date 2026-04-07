import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Scroll, MagnifyingGlass, Download, User, ShieldCheck, Key, UsersThree, UserCircleGear, ClipboardText } from '@phosphor-icons/react';

const AuditLogs = () => {
  const { API, getAuthHeader } = useAuth();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', resource_type: '' });

  useEffect(() => { fetchData(); }, [filters]);

  const fetchData = async () => {
    try {
      let url = `${API}/audit-logs?limit=200`;
      if (filters.action) url += `&action=${filters.action}`;
      if (filters.resource_type) url += `&resource_type=${filters.resource_type}`;
      
      const [logsRes, summaryRes] = await Promise.all([
        axios.get(url, getAuthHeader()),
        axios.get(`${API}/audit-logs/summary`, getAuthHeader())
      ]);
      setLogs(logsRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Resource', 'Details', 'IP', 'Status'].join(','),
      ...logs.map(log => [
        log.timestamp,
        log.user_email || '-',
        log.action,
        `${log.resource_type}:${log.resource_id || '-'}`,
        JSON.stringify(log.details || {}),
        log.ip_address || '-',
        log.status
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getActionIcon = (action) => {
    if (action.includes('login')) return <User size={14} />;
    if (action.includes('saml')) return <ShieldCheck size={14} />;
    if (action.includes('oidc')) return <Key size={14} />;
    if (action.includes('group')) return <UsersThree size={14} />;
    if (action.includes('role')) return <UserCircleGear size={14} />;
    if (action.includes('request')) return <ClipboardText size={14} />;
    return <Scroll size={14} />;
  };

  const getActionColor = (action) => {
    if (action.includes('created')) return 'text-[#00CC66]';
    if (action.includes('deleted')) return 'text-[#FF3333]';
    if (action.includes('updated')) return 'text-[#FFB800]';
    if (action.includes('login')) return 'text-[#0051FF]';
    return 'text-zinc-600';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  const resourceTypes = ['user', 'app', 'group', 'role', 'policy', 'request'];
  const actions = Object.keys(summary?.action_counts || {});

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-800 flex items-center justify-center">
            <Scroll weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Audit Logs</h1>
            <p className="text-zinc-500">{summary?.total_logs || 0} total events</p>
          </div>
        </div>
        <button onClick={exportLogs} className="btn-secondary flex items-center gap-2">
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card-brutalist p-4">
          <div className="text-2xl font-black font-heading">{summary?.total_logs || 0}</div>
          <div className="text-xs text-zinc-500 uppercase">Total Events</div>
        </div>
        <div className="card-brutalist p-4">
          <div className="text-2xl font-black font-heading">{summary?.unique_users || 0}</div>
          <div className="text-xs text-zinc-500 uppercase">Unique Users</div>
        </div>
        <div className="card-brutalist p-4">
          <div className="text-2xl font-black font-heading">{summary?.action_counts?.user_login || 0}</div>
          <div className="text-xs text-zinc-500 uppercase">Logins</div>
        </div>
        <div className="card-brutalist p-4">
          <div className="text-2xl font-black font-heading">
            {Object.entries(summary?.action_counts || {}).filter(([k]) => k.includes('created')).reduce((a, [, v]) => a + v, 0)}
          </div>
          <div className="text-xs text-zinc-500 uppercase">Resources Created</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card-brutalist p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="label-uppercase">Action</Label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="input-brutalist w-full mt-1 py-2"
            >
              <option value="">All Actions</option>
              {actions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <Label className="label-uppercase">Resource Type</Label>
            <select
              value={filters.resource_type}
              onChange={(e) => setFilters({ ...filters, resource_type: e.target.value })}
              className="input-brutalist w-full mt-1 py-2"
            >
              <option value="">All Types</option>
              {resourceTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card-brutalist overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>IP Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-zinc-500">No audit logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.user_email || <span className="text-zinc-400">System</span>}</td>
                    <td>
                      <div className={`flex items-center gap-2 ${getActionColor(log.action)}`}>
                        {getActionIcon(log.action)}
                        <span className="font-medium">{log.action.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs bg-zinc-100 px-2 py-1">{log.resource_type}</span>
                      {log.resource_id && (
                        <span className="text-xs text-zinc-400 ml-1 font-mono">{log.resource_id.slice(0, 8)}...</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">{log.ip_address || '-'}</td>
                    <td>
                      <span className={`text-xs font-bold uppercase ${log.status === 'success' ? 'text-[#00CC66]' : 'text-[#FF3333]'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
