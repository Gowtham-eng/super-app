import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Key,
  Copy,
  CheckCircle,
  ArrowClockwise,
  Lightning,
  Plus,
  X
} from '@phosphor-icons/react';

const OIDCConfig = () => {
  const { API, getAuthHeader } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [discovery, setDiscovery] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  const [newRedirectUri, setNewRedirectUri] = useState('');

  const [formData, setFormData] = useState({
    client_id: '',
    redirect_uris: [],
    scopes: ['openid', 'profile', 'email']
  });

  useEffect(() => {
    fetchConfig();
    fetchDiscovery();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API}/oidc/config`, getAuthHeader());
      if (response.data && response.data.client_id) {
        setConfig(response.data);
        setFormData({
          client_id: response.data.client_id || '',
          redirect_uris: response.data.redirect_uris || [],
          scopes: response.data.scopes || ['openid', 'profile', 'email']
        });
      }
    } catch (error) {
      console.error('Failed to load OIDC config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiscovery = async () => {
    try {
      const response = await axios.get(`${API}/oidc/.well-known/openid-configuration`);
      setDiscovery(response.data);
    } catch (error) {
      console.error('Failed to load discovery:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const method = config ? 'put' : 'post';
      const response = await axios[method](`${API}/oidc/config`, formData, getAuthHeader());
      setConfig(response.data);
      
      // Show client secret only on creation
      if (response.data.client_secret) {
        setShowSecret(true);
        toast.success('OIDC configuration saved! Make sure to copy the client secret.');
      } else {
        toast.success('OIDC configuration updated successfully');
      }
      
      fetchDiscovery();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await axios.post(
        `${API}/connection/test`,
        { protocol: 'oidc', config_id: config?.id || '' },
        getAuthHeader()
      );
      setTestResult(response.data);
      if (response.data.success) {
        toast.success('Connection test passed!');
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error('Connection test failed');
      setTestResult({ success: false, message: 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const addRedirectUri = () => {
    if (newRedirectUri && !formData.redirect_uris.includes(newRedirectUri)) {
      setFormData({
        ...formData,
        redirect_uris: [...formData.redirect_uris, newRedirectUri]
      });
      setNewRedirectUri('');
    }
  };

  const removeRedirectUri = (uri) => {
    setFormData({
      ...formData,
      redirect_uris: formData.redirect_uris.filter(u => u !== uri)
    });
  };

  const toggleScope = (scope) => {
    if (formData.scopes.includes(scope)) {
      if (scope === 'openid') return; // openid is required
      setFormData({
        ...formData,
        scopes: formData.scopes.filter(s => s !== scope)
      });
    } else {
      setFormData({
        ...formData,
        scopes: [...formData.scopes, scope]
      });
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  const availableScopes = ['openid', 'profile', 'email', 'address', 'phone'];

  return (
    <div className="animate-fadeIn max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
          <Key weight="bold" className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">
            OpenID Connect Configuration
          </h1>
          <p className="text-zinc-500">Configure OIDC provider for Kissflow</p>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-6 pb-4 border-b border-zinc-200">
          Client Settings
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label className="label-uppercase">Client ID *</Label>
            <Input
              type="text"
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              placeholder="kissflow-client"
              required
              data-testid="client-id-input"
              className="input-brutalist w-full mt-1 font-mono"
            />
            <p className="text-xs text-zinc-500 mt-1">A unique identifier for the Kissflow application</p>
          </div>

          {/* Client Secret (shown after creation) */}
          {config?.client_secret && showSecret && (
            <div className="p-4 bg-[#FFB800]/10 border border-[#FFB800]">
              <Label className="label-uppercase text-[#FFB800]">Client Secret (Save this now!)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="text"
                  value={config.client_secret}
                  readOnly
                  className="input-brutalist flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  onClick={() => copyToClipboard(config.client_secret)}
                  className="btn-secondary py-2 px-3"
                >
                  <Copy size={16} />
                </Button>
              </div>
              <p className="text-xs text-[#FFB800] mt-2 font-semibold">
                This secret will not be shown again. Copy it now!
              </p>
            </div>
          )}

          {/* Redirect URIs */}
          <div>
            <Label className="label-uppercase">Redirect URIs *</Label>
            <div className="space-y-2 mt-1">
              {formData.redirect_uris.map((uri, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={uri}
                    readOnly
                    className="input-brutalist flex-1 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeRedirectUri(uri)}
                    className="p-2 text-[#FF3333] hover:bg-[#FF3333]/10 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  type="url"
                  value={newRedirectUri}
                  onChange={(e) => setNewRedirectUri(e.target.value)}
                  placeholder="https://refexgroup.kissflow.com/callback"
                  data-testid="redirect-uri-input"
                  className="input-brutalist flex-1 font-mono text-sm"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRedirectUri())}
                />
                <Button
                  type="button"
                  onClick={addRedirectUri}
                  data-testid="add-redirect-uri"
                  className="btn-secondary py-2 px-3"
                >
                  <Plus size={18} />
                </Button>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Allowed callback URLs for Kissflow</p>
          </div>

          {/* Scopes */}
          <div>
            <Label className="label-uppercase">Scopes</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {availableScopes.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  data-testid={`scope-${scope}`}
                  disabled={scope === 'openid'}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    formData.scopes.includes(scope)
                      ? 'bg-[#0051FF] text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  } ${scope === 'openid' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {scope}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">openid scope is required and cannot be removed</p>
          </div>

          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving || formData.redirect_uris.length === 0}
              data-testid="save-oidc-config"
              className="btn-primary"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="spinner" />
                  Saving...
                </span>
              ) : (
                'Save Configuration'
              )}
            </Button>

            {config && (
              <Button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                data-testid="test-oidc-connection"
                className="btn-secondary"
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <ArrowClockwise size={18} className="animate-spin" />
                    Testing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Lightning size={18} />
                    Test Connection
                  </span>
                )}
              </Button>
            )}
          </div>
        </form>

        {/* Test Result */}
        {testResult && (
          <div className={`mt-6 p-4 ${testResult.success ? 'bg-[#00CC66]/10 border-[#00CC66]' : 'bg-[#FF3333]/10 border-[#FF3333]'} border`}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle 
                size={20} 
                weight="fill" 
                className={testResult.success ? 'text-[#00CC66]' : 'text-[#FF3333]'} 
              />
              <span className="font-bold">{testResult.message}</span>
            </div>
            {testResult.details && (
              <div className="text-sm font-mono mt-2 space-y-1">
                {Object.entries(testResult.details).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-zinc-500">{key}:</span>
                    <span className="break-all">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Discovery Document */}
      {discovery && (
        <div className="card-brutalist p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">OpenID Discovery Document</h2>
            <Button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify(discovery, null, 2))}
              data-testid="copy-discovery"
              className="btn-secondary py-2 px-4"
            >
              <Copy size={16} className="mr-2" />
              Copy
            </Button>
          </div>

          <p className="text-sm text-zinc-500 mb-4">
            This is the standard OpenID Connect discovery document. Share the discovery URL with Kissflow.
          </p>

          {/* Discovery URL */}
          <div className="mb-4 p-4 bg-zinc-50 border border-zinc-200">
            <Label className="label-uppercase">Discovery URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="text"
                value={`${process.env.REACT_APP_BACKEND_URL}/api/oidc/.well-known/openid-configuration`}
                readOnly
                className="input-brutalist flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                onClick={() => copyToClipboard(`${process.env.REACT_APP_BACKEND_URL}/api/oidc/.well-known/openid-configuration`)}
                className="btn-secondary py-2 px-3"
              >
                <Copy size={16} />
              </Button>
            </div>
          </div>

          <div className="relative">
            <pre className="code-display max-h-96 overflow-auto">
              {JSON.stringify(discovery, null, 2)}
            </pre>
          </div>

          {/* Endpoints Reference */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-50 border border-zinc-200">
              <Label className="label-uppercase">Authorization Endpoint</Label>
              <p className="font-mono text-sm mt-1 break-all">{discovery.authorization_endpoint}</p>
            </div>
            <div className="p-4 bg-zinc-50 border border-zinc-200">
              <Label className="label-uppercase">Token Endpoint</Label>
              <p className="font-mono text-sm mt-1 break-all">{discovery.token_endpoint}</p>
            </div>
            <div className="p-4 bg-zinc-50 border border-zinc-200">
              <Label className="label-uppercase">UserInfo Endpoint</Label>
              <p className="font-mono text-sm mt-1 break-all">{discovery.userinfo_endpoint}</p>
            </div>
            <div className="p-4 bg-zinc-50 border border-zinc-200">
              <Label className="label-uppercase">JWKS URI</Label>
              <p className="font-mono text-sm mt-1 break-all">{discovery.jwks_uri}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OIDCConfig;
