import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Gear, Copy, Globe, ShieldCheck, Key } from '@phosphor-icons/react';
import { toast } from 'sonner';

const Settings = () => {
  const { user, organization } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const endpoints = [
    { label: 'SAML Metadata (per app)', url: `${backendUrl}/api/apps/saml/{app_id}/metadata`, desc: 'Replace {app_id} with actual app ID' },
    { label: 'OIDC Discovery (per app)', url: `${backendUrl}/api/apps/oidc/{app_id}/.well-known/openid-configuration`, desc: 'Replace {app_id} with actual app ID' },
    { label: 'SCIM Users Endpoint', url: `${backendUrl}/api/scim/v2/Users`, desc: 'SCIM 2.0 user provisioning' },
  ];

  return (
    <div className="animate-fadeIn max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-zinc-800 flex items-center justify-center">
          <Gear weight="bold" className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Settings</h1>
          <p className="text-zinc-500">Organization and endpoint configuration</p>
        </div>
      </div>

      {/* Organization Info */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">Organization</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="label-uppercase">Name</Label>
            <p className="font-semibold">{organization?.name || '-'}</p>
          </div>
          <div>
            <Label className="label-uppercase">Domain</Label>
            <p className="font-mono text-sm">{organization?.domain || '-'}</p>
          </div>
          <div>
            <Label className="label-uppercase">Organization ID</Label>
            <p className="font-mono text-xs text-zinc-500">{organization?.id || '-'}</p>
          </div>
          <div>
            <Label className="label-uppercase">Status</Label>
            <p className="font-semibold text-[#00CC66]">{organization?.status || '-'}</p>
          </div>
        </div>
      </div>

      {/* Current User */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">Your Account</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="label-uppercase">Name</Label>
            <p className="font-semibold">{user?.name}</p>
          </div>
          <div>
            <Label className="label-uppercase">Email</Label>
            <p className="font-mono text-sm">{user?.email}</p>
          </div>
          <div>
            <Label className="label-uppercase">Role</Label>
            <p className="font-semibold capitalize">{user?.role}</p>
          </div>
          <div>
            <Label className="label-uppercase">User ID</Label>
            <p className="font-mono text-xs text-zinc-500">{user?.id}</p>
          </div>
        </div>
      </div>

      {/* API Endpoints */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Globe size={20} /> API Endpoints
        </h2>
        <div className="space-y-4">
          {endpoints.map((ep, i) => (
            <div key={i} className="p-4 bg-zinc-50 border border-zinc-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="label-uppercase">{ep.label}</Label>
                  <p className="font-mono text-sm break-all mt-1">{ep.url}</p>
                  <p className="text-xs text-zinc-500 mt-1">{ep.desc}</p>
                </div>
                <Button onClick={() => copyToClipboard(ep.url)} className="btn-secondary py-1 px-2 flex-shrink-0">
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Guide */}
      <div className="card-brutalist p-6 border-l-4 border-l-[#0051FF]">
        <h3 className="font-bold text-lg mb-4">Kissflow Integration Guide</h3>
        <ol className="space-y-3 text-sm text-zinc-600">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
            <div>
              <strong className="text-zinc-900">Create Application</strong>
              <p>Go to SAML Apps or OIDC Apps and create a new application for Kissflow</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
            <div>
              <strong className="text-zinc-900">Configure Access</strong>
              <p>Assign groups/roles to control who can access the application</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
            <div>
              <strong className="text-zinc-900">Copy Metadata</strong>
              <p>Download SAML metadata or copy OIDC discovery URL</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
            <div>
              <strong className="text-zinc-900">Configure in Kissflow</strong>
              <p>Paste the metadata/credentials in Kissflow's SSO configuration</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
            <div>
              <strong className="text-zinc-900">Set Access Policies</strong>
              <p>Create policies to restrict access by IP or time if needed</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
};

export default Settings;
