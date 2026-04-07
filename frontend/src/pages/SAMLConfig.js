import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  ShieldCheck,
  Copy,
  Download,
  CheckCircle,
  ArrowClockwise,
  Lightning
} from '@phosphor-icons/react';

const SAMLConfig = () => {
  const { API, getAuthHeader } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [metadata, setMetadata] = useState('');
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    entity_id: '',
    acs_url: '',
    slo_url: '',
    name_id_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    sign_assertions: true,
    sign_response: true
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API}/saml/config`, getAuthHeader());
      if (response.data && response.data.entity_id) {
        setConfig(response.data);
        setFormData({
          entity_id: response.data.entity_id || '',
          acs_url: response.data.acs_url || '',
          slo_url: response.data.slo_url || '',
          name_id_format: response.data.name_id_format || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
          sign_assertions: response.data.sign_assertions ?? true,
          sign_response: response.data.sign_response ?? true
        });
        fetchMetadata();
      }
    } catch (error) {
      console.error('Failed to load SAML config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const response = await axios.get(`${API}/saml/metadata`);
      setMetadata(response.data);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const method = config ? 'put' : 'post';
      const response = await axios[method](`${API}/saml/config`, formData, getAuthHeader());
      setConfig(response.data);
      toast.success('SAML configuration saved successfully');
      fetchMetadata();
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
        { protocol: 'saml', config_id: config?.id || '' },
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMetadata = () => {
    const blob = new Blob([metadata], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saml-metadata.xml';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Metadata downloaded');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
          <ShieldCheck weight="bold" className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">
            SAML Configuration
          </h1>
          <p className="text-zinc-500">Configure SAML 2.0 identity provider for Kissflow</p>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="card-brutalist p-6 mb-6">
        <h2 className="font-bold text-lg mb-6 pb-4 border-b border-zinc-200">
          Service Provider Settings
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="label-uppercase">Entity ID / Client ID *</Label>
              <Input
                type="url"
                value={formData.entity_id}
                onChange={(e) => setFormData({ ...formData, entity_id: e.target.value })}
                placeholder="https://refexgroup.kissflow.com/saml/"
                required
                data-testid="entity-id-input"
                className="input-brutalist w-full mt-1 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">The unique identifier for your Kissflow instance</p>
            </div>

            <div>
              <Label className="label-uppercase">ACS URL (Assertion Consumer Service) *</Label>
              <Input
                type="url"
                value={formData.acs_url}
                onChange={(e) => setFormData({ ...formData, acs_url: e.target.value })}
                placeholder="https://refexgroup.kissflow.com/signin/2/.../saml/?acs"
                required
                data-testid="acs-url-input"
                className="input-brutalist w-full mt-1 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">Where SAML responses should be sent</p>
            </div>

            <div>
              <Label className="label-uppercase">SLO URL (Single Logout)</Label>
              <Input
                type="url"
                value={formData.slo_url}
                onChange={(e) => setFormData({ ...formData, slo_url: e.target.value })}
                placeholder="https://refexgroup.kissflow.com/logout"
                data-testid="slo-url-input"
                className="input-brutalist w-full mt-1 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">Optional: For single logout support</p>
            </div>

            <div>
              <Label className="label-uppercase">Name ID Format</Label>
              <select
                value={formData.name_id_format}
                onChange={(e) => setFormData({ ...formData, name_id_format: e.target.value })}
                data-testid="nameid-format-select"
                className="input-brutalist w-full mt-1 py-2"
              >
                <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">Email Address</option>
                <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">Persistent</option>
                <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">Transient</option>
                <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">Unspecified</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-4 border-t border-zinc-100">
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.sign_assertions}
                onCheckedChange={(checked) => setFormData({ ...formData, sign_assertions: checked })}
                data-testid="sign-assertions-switch"
              />
              <Label className="text-sm font-medium cursor-pointer">Sign Assertions</Label>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formData.sign_response}
                onCheckedChange={(checked) => setFormData({ ...formData, sign_response: checked })}
                data-testid="sign-response-switch"
              />
              <Label className="text-sm font-medium cursor-pointer">Sign Response</Label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving}
              data-testid="save-saml-config"
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
                data-testid="test-saml-connection"
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

      {/* Metadata Section */}
      {config && metadata && (
        <div className="card-brutalist p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">IdP Metadata</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => copyToClipboard(metadata)}
                data-testid="copy-metadata"
                className="btn-secondary py-2 px-4"
              >
                <Copy size={16} className="mr-2" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                type="button"
                onClick={downloadMetadata}
                data-testid="download-metadata"
                className="btn-primary py-2 px-4"
              >
                <Download size={16} className="mr-2" />
                Download XML
              </Button>
            </div>
          </div>

          <p className="text-sm text-zinc-500 mb-4">
            Share this metadata with Kissflow to complete the SSO setup. You can copy the XML or download the file.
          </p>

          <div className="relative">
            <pre className="code-display max-h-96 overflow-auto">
              {typeof metadata === 'string' ? metadata : JSON.stringify(metadata, null, 2)}
            </pre>
          </div>

          {/* Metadata URL */}
          <div className="mt-4 p-4 bg-zinc-50 border border-zinc-200">
            <Label className="label-uppercase">Metadata URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="text"
                value={`${process.env.REACT_APP_BACKEND_URL}/api/saml/metadata`}
                readOnly
                className="input-brutalist flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                onClick={() => copyToClipboard(`${process.env.REACT_APP_BACKEND_URL}/api/saml/metadata`)}
                className="btn-secondary py-2 px-3"
              >
                <Copy size={16} />
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Use this URL in Kissflow to automatically fetch your IdP metadata
            </p>
          </div>
        </div>
      )}

      {/* Certificate Section */}
      {config?.certificate && (
        <div className="card-brutalist p-6 mt-6">
          <h2 className="font-bold text-lg mb-4">Signing Certificate</h2>
          <p className="text-sm text-zinc-500 mb-4">
            This certificate is used to sign SAML assertions. Upload it to Kissflow if required.
          </p>
          <div className="relative">
            <pre className="code-display max-h-48 overflow-auto text-xs">
              {config.certificate}
            </pre>
            <button
              onClick={() => copyToClipboard(config.certificate)}
              className="absolute top-2 right-2 bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1 text-xs"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SAMLConfig;
