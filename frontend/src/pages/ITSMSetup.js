import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ITSM_API } from '../config/api';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  Headphones,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

/** Accept full Kissflow webhook URL or path-only; return { base, path }. */
const splitWebhookInput = (raw = '') => {
  const value = (raw || '').trim();
  if (!value) return { base: '', path: '' };
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const u = new URL(value);
      return {
        base: `${u.protocol}//${u.host}`,
        path: `${u.pathname}${u.search || ''}`,
      };
    } catch {
      return { base: '', path: value };
    }
  }
  return { base: '', path: value.startsWith('/') ? value : `/${value}` };
};

const SHARED_DEFAULTS = {
  application_id: 'IT_Service_Management_A00',
  approval_matrix_id: 'Live_Approval_Matrix_A00',
  refex: {
    process_id: 'Live_IT_Service_Request_A00',
    report_id: 'Service_Items_Refex_A00',
    webhook_path: '',
  },
  extrovis: {
    process_id: 'Live_IT_Service_Request_Extrovis_A00',
    report_id: 'All_tickets_A00',
    webhook_path: '',
  },
};

const emptyConnection = () => ({
  kissflow_base_url: '',
  account_id: '',
  access_key_id: '',
  access_key_secret: '',
});

const emptyShared = () => ({
  application_id: SHARED_DEFAULTS.application_id,
  approval_matrix_id: SHARED_DEFAULTS.approval_matrix_id,
  refex: { ...SHARED_DEFAULTS.refex },
  extrovis: { ...SHARED_DEFAULTS.extrovis },
});

const hydrateConnection = (raw = {}) => ({
  kissflow_base_url: String(raw.kissflow_base_url || ''),
  account_id: String(raw.account_id || ''),
  access_key_id: String(raw.access_key_id || ''),
  access_key_secret: String(raw.access_key_secret || ''),
});

const hydrateShared = (raw = {}) => ({
  application_id: String(raw.application_id || SHARED_DEFAULTS.application_id),
  approval_matrix_id: String(raw.approval_matrix_id || SHARED_DEFAULTS.approval_matrix_id),
  refex: {
    ...SHARED_DEFAULTS.refex,
    ...(raw.refex || {}),
    process_id: String(raw.refex?.process_id || SHARED_DEFAULTS.refex.process_id),
    report_id: String(raw.refex?.report_id || SHARED_DEFAULTS.refex.report_id),
    webhook_path: String(raw.refex?.webhook_path || ''),
  },
  extrovis: {
    ...SHARED_DEFAULTS.extrovis,
    ...(raw.extrovis || {}),
    process_id: String(raw.extrovis?.process_id || SHARED_DEFAULTS.extrovis.process_id),
    report_id: String(raw.extrovis?.report_id || SHARED_DEFAULTS.extrovis.report_id),
    webhook_path: String(raw.extrovis?.webhook_path || ''),
  },
});

const connectionPayload = (raw = {}) => ({
  kissflow_base_url: String(raw.kissflow_base_url || '').trim(),
  account_id: String(raw.account_id || '').trim(),
  access_key_id: String(raw.access_key_id || '').trim(),
  access_key_secret: String(raw.access_key_secret || '').trim(),
});

const sharedPayload = (raw = {}) => {
  const shared = hydrateShared(raw);
  return {
    application_id: shared.application_id.trim(),
    approval_matrix_id: shared.approval_matrix_id.trim(),
    refex: {
      process_id: String(shared.refex.process_id || '').trim(),
      report_id: String(shared.refex.report_id || '').trim(),
      webhook_path: String(shared.refex.webhook_path || '').trim(),
    },
    extrovis: {
      process_id: String(shared.extrovis.process_id || '').trim(),
      report_id: String(shared.extrovis.report_id || '').trim(),
      webhook_path: String(shared.extrovis.webhook_path || '').trim(),
    },
  };
};

const emptyForm = () => ({
  entity_key: '',
  display_name: '',
  kissflow_base_url: '',
  account_id: '',
  application_id: '',
  process_id: '',
  approval_matrix_id: '',
  webhook_input: '', // full URL or path — preferred entry for submit webhook
  access_key_id: '',
  access_key_secret: '',
  enabled: true,
  sort_order: 0,
});

const Field = ({ label, hint, children, required }) => (
  <div>
    <label className="text-xs font-medium text-slate-500 block mb-1">
      {label}
      {required ? ' *' : ''}
    </label>
    {children}
    {hint ? <p className="text-[11px] text-slate-400 mt-1">{hint}</p> : null}
  </div>
);

const inputClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const monoClass = `${inputClass} font-mono`;

const ITSMSetup = () => {
  const { getAuthHeader } = useAuth();
  const itsmApi = ITSM_API;

  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState([]);
  const [envDefaults, setEnvDefaults] = useState({});
  const [fallbackOptions, setFallbackOptions] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [envLoading, setEnvLoading] = useState(true);
  const [envSaving, setEnvSaving] = useState(false);
  const [activeEnv, setActiveEnv] = useState('development');
  const [envForm, setEnvForm] = useState({
    shared: emptyShared(),
    development: emptyConnection(),
    live: emptyConnection(),
  });

  const webhookDupes = useMemo(() => {
    const map = new Map();
    for (const e of entities) {
      const key = (e.webhook_path || '').trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e.entity_key || e.display_name);
    }
    const shared = new Set();
    for (const [, names] of map) {
      if (names.length > 1) names.forEach((n) => shared.add(n));
    }
    return shared;
  }, [entities]);

  const fetchEnvironments = async () => {
    setEnvLoading(true);
    try {
      const res = await axios.get(`${itsmApi}/itsm/admin/environments`, getAuthHeader());
      const active = res.data.active === 'live' ? 'live' : 'development';
      setActiveEnv(active);
      setEnvForm({
        shared: hydrateShared(res.data.shared),
        development: hydrateConnection(res.data.development),
        live: hydrateConnection(res.data.live),
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load Kissflow environments'));
    } finally {
      setEnvLoading(false);
    }
  };

  const fetchEntities = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${itsmApi}/itsm/admin/entities`, getAuthHeader());
      setEntities(res.data.entities || []);
      setEnvDefaults(res.data.env_defaults || {});
      setFallbackOptions(res.data.fallback_entity_options || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load ITSM entity configs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
    fetchEnvironments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    // Do NOT prefill submit webhook — each entity must get its own URL.
    // Credentials / IDs can start from env templates as optional starting point.
    setForm({
      ...emptyForm(),
      kissflow_base_url: envDefaults.kissflow_base_url || '',
      account_id: envDefaults.account_id || '',
      application_id: envDefaults.application_id || '',
      process_id: envDefaults.process_id || '',
      approval_matrix_id: envDefaults.approval_matrix_id || '',
      access_key_id: envDefaults.access_key_id || '',
      webhook_input: '',
      sort_order: entities.length,
    });
    setEditorOpen(true);
  };

  const openEdit = (entity) => {
    setEditingId(entity.id);
    const base = (entity.kissflow_base_url || '').replace(/\/$/, '');
    const path = entity.webhook_path || '';
    setForm({
      entity_key: entity.entity_key || '',
      display_name: entity.display_name || '',
      kissflow_base_url: entity.kissflow_base_url || '',
      account_id: entity.account_id || '',
      application_id: entity.application_id || '',
      process_id: entity.process_id || '',
      approval_matrix_id: entity.approval_matrix_id || '',
      webhook_input: base && path ? `${base}${path}` : path,
      access_key_id: entity.access_key_id || '',
      access_key_secret: entity.access_key_secret || '',
      enabled: entity.enabled !== false,
      sort_order: entity.sort_order || 0,
    });
    setEditorOpen(true);
  };

  const setConnectionField = (envKey, field, value) => {
    setEnvForm((prev) => ({
      ...prev,
      [envKey]: { ...prev[envKey], [field]: value },
    }));
  };

  const setSharedField = (field, value) => {
    setEnvForm((prev) => ({
      ...prev,
      shared: { ...prev.shared, [field]: value },
    }));
  };

  const setSharedSliceField = (slice, field, value) => {
    setEnvForm((prev) => ({
      ...prev,
      shared: {
        ...prev.shared,
        [slice]: { ...prev.shared[slice], [field]: value },
      },
    }));
  };

  const applySharedWebhook = (slice, value) => {
    const { path } = splitWebhookInput(value);
    setEnvForm((prev) => ({
      ...prev,
      shared: {
        ...prev.shared,
        [slice]: { ...prev.shared[slice], webhook_path: path || value },
      },
    }));
  };

  const webhookDisplay = (slice) => {
    let path = envForm.shared?.[slice]?.webhook_path || '';
    const conn = envForm[activeEnv] || envForm.development;
    const account = (conn?.account_id || '').trim();
    if (path && account) {
      path = path.replace(/\/integration\/2\/[^/]+\//, `/integration/2/${account}/`);
    }
    const base = (conn?.kissflow_base_url || '').replace(/\/$/, '');
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
  };

  const saveEnvironments = async (nextActive) => {
    const active = nextActive === 'live' || nextActive === 'development' ? nextActive : activeEnv;
    setEnvSaving(true);
    try {
      const payload = {
        active,
        shared: sharedPayload(envForm.shared),
        development: connectionPayload(envForm.development),
        live: connectionPayload(envForm.live),
      };
      const res = await axios.put(`${itsmApi}/itsm/admin/environments`, payload, getAuthHeader());
      const savedActive = res.data.active === 'live' ? 'live' : 'development';
      setActiveEnv(savedActive);
      setEnvForm({
        shared: hydrateShared(res.data.shared),
        development: hydrateConnection(res.data.development),
        live: hydrateConnection(res.data.live),
      });
      const host = String(res.data[savedActive]?.kissflow_base_url || '').replace(/\/$/, '');
      toast.success(
        `Active: ${savedActive === 'live' ? 'Live' : 'Development'}${host ? ` — ${host}` : ''}. Dashboard and create ticket now use this host.`
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save environments'));
    } finally {
      setEnvSaving(false);
    }
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const applyWebhookPaste = (value) => {
    const { base, path } = splitWebhookInput(value);
    setForm((prev) => ({
      ...prev,
      webhook_input: value,
      // If user pasted a full URL, keep base in sync; path lives in webhook_input until save
      kissflow_base_url: base || prev.kissflow_base_url,
      _parsed_webhook_path: path,
    }));
  };

  const resolveWebhookPath = () => {
    const parsed = splitWebhookInput(form.webhook_input);
    return parsed.path || form._parsed_webhook_path || '';
  };

  const saveEntity = async () => {
    if (!form.entity_key.trim()) {
      toast.error('Entity key is required');
      return;
    }
    const webhookPath = resolveWebhookPath();
    if (!webhookPath) {
      toast.error('Submit webhook is required (paste full URL or path)');
      return;
    }
    if (!form.kissflow_base_url.trim()) {
      toast.error('Kissflow base URL is required');
      return;
    }
    if (!editingId && !form.access_key_secret.trim()) {
      toast.error('Access key secret is required for new entities');
      return;
    }

    const collision = entities.find(
      (e) =>
        e.id !== editingId &&
        (e.webhook_path || '').trim() === webhookPath.trim()
    );
    if (collision) {
      const ok = window.confirm(
        `Warning: "${collision.display_name || collision.entity_key}" already uses this same submit webhook.\n` +
          `Each entity should normally have its own webhook. Save anyway?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const payload = {
        entity_key: form.entity_key.trim(),
        display_name: (form.display_name || form.entity_key).trim(),
        kissflow_base_url: form.kissflow_base_url.trim().replace(/\/$/, ''),
        account_id: form.account_id.trim(),
        application_id: form.application_id.trim(),
        process_id: form.process_id.trim(),
        approval_matrix_id: form.approval_matrix_id.trim(),
        webhook_path: webhookPath,
        access_key_id: form.access_key_id.trim(),
        enabled: !!form.enabled,
        sort_order: Number(form.sort_order) || 0,
      };
      if (form.access_key_secret.trim()) {
        payload.access_key_secret = form.access_key_secret.trim();
      } else if (!editingId) {
        payload.access_key_secret = '';
      }

      if (editingId) {
        await axios.put(`${itsmApi}/itsm/admin/entities/${editingId}`, payload, getAuthHeader());
        toast.success('Entity config updated');
      } else {
        await axios.post(`${itsmApi}/itsm/admin/entities`, payload, getAuthHeader());
        toast.success('Entity config created');
      }
      setEditorOpen(false);
      fetchEntities();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save entity config'));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntity = async (entity) => {
    if (!window.confirm(`Delete ITSM config for "${entity.display_name || entity.entity_key}"?`)) return;
    try {
      await axios.delete(`${itsmApi}/itsm/admin/entities/${entity.id}`, getAuthHeader());
      toast.success('Entity config deleted');
      fetchEntities();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete entity config'));
    }
  };

  const testMatrix = async (entity) => {
    setTestingId(entity.id);
    try {
      const res = await axios.post(
        `${itsmApi}/itsm/admin/entities/${entity.id}/test-matrix`,
        {},
        getAuthHeader()
      );
      toast.success(
        `Matrix OK for ${entity.entity_key}: ${res.data.record_count} records, ${res.data.sub_type_count} sub-types`
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Matrix test failed'));
    } finally {
      setTestingId(null);
    }
  };

  const seedDefaults = async () => {
    if (
      !window.confirm(
        'Seed Refex / Extrovis / ModePro templates?\n\n' +
          'Each entity gets its own submit webhook field — update ModePro/others after seed if they still share a placeholder.'
      )
    ) {
      return;
    }
    setSeeding(true);
    try {
      const res = await axios.post(`${itsmApi}/itsm/admin/seed-defaults`, {}, getAuthHeader());
      if (res.data.seeded > 0) {
        toast.success(`Seeded ${res.data.seeded} entity configs — review each submit webhook`);
      } else {
        toast.message(res.data.message || 'Configs already exist');
      }
      fetchEntities();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to seed defaults'));
    } finally {
      setSeeding(false);
    }
  };

  const renderConnectionCard = (envKey) => {
    const block = envForm[envKey] || emptyConnection();
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-800">
            {envKey === 'live' ? 'Live' : 'Development'} credentials
          </h4>
          {activeEnv === envKey ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              Active
            </span>
          ) : (
            <button
              type="button"
              disabled={envSaving}
              onClick={() => saveEnvironments(envKey)}
              className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              Use {envKey === 'live' ? 'Live' : 'Dev'}
            </button>
          )}
        </div>
        <div className="grid gap-3">
          <Field label="Kissflow URL" hint="Host only, no trailing slash">
            <input
              className={monoClass}
              value={block.kissflow_base_url}
              onChange={(e) => setConnectionField(envKey, 'kissflow_base_url', e.target.value)}
              placeholder={
                envKey === 'live'
                  ? 'https://refexgroup.kissflow.com'
                  : 'https://development-refexgroup.kissflow.com'
              }
            />
          </Field>
          <Field label="Account ID">
            <input
              className={monoClass}
              value={block.account_id}
              onChange={(e) => setConnectionField(envKey, 'account_id', e.target.value)}
            />
          </Field>
          <Field label="Access key ID">
            <input
              className={monoClass}
              value={block.access_key_id}
              onChange={(e) => setConnectionField(envKey, 'access_key_id', e.target.value)}
            />
          </Field>
          <Field label="Access key secret" hint="Leave blank when editing to keep the saved secret">
            <input
              className={monoClass}
              value={block.access_key_secret}
              onChange={(e) => setConnectionField(envKey, 'access_key_secret', e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
      </div>
    );
  };

  const renderSharedApis = () => {
    const shared = envForm.shared || emptyShared();
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-800">Shared APIs (same for Development and Live)</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Application ID">
            <input
              className={monoClass}
              value={shared.application_id}
              onChange={(e) => setSharedField('application_id', e.target.value)}
            />
          </Field>
          <Field label="Approval matrix ID">
            <input
              className={monoClass}
              value={shared.approval_matrix_id}
              onChange={(e) => setSharedField('approval_matrix_id', e.target.value)}
            />
          </Field>
        </div>
        {['refex', 'extrovis'].map((slice) => (
          <div key={slice} className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">
              {slice === 'refex' ? 'Refex' : 'Extrovis'} APIs
            </h4>
            <p className="text-[11px] text-slate-500">
              {slice === 'refex'
                ? 'Used when the logged-in entity is Refex. Same process, report, and webhook for development and live.'
                : 'Used for Extrovis, ModePro, Kavis, and Pharma Pack. Same IDs for development and live.'}
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Process ID">
                <input
                  className={monoClass}
                  value={shared[slice].process_id}
                  onChange={(e) => setSharedSliceField(slice, 'process_id', e.target.value)}
                />
              </Field>
              <Field label="Report ID">
                <input
                  className={monoClass}
                  value={shared[slice].report_id}
                  onChange={(e) => setSharedSliceField(slice, 'report_id', e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Submit webhook (full URL or path)"
              hint="Account ID in /integration/2/{account}/ is replaced from the active environment."
            >
              <textarea
                rows={2}
                className={`${monoClass} resize-y`}
                value={webhookDisplay(slice)}
                onChange={(e) => applySharedWebhook(slice, e.target.value)}
                placeholder="https://…kissflow.com/integration/2/…/webhook/…"
              />
            </Field>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn" data-testid="itsm-setup-page">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <Headphones size={28} className="text-blue-600" />
            ITSM Entity Setup
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Master config for Create IT Request. Each legal entity (Refex, Extrovis, ModePro, …) has its{' '}
            <strong className="font-medium text-slate-700">own submit webhook</strong>, Kissflow account,
            matrix, and access keys. Webhooks may look similar today — treat them as independent; they will change.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {entities.length === 0 && (
            <button
              type="button"
              onClick={seedDefaults}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
              data-testid="itsm-seed-defaults"
            >
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Seed templates
            </button>
          )}
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            data-testid="itsm-add-entity"
          >
            <Plus size={14} />
            Add entity
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid="itsm-environments">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold text-slate-900">Kissflow environments</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Development vs live differ only by URL, account ID, and access keys. Click Development or
              Live to switch immediately — create ticket, matrix, and dashboard then call that host.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Active</span>
            {['development', 'live'].map((key) => (
              <button
                key={key}
                type="button"
                disabled={envSaving || envLoading}
                onClick={() => {
                  if (key !== activeEnv) saveEnvironments(key);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 ${
                  activeEnv === key
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {key === 'development' ? 'Development' : 'Live'}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5 space-y-5">
          {envLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-600" size={22} />
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {renderConnectionCard('development')}
                {renderConnectionCard('live')}
              </div>
              {renderSharedApis()}
            </>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => saveEnvironments()}
              disabled={envSaving || envLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {envSaving && <Loader2 size={14} className="animate-spin" />}
              Save environments
            </button>
          </div>
        </div>
      </div>

      {webhookDupes.size > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Shared submit webhook detected</p>
            <p className="text-amber-800/90 text-xs mt-0.5">
              {Array.from(webhookDupes).join(', ')} currently use the same webhook path. Update each entity’s
              submit webhook when Kissflow issues a unique integration URL.
            </p>
          </div>
        </div>
      )}

      {entities.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <Building2 className="mx-auto text-slate-300 mb-3" size={36} />
          <h2 className="font-heading font-semibold text-slate-800 mb-1">No entity configs yet</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Add an entity and paste its Kissflow <em>submit webhook</em> URL. Create IT Request will route tickets
            for that entity to that webhook only.
            {fallbackOptions.length > 0 ? ` Fallback labels: ${fallbackOptions.join(', ')}.` : ''}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Add first entity
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="itsm-entity-list">
          {entities.map((entity) => {
            const shared = webhookDupes.has(entity.entity_key) || webhookDupes.has(entity.display_name);
            const fullWebhook = `${(entity.kissflow_base_url || '').replace(/\/$/, '')}${entity.webhook_path || ''}`;
            return (
              <div
                key={entity.id}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5"
                data-testid={`itsm-entity-card-${entity.entity_key}`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h2 className="font-heading font-semibold text-slate-900 text-lg">
                        {entity.display_name || entity.entity_key}
                      </h2>
                      {entity.enabled !== false ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                          <CheckCircle size={12} /> Enabled
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-full">
                          Disabled
                        </span>
                      )}
                      {shared && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 text-xs font-medium rounded-full">
                          <AlertTriangle size={12} /> Shared webhook
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">key: {entity.entity_key}</span>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                        <Link2 size={13} /> Submit webhook (ticket destination)
                      </div>
                      <p className="font-mono text-[11px] sm:text-xs text-slate-700 break-all">{fullWebhook || '—'}</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400">Account: </span>
                        <span className="font-mono">{entity.account_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Matrix: </span>
                        <span className="font-mono">{entity.approval_matrix_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Process: </span>
                        <span className="font-mono">{entity.process_id}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-400">Access key ID: </span>
                        <span className="font-mono break-all">{entity.access_key_id || '—'}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-400">Access key secret: </span>
                        <span className="font-mono break-all text-slate-800">
                          {entity.access_key_secret || entity.access_key_secret_masked || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => testMatrix(entity)}
                      disabled={testingId === entity.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      {testingId === entity.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Test matrix
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(entity)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntity(entity)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div
            className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl shadow-xl"
            data-testid="itsm-entity-editor"
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading font-semibold text-slate-900">
                  {editingId ? 'Edit entity config' : 'Add entity config'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submit webhook is independent per entity — paste the Kissflow URL for this entity only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Entity</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Entity key" required hint="Must match Create IT Request entity value (e.g. Extrovis)">
                    <input
                      type="text"
                      value={form.entity_key}
                      onChange={(e) => setField('entity_key', e.target.value)}
                      placeholder="Extrovis"
                      className={inputClass}
                      data-testid="itsm-field-entity-key"
                    />
                  </Field>
                  <Field label="Display name">
                    <input
                      type="text"
                      value={form.display_name}
                      onChange={(e) => setField('display_name', e.target.value)}
                      placeholder="Same as key if blank"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700 flex items-center gap-1.5">
                  <Link2 size={14} /> Submit webhook (ticket destination)
                </h3>
                <Field
                  label="Webhook URL or path"
                  required
                  hint="Paste the full Kissflow integration URL. Base URL is filled automatically when you paste a full URL."
                >
                  <textarea
                    rows={3}
                    value={form.webhook_input}
                    onChange={(e) => applyWebhookPaste(e.target.value)}
                    placeholder="https://…kissflow.com/integration/2/…/webhook/…"
                    className={`${monoClass} resize-y`}
                    data-testid="itsm-field-webhook"
                  />
                </Field>
                <Field label="Kissflow base URL" required>
                  <input
                    type="text"
                    value={form.kissflow_base_url}
                    onChange={(e) => setField('kissflow_base_url', e.target.value)}
                    placeholder="https://development-refexgroup.kissflow.com"
                    className={monoClass}
                  />
                </Field>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Kissflow IDs (can stay same today, changeable later)
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Account ID" required>
                    <input type="text" value={form.account_id} onChange={(e) => setField('account_id', e.target.value)} className={monoClass} />
                  </Field>
                  <Field label="Application ID" required>
                    <input type="text" value={form.application_id} onChange={(e) => setField('application_id', e.target.value)} className={monoClass} />
                  </Field>
                  <Field label="Process ID" required>
                    <input type="text" value={form.process_id} onChange={(e) => setField('process_id', e.target.value)} className={monoClass} />
                  </Field>
                  <Field label="Approval matrix ID" required>
                    <input type="text" value={form.approval_matrix_id} onChange={(e) => setField('approval_matrix_id', e.target.value)} className={monoClass} />
                  </Field>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Access keys</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Access key ID" required>
                    <input type="text" value={form.access_key_id} onChange={(e) => setField('access_key_id', e.target.value)} className={monoClass} />
                  </Field>
                  <Field
                    label="Access key secret"
                    required={!editingId}
                    hint="Shown to admins for setup/debug. Prefer rotating keys if this screen is shared."
                  >
                    <input
                      type="text"
                      value={form.access_key_secret}
                      onChange={(e) => setField('access_key_secret', e.target.value)}
                      placeholder=""
                      autoComplete="off"
                      className={monoClass}
                      data-testid="itsm-field-access-secret"
                    />
                  </Field>
                </div>
              </section>

              <div className="grid sm:grid-cols-2 gap-4 items-end">
                <Field label="Sort order">
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setField('sort_order', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2.5">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setField('enabled', e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Enabled in Create IT Request
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEntity}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                data-testid="itsm-save-entity"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingId ? 'Save changes' : 'Create entity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ITSMSetup;
