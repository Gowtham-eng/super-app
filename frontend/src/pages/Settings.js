import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Gear,
  Copy,
  Globe,
  ShieldCheck,
  Key,
  Info
} from '@phosphor-icons/react';

const Settings = () => {
  const { user } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const endpoints = [
    {
      label: 'SAML Metadata URL',
      url: `${backendUrl}/api/saml/metadata`,
      description: 'Public SAML IdP metadata endpoint'
    },
    {
      label: 'SAML SSO URL',
      url: `${backendUrl}/api/saml/sso`,
      description: 'Single Sign-On endpoint for SAML'
    },
    {
      label: 'SAML SLO URL',
      url: `${backendUrl}/api/saml/slo`,
      description: 'Single Logout endpoint for SAML'
    },
    {
      label: 'OIDC Discovery URL',
      url: `${backendUrl}/api/oidc/.well-known/openid-configuration`,
      description: 'OpenID Connect discovery document'
    },
    {
      label: 'OIDC Authorization Endpoint',
      url: `${backendUrl}/api/oidc/authorize`,
      description: 'Authorization endpoint for OIDC'
    },
    {
      label: 'OIDC Token Endpoint',
      url: `${backendUrl}/api/oidc/token`,
      description: 'Token endpoint for OIDC'
    },
    {
      label: 'OIDC UserInfo Endpoint',
      url: `${backendUrl}/api/oidc/userinfo`,
      description: 'UserInfo endpoint for OIDC'
    },
    {
      label: 'SCIM Users Endpoint',
      url: `${backendUrl}/api/scim/v2/Users`,
      description: 'SCIM 2.0 user provisioning endpoint'
    }
  ];

  return (
    <div className="animate-fadeIn max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
          <Gear weight="bold" className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">
            Settings
          </h1>
          <p className="text-zinc-500">SSO endpoints and configuration reference</p>
        </div>
      </div>

      {/* Account Info */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Info size={20} />
          Account Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="label-uppercase">Name</Label>
            <p className="text-zinc-900 font-medium">{user?.name}</p>
          </div>
          <div>
            <Label className="label-uppercase">Email</Label>
            <p className="text-zinc-900 font-medium">{user?.email}</p>
          </div>
          <div>
            <Label className="label-uppercase">Role</Label>
            <p className="text-zinc-900 font-medium capitalize">{user?.role}</p>
          </div>
          <div>
            <Label className="label-uppercase">User ID</Label>
            <p className="text-zinc-500 font-mono text-sm">{user?.id}</p>
          </div>
        </div>
      </div>

      {/* SSO Endpoints */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Globe size={20} />
          SSO Endpoints
        </h2>
        <p className="text-sm text-zinc-500 mb-6">
          Use these endpoints to configure Kissflow SSO integration. Copy the URLs and paste them into your Kissflow admin settings.
        </p>

        <div className="space-y-4">
          {endpoints.map((endpoint, index) => (
            <div key={index} className="p-4 bg-zinc-50 border border-zinc-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="label-uppercase">{endpoint.label}</Label>
                  <p className="font-mono text-sm text-zinc-900 break-all mt-1">{endpoint.url}</p>
                  <p className="text-xs text-zinc-500 mt-1">{endpoint.description}</p>
                </div>
                <Button
                  type="button"
                  onClick={() => copyToClipboard(endpoint.url)}
                  className="btn-secondary py-2 px-3 flex-shrink-0"
                >
                  <Copy size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Protocol Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SAML Reference */}
        <div className="card-brutalist p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <ShieldCheck size={20} className="text-[#0051FF]" />
            SAML 2.0 Reference
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-zinc-500">Protocol:</span>
              <span className="ml-2 font-medium">SAML 2.0</span>
            </div>
            <div>
              <span className="text-zinc-500">Bindings:</span>
              <span className="ml-2 font-medium">HTTP-POST, HTTP-Redirect</span>
            </div>
            <div>
              <span className="text-zinc-500">Name ID Formats:</span>
              <span className="ml-2 font-medium">Email, Persistent, Transient</span>
            </div>
            <div>
              <span className="text-zinc-500">Signing:</span>
              <span className="ml-2 font-medium">RSA-SHA256</span>
            </div>
            <div>
              <span className="text-zinc-500">Certificate:</span>
              <span className="ml-2 font-medium">Auto-generated X.509</span>
            </div>
          </div>
        </div>

        {/* OIDC Reference */}
        <div className="card-brutalist p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Key size={20} className="text-[#0051FF]" />
            OpenID Connect Reference
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-zinc-500">Protocol:</span>
              <span className="ml-2 font-medium">OpenID Connect 1.0</span>
            </div>
            <div>
              <span className="text-zinc-500">Grant Types:</span>
              <span className="ml-2 font-medium">Authorization Code, Implicit</span>
            </div>
            <div>
              <span className="text-zinc-500">Response Types:</span>
              <span className="ml-2 font-medium">code, token, id_token</span>
            </div>
            <div>
              <span className="text-zinc-500">Scopes:</span>
              <span className="ml-2 font-medium">openid, profile, email</span>
            </div>
            <div>
              <span className="text-zinc-500">Token Signing:</span>
              <span className="ml-2 font-medium">RS256</span>
            </div>
          </div>
        </div>
      </div>

      {/* Kissflow Integration Guide */}
      <div className="card-brutalist p-6 mt-6 border-l-4 border-l-[#0051FF]">
        <h3 className="font-bold text-lg mb-4">Kissflow Integration Guide</h3>
        <ol className="space-y-3 text-sm text-zinc-600">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
            <div>
              <strong className="text-zinc-900">Configure SSO Protocol</strong>
              <p>Go to SAML Config or OIDC Config page and enter your Kissflow settings (Entity ID, ACS URL, etc.)</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
            <div>
              <strong className="text-zinc-900">Download/Copy Metadata</strong>
              <p>For SAML: Download the metadata XML file or copy the metadata URL</p>
              <p>For OIDC: Copy the discovery URL and client credentials</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
            <div>
              <strong className="text-zinc-900">Configure in Kissflow</strong>
              <p>Go to Kissflow Admin → App Store → Configure App and paste the metadata/credentials</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
            <div>
              <strong className="text-zinc-900">Test Connection</strong>
              <p>Use the "Test Connection" button to verify the configuration works correctly</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 bg-[#0051FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
            <div>
              <strong className="text-zinc-900">Provision Users</strong>
              <p>Add users manually, configure SCIM for automatic provisioning, or enable JIT provisioning</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
};

export default Settings;
