import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API } from '../config/api';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import {
  CheckCircle,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

const DEFAULT_ML_URL =
  'https://keyword-matching-api-645830234926.asia-south1.run.app/api/v1/keyword-match';
const DEFAULT_POLICY_URL = 'https://policy-sender-645830234926.asia-south1.run.app';

const DEFAULT_MENUS = {
  main: {
    message: 'Please choose from the following',
    options: ['Expense', 'Travel', 'IT HelpDesk', 'Policies'],
    source: 'setup',
    refreshed_at: null,
  },
  expense: {
    message: 'Please select the application',
    options: ['Food', 'Accommodation', 'Local Conveyance', 'Travel Ticket'],
    source: 'setup',
    refreshed_at: null,
  },
  travel: {
    message: 'Please select the application',
    options: ['Domestic', 'International'],
    source: 'setup',
    refreshed_at: null,
  },
  policies: {
    message: 'Select a policy to email it to yourself.',
    options: [],
    source: 'setup',
    refreshed_at: null,
  },
};

const optionsToText = (value) => (
  Array.isArray(value) ? value.join(', ') : String(value || '')
);

const textToOptions = (value) => (
  String(value || '').split(',').map((part) => part.trim()).filter(Boolean)
);

const emptyFaq = () => ({
  id: '',
  question: '',
  keywords: '',
  answer: '',
  link: '',
  enabled: true,
  sort_order: 10,
});

const keywordsToText = (value) => (
  Array.isArray(value) ? value.join(', ') : String(value || '')
);

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
const monoClass = `${inputClass} font-mono text-[13px]`;

const RefexionsSetup = () => {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingMenus, setRefreshingMenus] = useState(false);
  const [form, setForm] = useState({
    ml_url: DEFAULT_ML_URL,
    policy_service_url: DEFAULT_POLICY_URL,
    policy_template_id: 'policy_share_v1',
    policy_api_key: '',
    has_policy_api_key: false,
    faqs: [],
    policies: [],
    menus: DEFAULT_MENUS,
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [faqDraft, setFaqDraft] = useState(emptyFaq());
  const [editingId, setEditingId] = useState(null);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const [policyDraft, setPolicyDraft] = useState({
    title: '',
    description: '',
    document_id: '',
    enabled: true,
    sort_order: 10,
  });
  const [editingPolicyId, setEditingPolicyId] = useState(null);

  const fetchSetup = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/refexions/admin/setup`, getAuthHeader());
      setForm({
        ml_url: res.data.ml_url || DEFAULT_ML_URL,
        policy_service_url: res.data.policy_service_url || DEFAULT_POLICY_URL,
        policy_template_id: res.data.policy_template_id || 'policy_share_v1',
        policy_api_key: '',
        has_policy_api_key: Boolean(res.data.has_policy_api_key),
        faqs: Array.isArray(res.data.faqs) ? res.data.faqs : [],
        policies: Array.isArray(res.data.policies) ? res.data.policies : [],
        menus: res.data.menus || DEFAULT_MENUS,
      });
      if (res.data.persisted === 'memory') {
        toast.error('This is the local helper, not production Mongo. After you deploy, refresh menus on live Refexions Setup.');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load Refexions Setup'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAll = async (nextFaqs, extra = {}) => {
    setSaving(true);
    try {
      const payload = {
        ml_url: (extra.ml_url ?? form.ml_url).trim() || DEFAULT_ML_URL,
        policy_service_url: (extra.policy_service_url ?? form.policy_service_url).trim()
          || DEFAULT_POLICY_URL,
        policy_template_id: (extra.policy_template_id ?? form.policy_template_id).trim()
          || 'policy_share_v1',
        faqs: nextFaqs ?? form.faqs,
        policies: extra.policies ?? form.policies,
        menus: extra.menus ?? form.menus,
      };
      const key = String(extra.policy_api_key ?? form.policy_api_key ?? '').trim();
      if (key) payload.policy_api_key = key;
      const res = await axios.put(`${API}/refexions/admin/setup`, payload, getAuthHeader());
      setForm({
        ml_url: res.data.ml_url || DEFAULT_ML_URL,
        policy_service_url: res.data.policy_service_url || DEFAULT_POLICY_URL,
        policy_template_id: res.data.policy_template_id || 'policy_share_v1',
        policy_api_key: '',
        has_policy_api_key: Boolean(res.data.has_policy_api_key),
        faqs: Array.isArray(res.data.faqs) ? res.data.faqs : [],
        policies: Array.isArray(res.data.policies) ? res.data.policies : extra.policies || form.policies,
        menus: res.data.menus || extra.menus || form.menus,
      });
      if (res.data.persisted === 'memory') {
        toast.error('Not saved to production Mongo. Local helper has no database — use live Refexions Setup after deploy.');
        return false;
      }
      toast.success('Refexions Setup saved to production Mongo. Chat uses this stored menu and FAQ.');
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save Refexions Setup'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCreateFaq = () => {
    setEditingId(null);
    setFaqDraft({
      ...emptyFaq(),
      sort_order: ((form.faqs || []).length + 1) * 10,
    });
    setEditorOpen(true);
  };

  const openEditFaq = (row) => {
    setEditingId(row.id);
    setFaqDraft({
      id: row.id,
      question: row.question || '',
      keywords: keywordsToText(row.keywords),
      answer: row.answer || '',
      link: row.link || '',
      enabled: row.enabled !== false,
      sort_order: row.sort_order || 10,
    });
    setEditorOpen(true);
  };

  const saveFaq = async () => {
    const question = faqDraft.question.trim();
    const answer = faqDraft.answer.trim();
    if (!question || !answer) {
      toast.error('Question and answer are required.');
      return;
    }
    const next = {
      id: faqDraft.id || undefined,
      question,
      keywords: faqDraft.keywords,
      answer,
      link: faqDraft.link.trim(),
      enabled: faqDraft.enabled !== false,
      sort_order: Number(faqDraft.sort_order) || 10,
    };
    const faqs = [...(form.faqs || [])];
    const index = faqs.findIndex((row) => row.id === editingId);
    if (editingId && index >= 0) faqs[index] = { ...faqs[index], ...next };
    else faqs.push(next);
    const ok = await saveAll(faqs);
    if (ok) setEditorOpen(false);
  };

  const deleteFaq = async (row) => {
    const faqs = (form.faqs || []).filter((item) => item.id !== row.id);
    await saveAll(faqs);
  };

  const toggleFaq = async (row) => {
    const faqs = (form.faqs || []).map((item) => (
      item.id === row.id ? { ...item, enabled: item.enabled === false } : item
    ));
    await saveAll(faqs);
  };

  const patchMenu = (key, field, value) => {
    setForm((prev) => ({
      ...prev,
      menus: {
        ...prev.menus,
        [key]: {
          ...(prev.menus?.[key] || {}),
          [field]: field === 'options' ? textToOptions(value) : value,
        },
      },
    }));
  };

  const refreshMenus = async () => {
    setRefreshingMenus(true);
    try {
      const res = await axios.post(
        `${API}/refexions/admin/setup/refresh-menus`,
        {},
        getAuthHeader(),
      );
      setForm((prev) => ({
        ...prev,
        menus: res.data.menus || prev.menus,
      }));
      if (res.data.persisted === 'memory') {
        toast.error('Menus were not stored in production Mongo. Refresh them on live Refexions Setup after deploy.');
      } else if (res.data.warning) {
        toast.message(res.data.warning);
      } else {
        toast.success('Menus refreshed from Kissflow and stored in production Mongo.');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not refresh menus from Kissflow'));
    } finally {
      setRefreshingMenus(false);
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
    <div className="animate-fadeIn" data-testid="refexions-setup-page">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <MessageCircle size={28} className="text-blue-600" />
            Refexions Setup
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Maintain chat menus, FAQ answers, and Refexions API keys here. The chat reads this
            stored copy — it does not refresh from Kissflow. Pull a fresh Kissflow menu only
            with Refresh on this page. Ticket create keys stay on ITSM Setup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => saveAll()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          Save setup
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-800">API keys and URLs</h2>
        <p className="text-[11px] text-slate-500">
          Keyword-match and policy-sender Cloud Run URLs are already in production. Save them
          here only to override. Policy API key must be saved here for live policy email.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Keyword match URL" hint="Default: keyword-matching-api Cloud Run.">
            <input
              className={monoClass}
              value={form.ml_url}
              onChange={(e) => setForm((prev) => ({ ...prev, ml_url: e.target.value }))}
              placeholder={DEFAULT_ML_URL}
            />
          </Field>
          <Field label="Policy sender URL" hint="Default: policy-sender Cloud Run.">
            <input
              className={monoClass}
              value={form.policy_service_url}
              onChange={(e) => setForm((prev) => ({ ...prev, policy_service_url: e.target.value }))}
              placeholder={DEFAULT_POLICY_URL}
            />
          </Field>
          <Field label="Policy template ID">
            <input
              className={monoClass}
              value={form.policy_template_id}
              onChange={(e) => setForm((prev) => ({ ...prev, policy_template_id: e.target.value }))}
            />
          </Field>
          <Field
            label="Policy API key"
            hint="Leave blank when editing to keep the saved key."
          >
            <input
              className={monoClass}
              value={form.policy_api_key}
              onChange={(e) => setForm((prev) => ({ ...prev, policy_api_key: e.target.value }))}
              autoComplete="off"
              placeholder={form.has_policy_api_key ? '•••• saved — paste to replace' : ''}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Chat menus</h2>
            <p className="text-[11px] text-slate-500">
              Refexions chat uses this stored menu. Refresh from Kissflow when the WhatsApp bot
              config changes — the chat itself never waits on Kissflow.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Last refresh: {form.menus?.main?.refreshed_at
                ? new Date(form.menus.main.refreshed_at).toLocaleString()
                : 'not yet — using the stored / default menu'}
              {form.menus?.main?.source ? ` (${form.menus.main.source})` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshMenus}
              disabled={refreshingMenus || saving}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshingMenus ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh from Kissflow
            </button>
            <button
              type="button"
              onClick={() => saveAll(undefined, { menus: form.menus })}
              disabled={saving || refreshingMenus}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save menus
            </button>
          </div>
        </div>
        <Field label="Main greeting">
          <input
            className={inputClass}
            value={form.menus?.main?.message || ''}
            onChange={(e) => patchMenu('main', 'message', e.target.value)}
          />
        </Field>
        <Field label="Main options" hint="Comma-separated. Chat chips come from this list.">
          <input
            className={inputClass}
            value={optionsToText(form.menus?.main?.options)}
            onChange={(e) => patchMenu('main', 'options', e.target.value)}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Expense sub-menu">
            <input
              className={inputClass}
              value={optionsToText(form.menus?.expense?.options)}
              onChange={(e) => patchMenu('expense', 'options', e.target.value)}
            />
          </Field>
          <Field label="Travel sub-menu">
            <input
              className={inputClass}
              value={optionsToText(form.menus?.travel?.options)}
              onChange={(e) => patchMenu('travel', 'options', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Policies greeting"
          hint="Shown when someone taps Policies in chat."
        >
          <input
            className={inputClass}
            value={form.menus?.policies?.message || ''}
            onChange={(e) => patchMenu('policies', 'message', e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Policies menu</h2>
            <p className="text-[11px] text-slate-500">
              These rows appear when chat users tap Policies. Document ID must match the
              policy-sender template.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingPolicyId(null);
              setPolicyDraft({
                title: '',
                description: '',
                document_id: '',
                enabled: true,
                sort_order: ((form.policies || []).length + 1) * 10,
              });
              setPolicyEditorOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} />
            Add policy
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Document ID</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(form.policies || []).map((row) => (
                <tr key={row.document_id} className="border-b border-slate-50 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-800">{row.title}</div>
                    <div className="text-[11px] text-slate-400">{row.description || '—'}</div>
                  </td>
                  <td className="py-3 pr-3 font-mono text-[12px] text-slate-500">{row.document_id}</td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => {
                        const policies = (form.policies || []).map((item) => (
                          item.document_id === row.document_id
                            ? { ...item, enabled: item.enabled === false }
                            : item
                        ));
                        void saveAll(undefined, { policies });
                      }}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        row.enabled === false
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {row.enabled === false ? 'Off' : 'On'}
                    </button>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPolicyId(row.document_id);
                          setPolicyDraft({
                            title: row.title || '',
                            description: row.description || '',
                            document_id: row.document_id || '',
                            enabled: row.enabled !== false,
                            sort_order: row.sort_order || 10,
                          });
                          setPolicyEditorOpen(true);
                        }}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const policies = (form.policies || []).filter(
                            (item) => item.document_id !== row.document_id,
                          );
                          void saveAll(undefined, { policies });
                        }}
                        className="rounded-md border border-rose-100 p-1.5 text-rose-500 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!(form.policies || []).length ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No policies yet. Add one so chat can email it.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">FAQ dataset</h2>
            <p className="text-[11px] text-slate-500">
              Typed questions in Refexions chat match these keywords. Unmatched questions go
              back to the menu — the bot never invents an answer.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateFaq}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} />
            Add FAQ
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-3">Question</th>
                <th className="py-2 pr-3">Keywords</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(form.faqs || []).map((row) => (
                <tr key={row.id} className="border-b border-slate-50 align-top">
                  <td className="py-3 pr-3 font-medium text-slate-800">{row.question}</td>
                  <td className="py-3 pr-3 text-slate-500 text-[12px]">
                    {keywordsToText(row.keywords) || '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => toggleFaq(row)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        row.enabled === false
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {row.enabled === false ? 'Off' : 'On'}
                    </button>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditFaq(row)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFaq(row)}
                        className="rounded-md border border-rose-100 p-1.5 text-rose-500 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!(form.faqs || []).length ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No FAQ rows yet. Add one to start answering chat questions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {policyEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingPolicyId ? 'Edit policy' : 'Add policy'}
              </h3>
              <button type="button" onClick={() => setPolicyEditorOpen(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Title" required>
                <input
                  className={inputClass}
                  value={policyDraft.title}
                  onChange={(e) => setPolicyDraft((prev) => ({ ...prev, title: e.target.value }))}
                />
              </Field>
              <Field label="Document ID" required hint="Must match the policy-sender template id.">
                <input
                  className={monoClass}
                  value={policyDraft.document_id}
                  onChange={(e) => setPolicyDraft((prev) => ({ ...prev, document_id: e.target.value }))}
                  placeholder="it_policy"
                />
              </Field>
              <Field label="Description">
                <input
                  className={inputClass}
                  value={policyDraft.description}
                  onChange={(e) => setPolicyDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sort order">
                  <input
                    type="number"
                    className={inputClass}
                    value={policyDraft.sort_order}
                    onChange={(e) => setPolicyDraft((prev) => ({ ...prev, sort_order: e.target.value }))}
                  />
                </Field>
                <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={policyDraft.enabled !== false}
                    onChange={(e) => setPolicyDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPolicyEditorOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const title = policyDraft.title.trim();
                  const documentId = policyDraft.document_id.trim();
                  if (!title || !documentId) {
                    toast.error('Title and document ID are required.');
                    return;
                  }
                  const next = {
                    title,
                    description: policyDraft.description.trim(),
                    document_id: documentId,
                    enabled: policyDraft.enabled !== false,
                    sort_order: Number(policyDraft.sort_order) || 10,
                  };
                  const policies = [...(form.policies || [])];
                  const index = policies.findIndex((row) => row.document_id === editingPolicyId);
                  if (editingPolicyId && index >= 0) policies[index] = { ...policies[index], ...next };
                  else policies.push(next);
                  const ok = await saveAll(undefined, { policies });
                  if (ok) setPolicyEditorOpen(false);
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save policy
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingId ? 'Edit FAQ' : 'Add FAQ'}
              </h3>
              <button type="button" onClick={() => setEditorOpen(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Question" required>
                <input
                  className={inputClass}
                  value={faqDraft.question}
                  onChange={(e) => setFaqDraft((prev) => ({ ...prev, question: e.target.value }))}
                />
              </Field>
              <Field label="Keywords" hint="Comma-separated. Chat matches these without AI.">
                <input
                  className={inputClass}
                  value={faqDraft.keywords}
                  onChange={(e) => setFaqDraft((prev) => ({ ...prev, keywords: e.target.value }))}
                  placeholder="vpn, password, wifi"
                />
              </Field>
              <Field label="Answer" required>
                <textarea
                  rows={5}
                  className={`${inputClass} resize-y`}
                  value={faqDraft.answer}
                  onChange={(e) => setFaqDraft((prev) => ({ ...prev, answer: e.target.value }))}
                />
              </Field>
              <Field label="Optional link">
                <input
                  className={inputClass}
                  value={faqDraft.link}
                  onChange={(e) => setFaqDraft((prev) => ({ ...prev, link: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sort order">
                  <input
                    type="number"
                    className={inputClass}
                    value={faqDraft.sort_order}
                    onChange={(e) => setFaqDraft((prev) => ({ ...prev, sort_order: e.target.value }))}
                  />
                </Field>
                <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={faqDraft.enabled !== false}
                    onChange={(e) => setFaqDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveFaq}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save FAQ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RefexionsSetup;
