import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  Users,
  UsersRound,
  ShieldCheck,
  KeyRound,
  ClipboardList,
  ScrollText,
  ArrowRight,
  TrendingUp,
  UserCog,
  ShieldAlert
} from 'lucide-react';

const Dashboard = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/dashboard/stats`, getAuthHeader());
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  const statCards = [
    { label: 'Total Users', value: stats?.total_users || 0, sub: `${stats?.active_users || 0} active`, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Groups', value: stats?.total_groups || 0, icon: UsersRound, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Roles', value: stats?.total_roles || 0, icon: UserCog, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'SAML Apps', value: stats?.saml_apps || 0, icon: ShieldCheck, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'OIDC Apps', value: stats?.oidc_apps || 0, icon: KeyRound, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Policies', value: stats?.access_policies || 0, icon: ShieldAlert, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Pending Requests', value: stats?.pending_requests || 0, icon: ClipboardList, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Logins (7 days)', value: stats?.recent_logins || 0, icon: TrendingUp, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  const quickActions = [
    { path: '/apps/saml', label: 'Add SAML App', desc: 'Configure new SAML 2.0 application', icon: ShieldCheck, color: 'text-violet-600', bg: 'bg-violet-50' },
    { path: '/apps/oidc', label: 'Add OIDC App', desc: 'Configure new OpenID Connect application', icon: KeyRound, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { path: '/users', label: 'Manage Users', desc: 'Add, edit, or remove users', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { path: '/groups', label: 'Manage Groups', desc: 'Create groups and assign roles', icon: UsersRound, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { path: '/requests', label: 'Access Requests', desc: 'Review pending access requests', icon: ClipboardList, color: 'text-orange-600', bg: 'bg-orange-50' },
    { path: '/audit', label: 'View Audit Logs', desc: 'Monitor activity and compliance', icon: ScrollText, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="animate-fadeIn" data-testid="admin-dashboard">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-slate-500 mb-1">{greeting()},</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-900">
          {user?.name || 'Admin'}
        </h1>
        <p className="text-slate-500 mt-1">Identity & Access Management Overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10" data-testid="stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-emerald-200 transition-all duration-200" data-testid={`stat-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="label-uppercase text-[11px]">{card.label}</span>
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <Icon size={16} className={card.color} strokeWidth={2} />
                </div>
              </div>
              <div className="stat-value">{card.value}</div>
              {card.sub && <div className="text-xs text-slate-400 mt-1">{card.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-heading text-xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="quick-actions">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.path}
                to={action.path}
                className="group bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-emerald-200 transition-all duration-200 flex items-start gap-4"
                data-testid={`action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className={`w-10 h-10 rounded-lg ${action.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={action.color} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">{action.label}</h3>
                    <ArrowRight size={16} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{action.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
