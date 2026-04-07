import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  Users,
  ShieldCheck,
  Key,
  CheckCircle,
  XCircle,
  ArrowRight,
  Lightning
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-zinc-900">
          SSO Dashboard
        </h1>
        <p className="text-zinc-500 mt-2">
          Configure and manage your Kissflow SSO integration
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card" data-testid="stat-total-users">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-zinc-100 flex items-center justify-center">
              <Users size={20} className="text-zinc-600" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">Total Users</span>
          </div>
          <div className="stat-value">{stats?.total_users || 0}</div>
          <div className="stat-label">{stats?.active_users || 0} active</div>
        </div>

        <div className="stat-card" data-testid="stat-saml-status">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 flex items-center justify-center ${stats?.saml_configured ? 'bg-[#00CC66]/10' : 'bg-zinc-100'}`}>
              <ShieldCheck size={20} className={stats?.saml_configured ? 'text-[#00CC66]' : 'text-zinc-400'} />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">SAML</span>
          </div>
          <div className="flex items-center gap-2">
            {stats?.saml_configured ? (
              <>
                <CheckCircle size={24} weight="fill" className="text-[#00CC66]" />
                <span className="font-bold text-[#00CC66]">Configured</span>
              </>
            ) : (
              <>
                <XCircle size={24} weight="fill" className="text-zinc-300" />
                <span className="font-bold text-zinc-400">Not Configured</span>
              </>
            )}
          </div>
        </div>

        <div className="stat-card" data-testid="stat-oidc-status">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 flex items-center justify-center ${stats?.oidc_configured ? 'bg-[#00CC66]/10' : 'bg-zinc-100'}`}>
              <Key size={20} className={stats?.oidc_configured ? 'text-[#00CC66]' : 'text-zinc-400'} />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">OpenID Connect</span>
          </div>
          <div className="flex items-center gap-2">
            {stats?.oidc_configured ? (
              <>
                <CheckCircle size={24} weight="fill" className="text-[#00CC66]" />
                <span className="font-bold text-[#00CC66]">Configured</span>
              </>
            ) : (
              <>
                <XCircle size={24} weight="fill" className="text-zinc-300" />
                <span className="font-bold text-zinc-400">Not Configured</span>
              </>
            )}
          </div>
        </div>

        <div className="stat-card" data-testid="stat-provisioning">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#0051FF]/10 flex items-center justify-center">
              <Lightning size={20} className="text-[#0051FF]" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">Provisioning</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Manual</span>
              <span className="font-bold">{stats?.provisioning_stats?.manual || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">SCIM</span>
              <span className="font-bold">{stats?.provisioning_stats?.scim || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">JIT</span>
              <span className="font-bold">{stats?.provisioning_stats?.jit || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="font-heading font-bold text-xl mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/saml"
            data-testid="quick-action-saml"
            className="card-brutalist p-6 group hover:border-[#0051FF] transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="w-12 h-12 bg-[#0051FF]/10 flex items-center justify-center mb-4">
                  <ShieldCheck size={24} className="text-[#0051FF]" />
                </div>
                <h3 className="font-bold text-lg mb-1">Configure SAML</h3>
                <p className="text-sm text-zinc-500">Set up SAML 2.0 identity provider for Kissflow</p>
              </div>
              <ArrowRight size={20} className="text-zinc-300 group-hover:text-[#0051FF] transition-colors" />
            </div>
          </Link>

          <Link
            to="/oidc"
            data-testid="quick-action-oidc"
            className="card-brutalist p-6 group hover:border-[#0051FF] transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="w-12 h-12 bg-[#0051FF]/10 flex items-center justify-center mb-4">
                  <Key size={24} className="text-[#0051FF]" />
                </div>
                <h3 className="font-bold text-lg mb-1">Configure OIDC</h3>
                <p className="text-sm text-zinc-500">Set up OpenID Connect for Kissflow</p>
              </div>
              <ArrowRight size={20} className="text-zinc-300 group-hover:text-[#0051FF] transition-colors" />
            </div>
          </Link>

          <Link
            to="/users"
            data-testid="quick-action-users"
            className="card-brutalist p-6 group hover:border-[#0051FF] transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="w-12 h-12 bg-[#0051FF]/10 flex items-center justify-center mb-4">
                  <Users size={24} className="text-[#0051FF]" />
                </div>
                <h3 className="font-bold text-lg mb-1">Manage Users</h3>
                <p className="text-sm text-zinc-500">Provision and manage SSO users</p>
              </div>
              <ArrowRight size={20} className="text-zinc-300 group-hover:text-[#0051FF] transition-colors" />
            </div>
          </Link>
        </div>
      </div>

      {/* Getting Started */}
      {!stats?.saml_configured && !stats?.oidc_configured && (
        <div className="card-brutalist p-6 border-l-4 border-l-[#FFB800]">
          <h3 className="font-bold text-lg mb-2">Getting Started</h3>
          <p className="text-zinc-600 mb-4">
            Configure your SSO settings to enable single sign-on with Kissflow. Start by setting up either SAML or OpenID Connect.
          </p>
          <ol className="space-y-2 text-sm text-zinc-600">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-zinc-100 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <span>Choose your protocol (SAML or OIDC) based on Kissflow requirements</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-zinc-100 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <span>Configure the entity ID, ACS URL, and other settings</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-zinc-100 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <span>Download the metadata and upload it to Kissflow</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-zinc-100 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
              <span>Test the connection to verify everything works</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
