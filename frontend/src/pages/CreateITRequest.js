import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Headphones,
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

const normalizeKey = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');

const matchesEntity = (record, entity) => {
  const userEntity = normalizeKey(entity);
  if (!userEntity) return false;
  const recordEntity = normalizeKey(record?.entity);
  if (!recordEntity) return true;
  return recordEntity === userEntity;
};

const getSubTypesForEntity = (records, entity) => {
  if (!normalizeKey(entity)) return [];
  const seen = new Set();
  const result = [];
  for (const record of records) {
    if (!matchesEntity(record, entity)) continue;
    const subType = record.subType?.trim();
    if (!subType) continue;
    const key = normalizeKey(subType);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(subType);
  }
  return result.sort((a, b) => a.localeCompare(b));
};

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
  return {
    name: fromLogin.name || stored.name || '',
    email: fromLogin.email || stored.email || '',
    entity: fromLogin.entity || stored.entity || '',
    location: fromLogin.location || stored.location || '',
  };
};

const criticalityBadgeClass = (value = '') => {
  const v = value.toLowerCase();
  if (v === 'critical') return 'bg-red-100 text-red-800 border-red-200';
  if (v === 'high') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (v === 'medium') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (v === 'low') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
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
  const [entityOptions, setEntityOptions] = useState(ENTITY_FALLBACK);

  const [profile, setProfile] = useState(() => mergeProfile(user));
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(profile);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSubType, setSelectedSubType] = useState('');
  const [selectedMatrix, setSelectedMatrix] = useState(null);
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSearchPending, setIsSearchPending] = useState(false);

  const recognitionRef = useRef(null);
  const descriptionBeforeListen = useRef('');
  const debounceRef = useRef(null);

  const subTypeOptions = useMemo(
    () => getSubTypesForEntity(records, profile.entity),
    [records, profile.entity]
  );

  const findMatrixForSubType = (subType, entity = profile.entity) => {
    const key = normalizeKey(subType);
    const matches = records.filter((record) => normalizeKey(record.subType) === key);
    if (!matches.length) return null;
    if (entity) {
      const entityMatch = matches.find((record) => matchesEntity(record, entity));
      if (entityMatch) return entityMatch;
    }
    return matches[0];
  };

  const criticality = selectedMatrix?.criticality?.trim() || '';

  const profileComplete =
    profile.name.trim() &&
    profile.email.trim() &&
    profile.entity.trim() &&
    profile.location.trim();

  const needsProfileEdit = !profileComplete;

  const canSubmit =
    !!selectedMatrix &&
    !!criticality &&
    description.trim().length > 0 &&
    profileComplete &&
    !submitting;

  const filteredOptions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return subTypeOptions;
    return subTypeOptions.filter((item) => item.toLowerCase().includes(q));
  }, [debouncedQuery, subTypeOptions]);

  const fetchMatrix = async () => {
    setLoadingMatrix(true);
    setInitError('');
    try {
      const res = await axios.get(`${itsmApi}/itsm/approval-matrix`, getAuthHeader());
      setRecords(res.data.records || []);
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
      return {
        name: next.name || prev.name,
        email: next.email || prev.email,
        entity: next.entity || prev.entity,
        location: next.location || prev.location,
      };
    });
  }, [user]);

  useEffect(() => {
    if (!selectedSubType) return;
    const matrix = findMatrixForSubType(selectedSubType);
    if (!matrix) {
      setSelectedSubType('');
      setSelectedMatrix(null);
      setSearchQuery('');
    } else if (matrix.id !== selectedMatrix?.id) {
      setSelectedMatrix(matrix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.entity, records]);

  useEffect(() => () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const updateSearchQuery = (value) => {
    const trimmed = value.trim();
    const selected = selectedSubType.trim();
    const shouldClear =
      !trimmed ||
      (selected && normalizeKey(trimmed) !== normalizeKey(selected));

    setSearchQuery(value);
    if (shouldClear) {
      setSelectedSubType('');
      setSelectedMatrix(null);
    }

    setIsSearchPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setIsSearchPending(false);
    }, 300);
  };

  const selectSubType = (value) => {
    const matrix = findMatrixForSubType(value);
    setSelectedSubType(value);
    setSearchQuery(value);
    setDebouncedQuery(value.trim());
    setSelectedMatrix(matrix);
    setIsSearchPending(false);
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
    setDebouncedQuery('');
    setSelectedSubType('');
    setSelectedMatrix(null);
    setDescription('');
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    if (!selectedSubType || !selectedMatrix) {
      return toast.error('Please select a service from Quick Search');
    }
    if (!criticality) return toast.error('Criticality is missing for the selected service.');
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
          sub_type: selectedMatrix.subType || selectedSubType,
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
    profileComplete &&
    !loadingMatrix &&
    filteredOptions.length > 0 &&
    searchQuery.trim() &&
    normalizeKey(searchQuery) !== normalizeKey(selectedSubType);

  if (submitted) {
    return (
      <div className="animate-fadeIn w-full max-w-lg mx-auto px-1" data-testid="itsm-success-page">
        <div className="card-default overflow-hidden shadow-md">
          <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 px-6 py-8 text-center border-b border-emerald-100/80">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center mb-4">
              <CheckCircle2 className="text-emerald-600" size={36} strokeWidth={1.75} />
            </div>
            <h1 className="font-heading text-2xl font-bold text-slate-900 tracking-tight">
              Ticket Submitted
            </h1>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              Your IT request has been submitted. The support team will review it shortly.
            </p>
          </div>
          <div className="p-5 space-y-3">
            <button type="button" onClick={resetForm} className="btn-primary w-full" data-testid="itsm-create-another">
              Create Another Ticket
            </button>
            <button type="button" onClick={() => navigate('/launcher')} className="btn-secondary w-full" data-testid="itsm-done">
              Back to App Center
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn w-full max-w-3xl mx-auto pb-8" data-testid="itsm-create-page">
      {/* Hero — matches App Center */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 mb-5">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />
        <div className="relative px-5 py-5 sm:px-7 sm:py-6 flex items-start gap-4">
          <button
            type="button"
            onClick={() => navigate('/launcher')}
            className="mt-1 p-2 rounded-xl border border-emerald-200/80 bg-white/80 text-slate-600 hover:bg-white hover:border-emerald-300 transition-colors shrink-0"
            aria-label="Back to launcher"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm shrink-0">
              <Headphones size={22} className="text-emerald-600" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Create IT Request
              </h1>
              <p className="text-slate-500 text-sm mt-0.5 font-medium">IT Service Management</p>
            </div>
          </div>
        </div>
      </div>

      {initError && !initialized ? (
        <div className="card-default p-6 text-center border-red-200">
          <p className="text-sm text-red-600 mb-4">{initError}</p>
          <button type="button" onClick={fetchMatrix} className="btn-primary">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Personal details */}
          <section className="form-section !mb-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="form-section-title !mb-0">Personal details</h2>
              {needsProfileEdit && (
                <button
                  type="button"
                  onClick={() => { setEditForm(profile); setEditOpen(true); }}
                  className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 font-medium"
                  data-testid="itsm-edit-profile"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
            {!profileComplete && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                Complete your personal details to search services and submit a ticket.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProfileChip icon={User} label="Name" value={profile.name} />
              <ProfileChip icon={Mail} label="Email" value={profile.email} />
              <ProfileChip icon={Building2} label="Entity" value={profile.entity} highlight />
              <ProfileChip icon={MapPin} label="Location" value={profile.location} />
            </div>
          </section>

          {/* Quick Search — Sub Type */}
          <section className="form-section !mb-0">
            <h2 className="form-section-title">Quick Search</h2>
            <p className="text-xs text-slate-500 mb-3">
              {profile.entity
                ? <>Find a service by <span className="font-medium text-slate-700">sub type</span> for <span className="font-semibold text-emerald-700">{profile.entity}</span></>
                : 'Set your entity in personal details to search services.'}
            </p>
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none shrink-0"
                size={18}
                aria-hidden
              />
              <input
                type="text"
                value={searchQuery}
                disabled={loadingMatrix || !profileComplete}
                onChange={(e) => updateSearchQuery(e.target.value)}
                placeholder={profile.entity ? `Search ${profile.entity} services…` : 'Complete personal details first'}
                className="input-brutalist w-full !pl-12 !pr-12 py-3"
                data-testid="itsm-quick-search"
              />
              {(loadingMatrix || isSearchPending) && (
                <Loader2
                  className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-600 pointer-events-none"
                  size={18}
                  aria-hidden
                />
              )}
            </div>
            {profileComplete && !loadingMatrix && subTypeOptions.length === 0 && (
              <p className="text-xs text-slate-500 mt-2">No services found for {profile.entity}.</p>
            )}
            {showSuggestions && (
              <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white shadow-md">
                {filteredOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectSubType(item)}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-emerald-50 border-b border-slate-100 last:border-0 transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Request Details */}
          {selectedMatrix && (
            <section className="form-section !mb-0">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="text-emerald-600" size={18} />
                  <h2 className="form-section-title !mb-0">Request Details</h2>
                </div>
                {criticality && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${criticalityBadgeClass(criticality)}`}>
                    {criticality}
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Details & Scope</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedMatrix.detailsScope || '—'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <InfoBlock label="Ticket Type" value={selectedMatrix.ticketType} />
                <InfoBlock label="Category" value={selectedMatrix.category} />
                <InfoBlock label="Sub Category" value={selectedMatrix.subCategory} />
                <InfoBlock label="Type" value={selectedMatrix.type} />
                <InfoBlock label="Sub Type" value={selectedMatrix.subType} highlight />
                <InfoBlock label="Criticality" value={selectedMatrix.criticality} />
              </div>
            </section>
          )}

          {/* Description */}
          <section className="form-section !mb-0">
            <h2 className="form-section-title">Description</h2>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe your issue or request in detail"
                className="input-brutalist w-full px-4 py-3 pr-12 resize-y"
                data-testid="itsm-description"
              />
              <button
                type="button"
                onClick={toggleMic}
                className={`absolute right-3 top-3 p-2 rounded-lg border transition-colors ${
                  isListening
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
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
            className={`btn-primary w-full py-3.5 ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="itsm-submit"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {submitting ? 'Submitting Request…' : 'Submit Request'}
          </button>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-md card-default rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4">Edit personal details</h3>
            <div className="space-y-3">
              <Field label="Name">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input-brutalist w-full"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="input-brutalist w-full"
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
                  className="input-brutalist w-full mb-2"
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
                  className="input-brutalist w-full"
                />
              </Field>
              <Field label="Location">
                <input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="input-brutalist w-full"
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="button" onClick={saveProfile} className="btn-primary flex-1">
                Save details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProfileChip = ({ icon: Icon, label, value, highlight = false }) => (
  <div className={`flex items-start gap-3 rounded-xl border p-3 ${highlight ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${highlight ? 'bg-emerald-100' : 'bg-white border border-slate-200'}`}>
      <Icon size={15} className={highlight ? 'text-emerald-600' : 'text-slate-500'} />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-slate-800 truncate">{value || '—'}</div>
    </div>
  </div>
);

const InfoBlock = ({ label, value, highlight = false }) => (
  <div>
    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</div>
    <div className={`text-sm whitespace-pre-wrap ${highlight ? 'font-semibold text-emerald-800' : 'font-medium text-slate-800'}`}>
      {value || '—'}
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
    {children}
  </label>
);

export default CreateITRequest;
