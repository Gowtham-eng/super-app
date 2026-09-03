import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ITSM_API } from '../config/api';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import {
  ITSM_ENTITIES,
  PROFILE_STORAGE_KEY,
  mergeEntityOptions,
  mergeItsmProfile,
} from '../utils/itsmEntity';
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
  Search,
  User,
  XCircle,
} from 'lucide-react';

const MANUAL_CRITICALITY = ['Low', 'Medium', 'High'];

/** Create form catalog: Incident + Service Request only (no Change Request). */
const ALLOWED_TICKET_TYPES = ['incident', 'service request'];

/** Common office / site locations — dropdown + free-text custom. */
const LOCATION_OPTIONS = [
  'Refex Group',
  'Refex Tower-Nungambakkam',
  'Bazullah -T.Nagar',
  'Thoraipakkam',
  'Chennai',
  'Bengaluru - BO',
  'Bengaluru',
  'Jayant Site',
  'ADMS-Mohali E-70',
  'ADMS-Mohali-D 207',
  'Singrauli',
  'Kolhapur',
  'Delhi',
  'New Delhi',
  'Hub-Charging Station',
  'Hub-Refex Green Mobility',
  'Koppal Project Site',
  'Goregaon',
  'Mumbai',
  'Pune',
  'Airport-Pune',
  'Hyderabad',
  'Begumpet',
  'Vijayawada',
  'Visakhapatnam',
  'Vyzag-CBG',
  'Patna',
  'Silvassa',
  'Lucknow',
  'Ahmedabad',
  'Chhattisgarh-Bhilai Plant',
  'Chhattisgarh-KSK Site',
  'NTPC Ramagundam',
  'SCCL Ramagundam',
  'North Karanpura',
  'Dhanbad',
];

const normalizeKey = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');

const isRefexEntity = (entity = '') => normalizeKey(entity) === 'refex';

const isAllowedTicketType = (ticketType = '') =>
  ALLOWED_TICKET_TYPES.includes(normalizeKey(ticketType));

/** Extrovis rows often use Category/SubCategory with empty Sub_Type; Refex uses Sub_Type. */
const recordServiceLabel = (record) => {
  const subType = (record?.subType || '').trim();
  if (subType) return subType;
  const category = (record?.category || '').trim();
  const subCategory = (record?.subCategory || '').trim();
  if (category && subCategory) return `${category} / ${subCategory}`;
  return category || subCategory || (record?.type || '').trim() || '';
};

/** Strict Entity match — catalog always uses Refex rows (never Extrovis). */
const matchesRefexEntity = (record) => normalizeKey(record?.entity) === 'refex';

const uniqueSorted = (values) =>
  [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

const getCatalogSubTypes = (records) => {
  const seen = new Set();
  const result = [];
  for (const record of records) {
    const label = recordServiceLabel(record);
    if (!label) continue;
    const key = normalizeKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result.sort((a, b) => a.localeCompare(b));
};

const criticalityBadgeClass = (value = '') => {
  const v = value.toLowerCase();
  if (v === 'critical') return 'bg-red-100 text-red-800 border-red-200';
  if (v === 'high') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (v === 'medium') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (v === 'low') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const persistProfile = (next) => {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
};

const CreateITRequest = () => {
  const { getAuthHeader, user } = useAuth();
  const itsmApi = ITSM_API;
  const navigate = useNavigate();

  const [initialized, setInitialized] = useState(false);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [initError, setInitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('created');

  const [records, setRecords] = useState([]);
  const [entityOptions, setEntityOptions] = useState(ITSM_ENTITIES);

  const [profile, setProfile] = useState(() => mergeItsmProfile(user));

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSubType, setSelectedSubType] = useState('');
  const [selectedMatrix, setSelectedMatrix] = useState(null);
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSearchPending, setIsSearchPending] = useState(false);

  /** Non-Refex only: No = quick search; Yes = cascade from matrix. */
  const [manualEdit, setManualEdit] = useState(false);
  const [cascade, setCascade] = useState({
    ticketType: '',
    category: '',
    subCategory: '',
    subType: '',
    type: '',
  });
  const [manualCriticality, setManualCriticality] = useState('Medium');

  const recognitionRef = useRef(null);
  const descriptionBeforeListen = useRef('');
  const debounceRef = useRef(null);
  const matrixAbortRef = useRef(null);
  const micStopRequestedRef = useRef(false);

  const isRefex = isRefexEntity(profile.entity);
  const useManualCascade = !isRefex && manualEdit;

  /** Quick Search + non-Refex cascade: Refex entity rows, Incident / Service Request only. */
  const entityRecords = useMemo(
    () =>
      records.filter(
        (record) => matchesRefexEntity(record) && isAllowedTicketType(record.ticketType)
      ),
    [records]
  );

  const subTypeOptions = useMemo(
    () => getCatalogSubTypes(entityRecords),
    [entityRecords]
  );

  const ticketTypeOptions = useMemo(
    () => uniqueSorted(entityRecords.map((r) => r.ticketType)),
    [entityRecords]
  );

  const categoryOptions = useMemo(() => {
    const rows = cascade.ticketType
      ? entityRecords.filter((r) => normalizeKey(r.ticketType) === normalizeKey(cascade.ticketType))
      : entityRecords;
    return uniqueSorted(rows.map((r) => r.category));
  }, [entityRecords, cascade.ticketType]);

  const subCategoryOptions = useMemo(() => {
    let rows = entityRecords;
    if (cascade.ticketType) {
      rows = rows.filter((r) => normalizeKey(r.ticketType) === normalizeKey(cascade.ticketType));
    }
    if (cascade.category) {
      rows = rows.filter((r) => normalizeKey(r.category) === normalizeKey(cascade.category));
    }
    return uniqueSorted(rows.map((r) => r.subCategory));
  }, [entityRecords, cascade.ticketType, cascade.category]);

  const subTypeCascadeOptions = useMemo(() => {
    let rows = entityRecords;
    if (cascade.ticketType) {
      rows = rows.filter((r) => normalizeKey(r.ticketType) === normalizeKey(cascade.ticketType));
    }
    if (cascade.category) {
      rows = rows.filter((r) => normalizeKey(r.category) === normalizeKey(cascade.category));
    }
    if (cascade.subCategory) {
      rows = rows.filter((r) => normalizeKey(r.subCategory) === normalizeKey(cascade.subCategory));
    }
    return uniqueSorted(rows.map((r) => recordServiceLabel(r)));
  }, [entityRecords, cascade.ticketType, cascade.category, cascade.subCategory]);

  const typeOptions = useMemo(() => {
    let rows = entityRecords;
    if (cascade.ticketType) {
      rows = rows.filter((r) => normalizeKey(r.ticketType) === normalizeKey(cascade.ticketType));
    }
    if (cascade.category) {
      rows = rows.filter((r) => normalizeKey(r.category) === normalizeKey(cascade.category));
    }
    if (cascade.subCategory) {
      rows = rows.filter((r) => normalizeKey(r.subCategory) === normalizeKey(cascade.subCategory));
    }
    if (cascade.subType) {
      rows = rows.filter((r) => normalizeKey(recordServiceLabel(r)) === normalizeKey(cascade.subType));
    }
    return uniqueSorted(rows.map((r) => r.type));
  }, [entityRecords, cascade.ticketType, cascade.category, cascade.subCategory, cascade.subType]);

  const findMatrixForSubType = (subType) => {
    const key = normalizeKey(subType);
    const matches = entityRecords.filter(
      (record) => normalizeKey(recordServiceLabel(record)) === key
    );
    return matches[0] || null;
  };

  const findMatrixFromCascade = (nextCascade) => {
    let rows = entityRecords;
    if (nextCascade.ticketType) {
      rows = rows.filter((r) => normalizeKey(r.ticketType) === normalizeKey(nextCascade.ticketType));
    }
    if (nextCascade.category) {
      rows = rows.filter((r) => normalizeKey(r.category) === normalizeKey(nextCascade.category));
    }
    if (nextCascade.subCategory) {
      rows = rows.filter((r) => normalizeKey(r.subCategory) === normalizeKey(nextCascade.subCategory));
    }
    if (nextCascade.subType) {
      rows = rows.filter((r) => normalizeKey(recordServiceLabel(r)) === normalizeKey(nextCascade.subType));
    }
    if (nextCascade.type) {
      rows = rows.filter((r) => normalizeKey(r.type) === normalizeKey(nextCascade.type));
    }
    return rows[0] || null;
  };

  const criticality = useManualCascade
    ? manualCriticality
    : selectedMatrix?.criticality?.trim() || (selectedMatrix ? 'Medium' : '');

  const profileComplete =
    profile.name.trim() &&
    profile.email.trim() &&
    profile.entity.trim() &&
    profile.location.trim();

  const canSubmit =
    !!selectedMatrix &&
    !!criticality &&
    description.trim().length > 0 &&
    profileComplete &&
    !submitting;

  const filteredOptions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return subTypeOptions;

    const matchedLabels = [];
    const seen = new Set();
    for (const record of entityRecords) {
      const label = recordServiceLabel(record);
      if (!label) continue;
      const haystack = [
        label,
        record.category,
        record.subCategory,
        record.subType,
        record.type,
        record.ticketType,
        record.detailsScope,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) continue;
      const key = normalizeKey(label);
      if (seen.has(key)) continue;
      seen.add(key);
      matchedLabels.push(label);
    }
    if (matchedLabels.length > 0) {
      return matchedLabels.sort((a, b) => a.localeCompare(b));
    }

    const othersFromOptions = subTypeOptions.find((item) => /^others?$/i.test(String(item).trim()));
    if (othersFromOptions) return [othersFromOptions];

    for (const record of entityRecords) {
      const label = recordServiceLabel(record);
      if (label && /^others?$/i.test(label)) return [label];
    }
    return [];
  }, [debouncedQuery, subTypeOptions, entityRecords]);

  const showingOthersFallback =
    !!debouncedQuery.trim() &&
    filteredOptions.length === 1 &&
    /^others?$/i.test(String(filteredOptions[0]).trim()) &&
    !String(filteredOptions[0]).toLowerCase().includes(debouncedQuery.trim().toLowerCase());

  const fetchMatrix = async (entity) => {
    if (matrixAbortRef.current) {
      try { matrixAbortRef.current.abort(); } catch { /* ignore */ }
    }
    const controller = new AbortController();
    matrixAbortRef.current = controller;

    setLoadingMatrix(true);
    setInitError('');
    try {
      const params = entity?.trim() ? { entity: entity.trim() } : undefined;
      const res = await axios.get(`${itsmApi}/itsm/approval-matrix`, {
        ...getAuthHeader(),
        params,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRecords(res.data.records || []);
      setEntityOptions(mergeEntityOptions(res.data.entityOptions));
      setInitialized(true);
    } catch (err) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      setInitError(getApiErrorMessage(err, 'Unable to load service catalog. Please retry.'));
    } finally {
      if (matrixAbortRef.current === controller) {
        setLoadingMatrix(false);
      }
    }
  };

  const updateProfileField = (field, value) => {
    setProfile((prev) => {
      const next = { ...prev, [field]: value };
      persistProfile(next);
      return next;
    });
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await axios.get(`${itsmApi}/itsm/config`, getAuthHeader());
        if (Array.isArray(res.data.entityOptions) && res.data.entityOptions.length) {
          setEntityOptions(mergeEntityOptions(res.data.entityOptions));
        }
      } catch {
        /* matrix fetch still loads options */
      }
    };
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfile((prev) => {
      const next = mergeItsmProfile(user);
      return {
        name: next.name || prev.name,
        email: next.email || prev.email,
        entity: next.entity || prev.entity,
        location: next.location || prev.location,
      };
    });
  }, [user]);

  useEffect(() => {
    if (!profile.entity.trim()) return;
    fetchMatrix(profile.entity.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.entity]);

  useEffect(() => {
    if (isRefex) setManualEdit(false);
  }, [isRefex]);

  useEffect(() => {
    if (!selectedSubType || useManualCascade) return;
    const matrix = findMatrixForSubType(selectedSubType);
    if (!matrix) {
      setSelectedSubType('');
      setSelectedMatrix(null);
      setSearchQuery('');
    } else if (matrix.id !== selectedMatrix?.id) {
      setSelectedMatrix(matrix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityRecords]);

  useEffect(() => () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (matrixAbortRef.current) {
      try { matrixAbortRef.current.abort(); } catch { /* ignore */ }
    }
  }, []);

  const updateSearchQuery = (value) => {
    const trimmed = value.trim();
    setSearchQuery(value);
    setIsSearchPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setIsSearchPending(false);
    }, 250);
    if (selectedSubType && normalizeKey(value) !== normalizeKey(selectedSubType)) {
      setSelectedSubType('');
      setSelectedMatrix(null);
    }
  };

  const selectSubType = (value) => {
    const matrix = findMatrixForSubType(value);
    setSelectedSubType(value);
    setSearchQuery(value);
    setDebouncedQuery(value);
    setSelectedMatrix(matrix);
    setIsSearchPending(false);
    if (matrix) {
      toast.success('Service selected');
    } else {
      toast.error('Service not found in catalog');
    }
  };

  const updateCascade = (field, value) => {
    setCascade((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'ticketType') {
        next.category = '';
        next.subCategory = '';
        next.subType = '';
        next.type = '';
      } else if (field === 'category') {
        next.subCategory = '';
        next.subType = '';
        next.type = '';
      } else if (field === 'subCategory') {
        next.subType = '';
        next.type = '';
      } else if (field === 'subType') {
        next.type = '';
      }
      const matrix = findMatrixFromCascade(next);
      setSelectedMatrix(matrix);
      setSelectedSubType(matrix ? recordServiceLabel(matrix) : '');
      if (matrix?.criticality?.trim() && MANUAL_CRITICALITY.includes(matrix.criticality.trim())) {
        setManualCriticality(matrix.criticality.trim());
      }
      return next;
    });
  };

  const toggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input is not supported in this browser. Please type the description.');
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      toast.error('Voice input needs a secure (HTTPS) connection.');
      return;
    }

    if (isListening && recognitionRef.current) {
      micStopRequestedRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      setIsListening(false);
      return;
    }

    const isMobile =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
      (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));

    descriptionBeforeListen.current = description;
    micStopRequestedRef.current = false;

    const recognition = new SpeechRecognition();
    // Mobile Chrome often fails or immediately errors with continuous / interim mode.
    recognition.continuous = !isMobile;
    recognition.interimResults = !isMobile;
    recognition.maxAlternatives = 1;
    // en-IN is missing on some mobile engines; prefer device language then en-US.
    const preferredLang = (navigator.language || '').trim();
    recognition.lang =
      preferredLang && /^en([-_]|$)/i.test(preferredLang) ? preferredLang : 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      const spoken = transcript.trim();
      if (!spoken) return;
      const base = descriptionBeforeListen.current;
      setDescription(base ? `${base} ${spoken}`.trim() : spoken);
    };

    recognition.onerror = (event) => {
      const code = event?.error || '';
      setIsListening(false);
      recognitionRef.current = null;

      // User stopped, or session ended without speech — not a hard failure.
      if (micStopRequestedRef.current || code === 'aborted' || code === 'no-speech') {
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        toast.error('Microphone permission blocked. Allow mic access and try again.');
        return;
      }
      if (code === 'network') {
        toast.error('Voice service is offline. Check your connection and try again.');
        return;
      }
      if (code === 'audio-capture') {
        toast.error('No microphone found. Check device settings and try again.');
        return;
      }
      toast.error('Unable to recognize speech. Please try again.');
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      toast.message(isMobile ? 'Listening… tap the mic again when done.' : 'Listening... speak now.');
    } catch (err) {
      setIsListening(false);
      recognitionRef.current = null;
      const msg = String(err?.message || err || '');
      if (/already started/i.test(msg)) {
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
        toast.message('Mic was still active — tap again to speak.');
        return;
      }
      toast.error('Unable to start voice input. Please try again.');
    }
  };

  const resetForm = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedSubType('');
    setSelectedMatrix(null);
    setDescription('');
    setSubmitted(false);
    setSubmitStatus('created');
    setManualEdit(false);
    setCascade({ ticketType: '', category: '', subCategory: '', subType: '', type: '' });
    setManualCriticality('Medium');
  };

  const handleSubmit = async () => {
    if (!selectedMatrix) {
      return toast.error(
        useManualCascade
          ? 'Please complete ticket type, category, and related fields'
          : 'Please select a service from Quick Search'
      );
    }
    if (!criticality) return toast.error('Criticality is required.');
    if (!description.trim()) return toast.error('Description is required');
    if (!profileComplete) return toast.error('Please complete your personal details first.');

    setSubmitting(true);
    try {
      const res = await axios.post(
        `${itsmApi}/itsm/tickets`,
        {
          name: profile.name.trim(),
          email: profile.email.trim(),
          entity: profile.entity.trim(),
          location: profile.location.trim(),
          sub_type: recordServiceLabel(selectedMatrix) || selectedSubType || cascade.subType,
          criticality,
          description: description.trim(),
        },
        getAuthHeader()
      );
      const status = res.data.status || (res.data.success ? 'created' : 'failed');
      if (status === 'failed') {
        setSubmitStatus('failed');
        setSubmitted(true);
        toast.error(res.data.message || 'Ticket was not created in Kissflow.');
        return;
      }
      navigate('/itsm', { replace: true });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Unable to submit ticket. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const showSuggestions =
    profileComplete &&
    !useManualCascade &&
    !loadingMatrix &&
    debouncedQuery.trim().length > 0 &&
    filteredOptions.length > 0 &&
    normalizeKey(searchQuery) !== normalizeKey(selectedSubType);

  if (submitted) {
    const failed = submitStatus === 'failed';
    return (
      <div className="animate-fadeIn w-full max-w-lg mx-auto pb-8" data-testid="itsm-create-result">
        <div className="card-default overflow-hidden">
          <div className={`px-6 py-8 text-center ${failed ? 'bg-red-50' : 'bg-emerald-50'}`}>
            {failed ? (
              <XCircle className="mx-auto text-red-600 mb-3" size={40} />
            ) : (
              <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={40} />
            )}
            <h1 className="font-heading text-xl font-bold text-slate-900">
              {failed ? 'Request not created' : 'Request submitted'}
            </h1>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              {failed
                ? 'Kissflow did not create this request. It is saved on your dashboard as Failed.'
                : 'Your IT request was created in Kissflow. The support team will review it shortly.'}
            </p>
          </div>
          <div className="p-5 space-y-3">
            <button type="button" onClick={resetForm} className="btn-primary w-full" data-testid="itsm-create-another">
              Create Another Ticket
            </button>
            <button type="button" onClick={() => navigate('/itsm')} className="btn-secondary w-full" data-testid="itsm-done">
              Back to My Tickets
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn w-full pb-8" data-testid="itsm-create-page">
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 mb-5">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />
        <div className="relative px-5 py-5 sm:px-7 sm:py-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/itsm')}
            className="p-2 rounded-xl border border-emerald-200/80 bg-white/80 text-slate-600 hover:bg-white hover:border-emerald-300 transition-colors shrink-0"
            aria-label="Back to my tickets"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm shrink-0">
              <Headphones size={22} className="text-emerald-600" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
                Create IT Request
              </h1>
              <p className="text-slate-500 text-sm mt-0.5 font-medium">IT Help Desk</p>
            </div>
          </div>
          {profile.entity && (
            <div className="hidden md:flex flex-col items-end shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Entity</span>
              <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-200/70 text-emerald-800 text-sm font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {profile.entity}
              </span>
            </div>
          )}
        </div>
      </div>

      {initError && !initialized ? (
        <div className="card-default p-6 text-center border-red-200">
          <p className="text-sm text-red-600 mb-4">{initError}</p>
          <button type="button" onClick={() => fetchMatrix(profile.entity || 'Refex')} className="btn-primary">
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <section className="form-section !mb-0 lg:col-span-12">
            <h2 className="form-section-title">Personal details</h2>
            {!profileComplete && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                Fill the empty fields below (they are editable). Fields that already have a value stay locked.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {profile.name.trim() ? (
                <ProfileChip icon={User} label="Name" value={profile.name} />
              ) : (
                <InlineField icon={User} label="Name" required>
                  <input
                    value={profile.name}
                    onChange={(e) => updateProfileField('name', e.target.value)}
                    placeholder="Enter your name"
                    className="input-brutalist w-full"
                    data-testid="itsm-inline-name"
                  />
                </InlineField>
              )}
              {profile.email.trim() ? (
                <ProfileChip icon={Mail} label="Email" value={profile.email} />
              ) : (
                <InlineField icon={Mail} label="Email" required>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => updateProfileField('email', e.target.value)}
                    placeholder="Enter your email"
                    className="input-brutalist w-full"
                    data-testid="itsm-inline-email"
                  />
                </InlineField>
              )}
              {profile.entity.trim() ? (
                <ProfileChip icon={Building2} label="Entity" value={profile.entity} highlight />
              ) : (
                <InlineField icon={Building2} label="Entity" required highlight>
                  <select
                    value={profile.entity}
                    onChange={(e) => updateProfileField('entity', e.target.value)}
                    className="input-brutalist w-full"
                    data-testid="itsm-inline-entity"
                  >
                    <option value="">Select entity</option>
                    {entityOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </InlineField>
              )}
              {profile.location.trim() ? (
                <ProfileChip icon={MapPin} label="Location" value={profile.location} />
              ) : (
                <InlineField icon={MapPin} label="Location" required>
                  <select
                    value={LOCATION_OPTIONS.includes(profile.location) ? profile.location : ''}
                    onChange={(e) => updateProfileField('location', e.target.value)}
                    className="input-brutalist w-full mb-2"
                    data-testid="itsm-inline-location-select"
                  >
                    <option value="">Select location</option>
                    {LOCATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <input
                    value={profile.location}
                    onChange={(e) => updateProfileField('location', e.target.value)}
                    placeholder="Or type a custom location"
                    list="itsm-location-suggestions"
                    className="input-brutalist w-full"
                    data-testid="itsm-inline-location"
                  />
                  <datalist id="itsm-location-suggestions">
                    {LOCATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </InlineField>
              )}
            </div>
          </section>

          {!isRefex && (
            <section className="form-section !mb-0 lg:col-span-12">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="form-section-title !mb-1">Do you want to edit?</h2>
                  <p className="text-xs text-slate-500">
                    Default is No (Quick Search). Switch to Yes to pick Ticket Type (Incident / Service Request) → Category → Sub Category → Sub Type → Type.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setManualEdit(false);
                      setCascade({ ticketType: '', category: '', subCategory: '', subType: '', type: '' });
                      setSelectedMatrix(null);
                      setSelectedSubType('');
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      !manualEdit ? 'bg-white text-emerald-800 shadow-sm border border-emerald-100' : 'text-slate-500'
                    }`}
                    data-testid="itsm-manual-edit-no"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualEdit(true);
                      setSearchQuery('');
                      setDebouncedQuery('');
                      setSelectedSubType('');
                      setSelectedMatrix(null);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      manualEdit ? 'bg-white text-emerald-800 shadow-sm border border-emerald-100' : 'text-slate-500'
                    }`}
                    data-testid="itsm-manual-edit-yes"
                  >
                    Yes
                  </button>
                </div>
              </div>
            </section>
          )}

          {!useManualCascade ? (
            <section className="form-section !mb-0 lg:col-span-7">
              <h2 className="form-section-title">Quick Search</h2>
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
                  placeholder="Search Services"
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
                <p className="text-xs text-slate-500 mt-2">No services found.</p>
              )}
              {showSuggestions && (
                <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white shadow-md">
                  {showingOthersFallback && (
                    <p className="px-4 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                      No exact match — select Others
                    </p>
                  )}
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
          ) : (
            <section className="form-section !mb-0 lg:col-span-7 space-y-3">
              <h2 className="form-section-title">Service details</h2>
              {loadingMatrix ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="animate-spin" size={16} /> Loading catalog…
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Ticket Type">
                    <select
                      value={cascade.ticketType}
                      disabled={!profileComplete}
                      onChange={(e) => updateCascade('ticketType', e.target.value)}
                      className="input-brutalist w-full"
                      data-testid="itsm-cascade-ticket-type"
                    >
                      <option value="">Select ticket type</option>
                      {ticketTypeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select
                      value={cascade.category}
                      disabled={!cascade.ticketType}
                      onChange={(e) => updateCascade('category', e.target.value)}
                      className="input-brutalist w-full"
                      data-testid="itsm-cascade-category"
                    >
                      <option value="">Select category</option>
                      {categoryOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sub Category">
                    <select
                      value={cascade.subCategory}
                      disabled={!cascade.category}
                      onChange={(e) => updateCascade('subCategory', e.target.value)}
                      className="input-brutalist w-full"
                      data-testid="itsm-cascade-sub-category"
                    >
                      <option value="">Select sub category</option>
                      {subCategoryOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sub Type">
                    <select
                      value={cascade.subType}
                      disabled={!cascade.subCategory && subTypeCascadeOptions.length === 0}
                      onChange={(e) => updateCascade('subType', e.target.value)}
                      className="input-brutalist w-full"
                      data-testid="itsm-cascade-sub-type"
                    >
                      <option value="">Select sub type</option>
                      {subTypeCascadeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Type">
                    <select
                      value={cascade.type}
                      disabled={!cascade.subType && typeOptions.length === 0}
                      onChange={(e) => updateCascade('type', e.target.value)}
                      className="input-brutalist w-full"
                      data-testid="itsm-cascade-type"
                    >
                      <option value="">Select type</option>
                      {typeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Criticality">
                    <select
                      value={manualCriticality}
                      onChange={(e) => setManualCriticality(e.target.value)}
                      className="input-brutalist w-full"
                      data-testid="itsm-cascade-criticality"
                    >
                      {MANUAL_CRITICALITY.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </section>
          )}

          <aside className={`${selectedMatrix ? 'flex' : 'hidden lg:flex'} form-section !mb-0 lg:col-span-5 lg:row-span-3 lg:sticky lg:top-6 flex-col`}>
            {selectedMatrix ? (
              <>
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
                  <InfoBlock label="Sub Type" value={recordServiceLabel(selectedMatrix)} highlight />
                  <InfoBlock label="Criticality" value={criticality} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-8 px-4 h-full min-h-[280px]">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                  <ClipboardList className="text-emerald-600" size={24} />
                </div>
                <h2 className="font-heading text-lg font-semibold text-slate-900 mb-1">Request details</h2>
                <p className="text-sm text-slate-500 max-w-xs mb-6">
                  {useManualCascade
                    ? 'Choose ticket type and related fields. Details will appear here.'
                    : 'Search and pick a service. Category, type, and criticality will appear here.'}
                </p>
              </div>
            )}
          </aside>

          <section className="form-section !mb-0 lg:col-span-7">
            <h2 className="form-section-title">Description</h2>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Describe your issue or request in detail"
                className="input-brutalist w-full px-4 py-3 pr-12 resize-y min-h-[140px] lg:min-h-[180px]"
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

          <div className="lg:col-span-7">
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

const InlineField = ({ icon: Icon, label, children, required = false, highlight = false }) => (
  <div className={`rounded-xl border p-3 ${highlight ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
    <div className="flex items-center gap-2 mb-2">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${highlight ? 'bg-emerald-100' : 'bg-amber-100'}`}>
        <Icon size={14} className={highlight ? 'text-emerald-700' : 'text-amber-700'} />
      </div>
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        {label}{required ? ' *' : ''}
      </span>
    </div>
    {children}
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
