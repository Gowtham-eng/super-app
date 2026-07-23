import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Mail,
  MapPin,
  Mic,
  MicOff,
  Pencil,
  Search,
  User,
} from 'lucide-react';

const PROFILE_STORAGE_KEY = 'itsm_personal_details';
const ENTITY_FALLBACK = ['Refex', 'Extrovis', 'ModePro'];
const CRITICALITY_FALLBACK = ['Low', 'Medium', 'High', 'Critical'];

const normalizeKey = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');

const mapEntityFromUser = (user) => {
  const raw = (
    user?.company ||
    user?.legal_entity_code ||
    user?.organization?.name ||
    ''
  ).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('extrovis')) return 'Extrovis';
  if (lower.includes('modepro') || lower.includes('mode pro')) return 'ModePro';
  if (lower.includes('refex')) return 'Refex';
  const exact = ENTITY_FALLBACK.find((opt) => opt.toLowerCase() === lower);
  return exact || raw;
};

const profileFromUser = (user) => ({
  name: (user?.name || user?.full_name || '').trim(),
  email: (user?.email || '').trim(),
  entity: mapEntityFromUser(user),
  location: (user?.location || user?.office_location || '').trim(),
});

const mergeProfile = (user) => {
  const fromLogin = profileFromUser(user);
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
  } catch {
    stored = {};
  }
  // Prefer login values; only fill gaps from stored edits.
  return {
    name: fromLogin.name || stored.name || '',
    email: fromLogin.email || stored.email || '',
    entity: fromLogin.entity || stored.entity || '',
    location: fromLogin.location || stored.location || '',
  };
};

const CreateITRequest = () => {
  const { getAuthHeader, user } = useAuth();
  const itsmApi = `${process.env.REACT_APP_ITSM_API_URL || process.env.REACT_APP_BACKEND_URL}/api`;
  const navigate = useNavigate();

  const [initialized, setInitialized] = useState(false);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [initError, setInitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [records, setRecords] = useState([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState([]);
  const [criticalityOptions, setCriticalityOptions] = useState(CRITICALITY_FALLBACK);
  const [entityOptions, setEntityOptions] = useState(ENTITY_FALLBACK);

  const [profile, setProfile] = useState(() => mergeProfile(user));
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(profile);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [selectedMatrix, setSelectedMatrix] = useState(null);
  const [criticality, setCriticality] = useState('');
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);
  const descriptionBeforeListen = useRef('');
  const debounceRef = useRef(null);
  const [filteredOptions, setFilteredOptions] = useState([]);

  const matrixBySubCategory = useMemo(() => {
    const map = {};
    records.forEach((record) => {
      const key = normalizeKey(record.subCategory);
      if (key) map[key] = record;
    });
    return map;
  }, [records]);

  const profileComplete =
    profile.name.trim() &&
    profile.email.trim() &&
    profile.entity.trim() &&
    profile.location.trim();

  // Edit only when any personal field is missing from login/profile.
  const needsProfileEdit = !profileComplete;

  const canSubmit =
    !!selectedMatrix &&
    !!criticality &&
    description.trim().length > 0 &&
    profileComplete &&
    !submitting;

  const fetchMatrix = async () => {
    setLoadingMatrix(true);
    setInitError('');
    try {
      const res = await axios.get(`${itsmApi}/itsm/approval-matrix`, getAuthHeader());
      setRecords(res.data.records || []);
      setSubCategoryOptions(res.data.subCategories || []);
      setFilteredOptions(res.data.subCategories || []);
      setCriticalityOptions(res.data.criticalityOptions || CRITICALITY_FALLBACK);
      setEntityOptions(res.data.entityOptions || ENTITY_FALLBACK);
      setInitialized(true);
    } catch (err) {
      setInitError(getApiErrorMessage(err, 'Unable to load service catalog. Please retry.'));
    } finally {
      setLoadingMatrix(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfile((prev) => {
      const next = mergeProfile(user);
      // Keep user-filled gaps only where login still empty.
      return {
        name: next.name || prev.name,
        email: next.email || prev.email,
        entity: next.entity || prev.entity,
        location: next.location || prev.location,
      };
    });
  }, [user]);

  useEffect(() => () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const updateSearchQuery = (value) => {
    const trimmed = value.trim();
    const selected = selectedSubCategory.trim();
    const shouldClear =
      !trimmed ||
      (selected && normalizeKey(trimmed) !== normalizeKey(selected));

    setSearchQuery(value);
    if (shouldClear) {
      setSelectedSubCategory('');
      setSelectedMatrix(null);
      setCriticality('');
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = trimmed.toLowerCase();
      setFilteredOptions(
        !q
          ? subCategoryOptions
          : subCategoryOptions.filter((item) => item.toLowerCase().includes(q))
      );
    }, 300);
  };

  const selectSubCategory = (value) => {
    const matrix = matrixBySubCategory[normalizeKey(value)] || null;
    setSelectedSubCategory(value);
    setSearchQuery(value);
    setSelectedMatrix(matrix);
    setCriticality('');
    setFilteredOptions([]);
    if (matrix) {
      toast.success('Request details loaded.');
    } else {
      toast.error('No matching service configuration found.');
    }
  };

  const saveProfile = () => {
    const next = {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      entity: editForm.entity.trim(),
      location: editForm.location.trim(),
    };
    if (!next.name) return toast.error('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return toast.error('Enter a valid email');
    if (!next.entity) return toast.error('Entity is required');
    if (!next.location) return toast.error('Location is required');
    setProfile(next);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    setEditOpen(false);
    toast.success('Personal details updated.');
  };

  const toggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    descriptionBeforeListen.current = description.trim();
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const words = transcript.trim();
      if (!words) return;
      const base = descriptionBeforeListen.current;
      const separator = !base ? '' : (base.endsWith(' ') ? '' : ' ');
      setDescription(base ? `${base}${separator}${words}` : words);
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Unable to recognize speech. Please try again.');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    toast.message('Listening... speak now.');
  };

  const resetForm = () => {
    setSearchQuery('');
    setSelectedSubCategory('');
    setSelectedMatrix(null);
    setCriticality('');
    setDescription('');
    setFilteredOptions(subCategoryOptions);
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    if (!selectedSubCategory || !selectedMatrix) {
      return toast.error('Please select a service from Quick Search');
    }
    if (!criticality) return toast.error('Criticality is required');
    if (!description.trim()) return toast.error('Description is required');
    if (!profileComplete) return toast.error('Please complete your personal details first.');

    setSubmitting(true);
    try {
      await axios.post(
        `${itsmApi}/itsm/tickets`,
        {
          name: profile.name.trim(),
          email: profile.email.trim(),
          entity: profile.entity.trim(),
          location: profile.location.trim(),
          sub_category: selectedSubCategory,
          criticality,
          description: description.trim(),
        },
        getAuthHeader()
      );
      toast.success('Ticket submitted successfully');
      setSubmitted(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Unable to submit ticket. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const showSuggestions =
    !loadingMatrix &&
    filteredOptions.length > 0 &&
    searchQuery.trim() &&
    normalizeKey(searchQuery) !== normalizeKey(selectedSubCategory);

  if (submitted) {
    return (
      <div className="animate-fadeIn max-w-xl mx-auto" data-testid="itsm-success-page">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600 mb-4" size={64} strokeWidth={1.5} />
          <h1 className="font-heading text-2xl font-semibold text-slate-900 mb-2">
            Ticket Submitted Successfully
          </h1>
          <p className="text-sm text-slate-500 mb-8">
            Your IT request has been submitted successfully. The IT support team will review your request.
          </p>
          <button
            type="button"
            onClick={resetForm}
            className="w-full mb-3 px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors"
            data-testid="itsm-create-another"
          >
            Create Another Ticket
          </button>
          <button
            type="button"
            onClick={() => navigate('/launcher')}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            data-testid="itsm-done"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto pb-10" data-testid="itsm-create-page">
      <div className="mb-5 flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/launcher')}
          className="mt-1 p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          aria-label="Back to launcher"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900">
            Create IT Request
          </h1>
          <p className="text-sm text-slate-500 mt-1">How can IT help you today?</p>
        </div>
      </div>

      {initError && !initialized ? (
        <div className="bg-white border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-600 mb-4">{initError}</p>
          <button
            type="button"
            onClick={fetchMatrix}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Personal details */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-base font-semibold text-slate-900">Personal details</h2>
              {needsProfileEdit && (
                <button
                  type="button"
                  onClick={() => { setEditForm(profile); setEditOpen(true); }}
                  className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 font-medium"
                  data-testid="itsm-edit-profile"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
            {!profileComplete && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                Some personal details are missing from your login profile. Please fill them to submit.
              </p>
            )}
            <div className="space-y-3">
              <DetailRow icon={User} label="Name" value={profile.name} />
              <DetailRow icon={Mail} label="Email" value={profile.email} />
              <DetailRow icon={Building2} label="Entity" value={profile.entity} />
              <DetailRow icon={MapPin} label="Location" value={profile.location} />
            </div>
          </section>

          {/* Quick Search */}
          <section>
            <label className="block text-sm font-medium text-slate-700 mb-2">Quick Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600" size={18} />
              <input
                type="text"
                value={searchQuery}
                disabled={loadingMatrix}
                onChange={(e) => updateSearchQuery(e.target.value)}
                placeholder="Search for an issue or service"
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 disabled:opacity-60"
                data-testid="itsm-quick-search"
              />
              {loadingMatrix && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-teal-600" size={18} />
              )}
            </div>
            {showSuggestions && (
              <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                {filteredOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectSubCategory(item)}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-teal-50 border-b border-slate-100 last:border-0"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Request Details */}
          {selectedMatrix && (
            <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="text-teal-600" size={18} />
                <h2 className="font-heading text-base font-semibold text-slate-900">Request Details</h2>
              </div>
              <InfoBlock label="Details & Scope" value={selectedMatrix.detailsScope} />
              <InfoBlock label="Ticket Type" value={selectedMatrix.ticketType} />
              <InfoBlock label="Category" value={selectedMatrix.category} />
              <InfoBlock label="Sub Category" value={selectedMatrix.subCategory} />
            </section>
          )}

          {/* Criticality */}
          <section>
            <label className="block text-sm font-medium text-slate-700 mb-2">Criticality</label>
            <select
              value={criticality}
              onChange={(e) => setCriticality(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              data-testid="itsm-criticality"
            >
              <option value="">Select criticality</option>
              {criticalityOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </section>

          {/* Description */}
          <section>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe your issue or request"
                className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-y"
                data-testid="itsm-description"
              />
              <button
                type="button"
                onClick={toggleMic}
                className={`absolute right-3 top-3 p-2 rounded-lg border transition-colors ${
                  isListening
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-teal-50 border-teal-100 text-teal-700 hover:bg-teal-100'
                }`}
                aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </section>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={`w-full px-4 py-3.5 rounded-xl font-medium text-white transition-colors flex items-center justify-center gap-2 ${
              canSubmit ? 'bg-teal-600 hover:bg-teal-700' : 'bg-slate-300 cursor-not-allowed'
            }`}
            data-testid="itsm-submit"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {submitting ? 'Submitting Request...' : 'Submit Request'}
          </button>
        </div>
      )}

      {/* Edit personal details modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4">Edit personal details</h3>
            <div className="space-y-3">
              <Field label="Name">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </Field>
              <Field label="Entity">
                <select
                  value={entityOptions.includes(editForm.entity) ? editForm.entity : (editForm.entity ? '__custom__' : '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') return;
                    setEditForm({ ...editForm, entity: v });
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-2"
                >
                  <option value="">Select entity</option>
                  {entityOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {editForm.entity && !entityOptions.includes(editForm.entity) && (
                    <option value="__custom__">{editForm.entity}</option>
                  )}
                </select>
                <input
                  value={editForm.entity}
                  onChange={(e) => setEditForm({ ...editForm, entity: e.target.value })}
                  placeholder="Or type entity"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </Field>
              <Field label="Location">
                <input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                className="flex-1 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium"
              >
                Save details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    <Icon size={16} className="text-teal-600 mt-0.5 shrink-0" />
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{value || '—'}</div>
    </div>
  </div>
);

const InfoBlock = ({ label, value }) => (
  <div className="mb-3 last:mb-0">
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className="text-sm font-semibold text-slate-800 whitespace-pre-wrap">{value || '—'}</div>
  </div>
);

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
    {children}
  </label>
);

export default CreateITRequest;
