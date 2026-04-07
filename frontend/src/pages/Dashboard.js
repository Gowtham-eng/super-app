import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  Users,
  UsersThree,
  ShieldCheck,
  Key,
  ClipboardText,
  Scroll,
  ArrowRight,
  TrendUp,
  UserCircleGear,
  ShieldWarning
} from '@phosphor-icons/react';

const Dashboard = () => {
  const { API, getAuthHeader } = useAuth();
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
    { label: 'Total Users', value: stats?.total_users || 0, sub: `${stats?.active_users || 0} active`, icon: Users, color: 'text-[#0051FF]', bg: 'bg-[#0051FF]/10' },
    { label: 'Groups', value: stats?.total_groups || 0, icon: UsersThree, color: 'text-[#00CC66]', bg: 'bg-[#00CC66]/10' },
    { label: 'Roles', value: stats?.total_roles || 0, icon: UserCircleGear, color: 'text-[#FFB800]', bg: 'bg-[#FFB800]/10' },
    { label: 'SAML Apps', value: stats?.saml_apps || 0, icon: ShieldCheck, color: 'text-[#0051FF]', bg: 'bg-[#0051FF]/10' },
    { label: 'OIDC Apps', value: stats?.oidc_apps || 0, icon: Key, color: 'text-[#00CC66]', bg: 'bg-[#00CC66]/10' },
    { label: 'Policies', value: stats?.access_policies || 0, icon: ShieldWarning, color: 'text-[#FF3333]', bg: 'bg-[#FF3333]/10' },
    { label: 'Pending Requests', value: stats?.pending_requests || 0, icon: ClipboardText, color: 'text-[#FFB800]', bg: 'bg-[#FFB800]/10' },
    { label: 'Logins (7 days)', value: stats?.recent_logins || 0, icon: TrendUp, color: 'text-zinc-600', bg: 'bg-zinc-100' },
  ];

  const quickActions = [
    { path: '/apps/saml', label: 'Add SAML App', desc: 'Configure new SAML 2.0 application', icon: ShieldCheck },
    { path: '/apps/oidc', label: 'Add OIDC App', desc: 'Configure new OpenID Connect application', icon: Key },
    { path: '/users', label: 'Manage Users', desc: 'Add, edit, or remove users', icon: Users },
    { path: '/groups', label: 'Manage Groups', desc: 'Create groups and assign roles', icon: UsersThree },
    { path: '/requests', label: 'Access Requests', desc: 'Review pending access requests', icon: ClipboardText },
    { path: '/audit', label: 'View Audit Logs', desc: 'Monitor activity and compliance', icon: Scroll },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <h1 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-zinc-900">IAM Dashboard</h1>
        <p className="text-zinc-500 mt-2">Identity & Access Management Overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="card-brutalist p-4" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 ${stat.bg} flex items-center justify-center`}>
                  <Icon size={16} className={stat.color} />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">{stat.label}</span>
              </div>
              <div className="text-2xl font-black text-zinc-900 font-heading">{stat.value}</div>
              {stat.sub && <div className="text-xs text-zinc-500">{stat.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <h2 className="font-heading font-bold text-xl mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <Link
              key={i}
              to={action.path}
              data-testid={`quick-action-${action.path.replace(/\//g, '-').slice(1)}`}
              className="card-brutalist p-5 group hover:border-[#0051FF] transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="w-10 h-10 bg-[#0051FF]/10 flex items-center justify-center mb-3">
                    <Icon size={20} className="text-[#0051FF]" />
                  </div>
                  <h3 className="font-bold text-base mb-1">{action.label}</h3>
                  <p className="text-sm text-zinc-500">{action.desc}</p>
                </div>
                <ArrowRight size={18} className="text-zinc-300 group-hover:text-[#0051FF] transition-colors mt-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
