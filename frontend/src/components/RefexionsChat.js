import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API, ITSM_API } from '../config/api';
import {
  isRefexEntity,
  locationFromUser,
  locationsForEntity,
  matchLocationOption,
  mergeItsmProfile,
} from '../utils/itsmEntity';
import { getApiErrorMessage } from '../utils/apiError';

const FALLBACK_MAIN = ['Expense', 'Travel', 'IT HelpDesk', 'Policies'];
const BACK = 'Back';
const ASK_QUESTION = 'Ask a question';
const MAIN_EXTRAS = ['My tickets', ASK_QUESTION];
const LOCATION_CHIPS = [
  'Chennai',
  'Bengaluru',
  'Delhi',
  'Nungambakkam',
  'Thoraipakkam',
];
const STATIC_POLICIES = [
  { title: 'Data Privacy', description: 'Data Privacy & Protection Policy', document_id: 'data_privacy_policy' },
  { title: 'Domestic Travel', description: 'Domestic Travel Policy', document_id: 'domestic_travel_policy' },
  { title: 'IT Asset Management', description: 'IT asset allocation and return', document_id: 'it_asset_policy' },
  { title: 'IT Data Security', description: 'Data handling and security rules', document_id: 'it_data_security_policy' },
  { title: 'IT Policy', description: 'General IT usage policy', document_id: 'it_policy' },
  { title: 'POSH', description: 'Prevention of Sexual Harassment', document_id: 'posh_policy' },
  { title: 'Recruitment', description: 'Hiring and recruitment process', document_id: 'recruitment_policy' },
  { title: 'Salary Advance', description: 'Applying for a salary advance', document_id: 'salary_advance_policy' },
];

const newId = () => `m-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const botMsg = (text, chips = [], extra = {}) => ({
  id: newId(),
  role: 'bot',
  text,
  chips,
  ...extra,
});

const userMsg = (text) => ({
  id: newId(),
  role: 'user',
  text,
});

const matchChip = (value, chips) => {
  const typed = String(value || '').trim().toLowerCase();
  if (!typed) return '';
  const exact = chips.find((chip) => chip.toLowerCase() === typed);
  if (exact) return exact;
  const starts = chips.find((chip) => chip.toLowerCase().startsWith(typed) || typed.startsWith(chip.toLowerCase()));
  if (starts) return starts;
  return chips.find((chip) => chip.toLowerCase().includes(typed) || typed.includes(chip.toLowerCase())) || '';
};

const mainChipList = (opts = FALLBACK_MAIN) => (
  [BACK, ...opts, ...MAIN_EXTRAS].filter((chip, idx, all) => chip && all.indexOf(chip) === idx)
);

const RefexionsChat = () => {
  const { user, getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('main');
  const [messages, setMessages] = useState([]);
  const [chips, setChips] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [mainMessage, setMainMessage] = useState('Please choose from the following');
  const [mainOptions, setMainOptions] = useState(FALLBACK_MAIN);
  const [itDraft, setItDraft] = useState({
    description: '',
    subject: '',
    subType: '',
    entity: '',
    location: '',
  });
  const [nonRefexLocations, setNonRefexLocations] = useState([]);
  const [policyDraft, setPolicyDraft] = useState(null);
  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const policiesRef = useRef(STATIC_POLICIES);
  const stepRef = useRef('main');
  const profile = useMemo(() => mergeItsmProfile(user), [user]);
  const firstName = (profile.name || user?.name || 'there').split(' ')[0];
  stepRef.current = step;

  const push = (...next) => setMessages((prev) => [...prev, ...next]);

  const resetToMain = (opts = mainOptions, greeting = mainMessage) => {
    setStep('main');
    setItDraft({
      description: '',
      subject: '',
      subType: '',
      entity: profile.entity || '',
      location: profile.location || '',
    });
    setPolicyDraft(null);
    setChips(mainChipList(opts));
    setMessages([
      botMsg(
        `Hi ${firstName}! I'm Refexions. ${greeting}`,
        opts,
      ),
    ]);
  };

  const applyLiveMainMenu = (options, greeting) => {
    setMainOptions(options);
    setMainMessage(greeting);
    if (stepRef.current !== 'main') return;
    setChips(mainChipList(options));
    setMessages((prev) => {
      if (!prev.length || prev.length > 1) return prev;
      const first = prev[0];
      if (first?.role !== 'bot') return prev;
      return [{
        ...first,
        text: `Hi ${firstName}! I'm Refexions. ${greeting}`,
        chips: options,
      }];
    });
  };

  const fetchMainMenu = async () => {
    try {
      const res = await axios.get(`${API}/refexions/main-menu`, getAuthHeader());
      const options = Array.isArray(res.data?.options) && res.data.options.length
        ? res.data.options
        : FALLBACK_MAIN;
      const message = res.data?.message || 'Please choose from the following';
      return { options, message };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchMainMenu().then((data) => {
      if (cancelled || !data) return;
      applyLiveMainMenu(data.options, data.message);
    });
    return () => { cancelled = true; };
    // Prefetch while the launcher FAB is visible so open is instant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  useEffect(() => {
    if (open && messages.length === 0) {
      resetToMain(mainOptions, mainMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, chips, busy]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open, step]);

  const goMain = () => resetToMain(mainOptions, mainMessage);

  const answerFromFaq = async (text) => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/refexions/faq/match`, { text }, getAuthHeader());
      if (res.data?.matched && res.data?.answer) {
        const link = String(res.data.link || '').trim();
        const answer = link ? `${res.data.answer}\n\n${link}` : res.data.answer;
        push(botMsg(answer, mainOptions));
        setStep('main');
        setChips([BACK, ...mainOptions, 'My tickets', ASK_QUESTION]);
        return true;
      }
      push(botMsg(
        res.data?.message || 'I do not have an FAQ for that. Pick one of the options below.',
        mainOptions,
      ));
      setStep('main');
      setChips([BACK, ...mainOptions, 'My tickets', ASK_QUESTION]);
      return false;
    } catch (err) {
      push(botMsg(getApiErrorMessage(err, 'Could not look up that question. Pick an option below.'), mainOptions));
      setStep('main');
      setChips([BACK, ...mainOptions, 'My tickets', ASK_QUESTION]);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startFaqAsk = () => {
    setStep('faq_ask');
    setChips([BACK]);
    push(botMsg('Type your question. I answer from the FAQ list — I will not invent an answer.'));
  };

  const locationChipsFor = (entity, rows = nonRefexLocations) => {
    if (!entity || isRefexEntity(entity)) return LOCATION_CHIPS;
    return locationsForEntity(rows, entity);
  };

  const resolveItLocation = (entity, preferred, rows = nonRefexLocations) => {
    if (!entity || isRefexEntity(entity)) return preferred || '';
    const options = locationsForEntity(rows, entity);
    return (
      matchLocationOption(preferred, options) ||
      matchLocationOption(locationFromUser(user), options) ||
      ''
    );
  };

  const loadNonRefexLocations = async (entity) => {
    if (!entity || isRefexEntity(entity)) return [];
    const res = await axios.get(`${ITSM_API}/itsm/non-refex-locations`, {
      ...getAuthHeader(),
      params: { entity, environment: 'live' },
    });
    const rows = Array.isArray(res.data?.locations) ? res.data.locations : [];
    setNonRefexLocations(rows);
    return rows;
  };

  const askItDetails = (entity, location) => {
    setItDraft((prev) => ({ ...prev, entity, location }));
    if (!isRefexEntity(entity)) {
      setStep('it_subject');
      setChips([BACK]);
      push(botMsg('Enter a short subject for this ticket.'));
      return;
    }
    setStep('it_reason');
    setChips([BACK]);
    push(botMsg('Describe the issue in one or two sentences.'));
  };

  const askItLocationOrReason = (entity, rows, preferred) => {
    const resolved = resolveItLocation(entity, preferred, rows);
    if (resolved) {
      askItDetails(entity, resolved);
      return;
    }
    const chipsForEntity = locationChipsFor(entity, rows);
    setItDraft((prev) => ({ ...prev, entity, location: '' }));
    setStep('it_location');
    setChips([BACK, ...chipsForEntity]);
    push(botMsg('Which office / location should we use?', chipsForEntity));
  };

  const startItHelpdesk = async () => {
    const entity = profile.entity || '';
    const location = profile.location || '';
    setItDraft({ description: '', subject: '', subType: '', entity, location });
    if (!entity) {
      setStep('it_entity');
      const entityChips = ['Refex', 'Extrovis', 'ModePro', 'Kavis', 'Pharma Pack'];
      setChips([BACK, ...entityChips]);
      push(botMsg('Which company is this ticket for?', entityChips));
      return;
    }
    setBusy(true);
    try {
      const rows = await loadNonRefexLocations(entity);
      askItLocationOrReason(entity, rows, location);
    } catch {
      askItLocationOrReason(entity, [], location);
    } finally {
      setBusy(false);
    }
  };

  const runItMatch = async (description, entity, location, subject = '') => {
    setBusy(true);
    try {
      const mailBody = [subject, description].filter(Boolean).join('\n');
      const res = await axios.post(
        `${API}/refexions/it/match`,
        { mail_body: mailBody },
        getAuthHeader(),
      );
      const subType = res.data?.sub_type || 'Other';
      setItDraft((prev) => ({ ...prev, description, subject, subType, entity, location }));
      setStep('it_confirm');
      setChips([BACK, 'Confirm', 'Edit']);
      const subjectLine = subject ? `\nSubject: ${subject}` : '';
      push(botMsg(
        `Detected: ${subType}${res.data?.matched_keyword ? ` (${res.data.matched_keyword})` : ''}.${subjectLine}\n\nCreate this ticket as ${entity} / ${location}?`,
        ['Confirm', 'Edit'],
      ));
    } catch (err) {
      setChips([BACK, 'Try again']);
      push(botMsg(getApiErrorMessage(err, 'Could not classify this issue. Try again.')));
    } finally {
      setBusy(false);
    }
  };

  const createTicket = async () => {
    setBusy(true);
    try {
      const res = await axios.post(
        `${API}/refexions/it/create`,
        {
          description: itDraft.description,
          subject: itDraft.subject || '',
          sub_type: itDraft.subType,
          name: profile.name || user?.name || '',
          email: profile.email || user?.email || '',
          entity: itDraft.entity,
          location: itDraft.location,
          criticality: 'Medium',
        },
        getAuthHeader(),
      );
      setStep('it_done');
      setChips([BACK, 'View my tickets']);
      push(botMsg(
        res.data?.message || 'Ticket created successfully. You may get a notification by email.',
        ['View my tickets'],
      ));
    } catch (err) {
      setChips([BACK, 'Try again']);
      push(botMsg(getApiErrorMessage(err, 'Could not create the ticket. Please try again.')));
    } finally {
      setBusy(false);
    }
  };

  const showPolicies = (list = STATIC_POLICIES, message = 'Select a policy to email it to yourself.') => {
    const policies = Array.isArray(list) && list.length ? list : STATIC_POLICIES;
    policiesRef.current = policies;
    setStep('policies');
    const titles = policies.map((row) => row.title);
    setChips([BACK, ...titles]);
    push(botMsg(message, titles, { policies }));
  };

  const openPolicies = async () => {
    setBusy(true);
    try {
      const res = await axios.get(`${API}/refexions/policies`, getAuthHeader());
      showPolicies(
        res.data?.policies || STATIC_POLICIES,
        res.data?.message || 'Select a policy to email it to yourself.',
      );
    } catch {
      showPolicies();
    } finally {
      setBusy(false);
    }
  };

  const sendPolicy = async (policy) => {
    if (!policy?.document_id) {
      push(botMsg('Please pick a policy from the list.'));
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(
        `${API}/refexions/policies/send`,
        {
          document_id: policy.document_id,
          title: policy.title,
          user_email: profile.email || user?.email || '',
        },
        getAuthHeader(),
      );
      const ok = Boolean(res.data?.success);
      setStep(ok ? 'policy_done' : 'policy_confirm');
      setChips(ok ? [BACK] : [BACK, 'Try again']);
      push(botMsg(res.data?.message || (ok ? `${policy.title} sent.` : `Couldn't send ${policy.title} right now.`)));
    } catch (err) {
      setStep('policy_confirm');
      setChips([BACK, 'Try again']);
      push(botMsg(getApiErrorMessage(err, `Couldn't send ${policy.title} right now.`)));
    } finally {
      setBusy(false);
    }
  };

  const openSubMenu = async (main) => {
    setBusy(true);
    try {
      const res = await axios.get(`${API}/refexions/sub-menu`, {
        ...getAuthHeader(),
        params: { main },
      });
      const options = Array.isArray(res.data?.options) ? res.data.options : [];
      setStep(main.toLowerCase().includes('travel') ? 'sub_travel' : 'sub_expense');
      setChips([BACK, ...options]);
      push(botMsg(res.data?.message || 'Please select the application', options, {
        comingSoon: Boolean(res.data?.comingSoon),
        comingSoonMessage: res.data?.comingSoonMessage,
      }));
    } catch (err) {
      push(botMsg(getApiErrorMessage(err, 'Could not load this menu.')));
    } finally {
      setBusy(false);
    }
  };

  const handleChoice = async (raw) => {
    const value = String(raw || '').trim();
    if (!value || busy) return;
    if (value === BACK || /^back$/i.test(value)) {
      push(userMsg('Back'));
      goMain();
      return;
    }
    if (/view my tickets|my tickets/i.test(value)) {
      setOpen(false);
      navigate('/itsm');
      return;
    }

    const liveChips = chips.filter((chip) => chip !== BACK);
    const matched = matchChip(value, liveChips) || (liveChips.includes(value) ? value : '');

    if (step === 'main') {
      const choice = matched || matchChip(value, mainOptions);
      if (/ask a question|faq/i.test(value) || matched === ASK_QUESTION) {
        push(userMsg(ASK_QUESTION));
        startFaqAsk();
        return;
      }
      if (!choice) {
        push(userMsg(value));
        answerFromFaq(value);
        return;
      }
      push(userMsg(choice));
      if (/helpdesk|help desk|it help/i.test(choice)) return startItHelpdesk();
      if (/polic/i.test(choice)) return openPolicies();
      if (/expense/i.test(choice) || /travel/i.test(choice)) return openSubMenu(choice);
      push(botMsg('That option is not available yet. Pick another from the menu.', mainOptions));
      return;
    }

    if (step === 'faq_ask') {
      push(userMsg(value));
      answerFromFaq(value);
      return;
    }

    if (step === 'sub_expense' || step === 'sub_travel') {
      const last = [...messages].reverse().find((row) => row.comingSoon);
      push(userMsg(matched || value), botMsg(
        last?.comingSoonMessage
          || 'Receipt upload and OCR for Expense / Travel will land in the next release. Use the Expense or Travel app for now.',
        [BACK],
      ));
      setChips([BACK]);
      return;
    }

    if (step === 'it_entity') {
      const entity = matched || value;
      push(userMsg(entity));
      setItDraft((prev) => ({ ...prev, entity }));
      setBusy(true);
      loadNonRefexLocations(entity)
        .then((rows) => askItLocationOrReason(entity, rows, itDraft.location || profile.location))
        .catch(() => askItLocationOrReason(entity, [], itDraft.location || profile.location))
        .finally(() => setBusy(false));
      return;
    }

    if (step === 'it_location') {
      const location = matched || value;
      push(userMsg(location));
      const next = { ...itDraft, location };
      setItDraft(next);
      askItDetails(itDraft.entity, location);
      return;
    }

    if (step === 'it_subject') {
      const subject = value.trim();
      if (!subject) {
        push(userMsg(value), botMsg('Please enter a subject.'));
        return;
      }
      push(userMsg(subject));
      setItDraft((prev) => ({ ...prev, subject }));
      setStep('it_reason');
      setChips([BACK]);
      push(botMsg('Describe the issue in one or two sentences.'));
      return;
    }

    if (step === 'it_reason') {
      push(userMsg(value));
      return runItMatch(value, itDraft.entity, itDraft.location, itDraft.subject || '');
    }

    if (step === 'it_confirm') {
      if (/edit/i.test(value) || matched === 'Edit') {
        push(userMsg('Edit'));
        setStep('it_reason');
        setChips([BACK]);
        push(botMsg('No problem — describe the issue again.'));
        return;
      }
      if (/try again/i.test(value)) {
        push(userMsg('Try again'));
        if (itDraft.description) return createTicket();
        setStep('it_reason');
        setChips([BACK]);
        push(botMsg('Describe the issue in one or two sentences.'));
        return;
      }
      push(userMsg('Confirm'));
      return createTicket();
    }

    if (step === 'policies') {
      const list = policiesRef.current.length ? policiesRef.current : STATIC_POLICIES;
      const wanted = (matched || value).trim().toLowerCase();
      const policy = list.find((row) => row.title.toLowerCase() === wanted)
        || list.find((row) => row.title.toLowerCase().includes(wanted) || wanted.includes(row.title.toLowerCase()));
      if (!policy) {
        push(userMsg(value), botMsg('Please pick a policy from the list.', list.map((row) => row.title), { policies: list }));
        return;
      }
      setPolicyDraft(policy);
      setStep('policy_confirm');
      setChips([BACK, 'Send', 'Cancel']);
      push(userMsg(policy.title), botMsg(
        `Send “${policy.title}” (${policy.description}) to ${profile.email || user?.email || 'your email'}?`,
        ['Send', 'Cancel'],
      ));
      return;
    }

    if (step === 'policy_confirm' || step === 'policy_done') {
      if (/cancel/i.test(value)) {
        push(userMsg('Cancel'));
        return showPolicies();
      }
      if (/try again/i.test(value) && policyDraft) {
        push(userMsg('Try again'));
        return sendPolicy(policyDraft);
      }
      if (policyDraft && (/send/i.test(value) || matched === 'Send')) {
        push(userMsg('Send'));
        return sendPolicy(policyDraft);
      }
    }

    push(userMsg(value));
    goMain();
  };

  const submitDraft = (event) => {
    event?.preventDefault?.();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    handleChoice(text);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white pl-3.5 pr-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 sm:gap-2.5 sm:pl-4 sm:pr-5"
        data-testid="open-chat"
      >
        <MessageCircle size={20} />
        <span className="text-sm font-medium">Refexions</span>
      </button>
    );
  }

  const visibleChips = chips.filter((chip) => chip !== BACK);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/40 sm:hidden"
        aria-label="Close Refexions"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-x-0 bottom-0 z-[61] flex h-[min(92dvh,720px)] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:relative sm:inset-auto sm:h-[480px] sm:w-96 sm:rounded-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <MessageCircle size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">Refexions</h3>
              <p className="truncate text-[11px] text-emerald-100">
                {busy ? 'Working…' : profile.entity ? `${profile.entity} assistant` : 'Workplace assistant'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            data-testid="close-chat"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
          {messages.map((entry) => (
            <div key={entry.id} className={`flex gap-2 ${entry.role === 'user' ? 'justify-end' : ''}`}>
              {entry.role === 'bot' ? (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <MessageCircle size={12} className="text-emerald-600" />
                </div>
              ) : null}
              <div
                className={`max-w-[min(100%,20rem)] break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-pretty whitespace-pre-wrap sm:max-w-[85%] ${
                  entry.role === 'user'
                    ? 'rounded-tr-sm bg-emerald-600 text-white'
                    : 'rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm'
                }`}
              >
                {entry.text}
                {Array.isArray(entry.policies) && entry.policies.length ? (
                  <div className="mt-2 space-y-1.5">
                    {entry.policies.map((policy) => (
                      <button
                        key={policy.document_id}
                        type="button"
                        disabled={busy}
                        onClick={() => handleChoice(policy.title)}
                        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <span className="block text-xs font-semibold text-slate-800">{policy.title}</span>
                        <span className="block text-[11px] text-slate-500">{policy.description}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {busy && messages.length ? (
            <div className="flex items-center gap-2 pl-9 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              Working…
            </div>
          ) : null}
        </div>

        {visibleChips.length ? (
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto border-t border-slate-100 bg-white px-3 pb-1 pt-2 sm:max-h-28">
            {visibleChips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => handleChoice(chip)}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={submitDraft}
          className="flex items-center gap-2 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {step !== 'main' ? (
            <button
              type="button"
              onClick={() => handleChoice(BACK)}
              className="shrink-0 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              Back
            </button>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              step === 'it_subject'
                ? 'Enter the subject…'
                : step === 'it_reason'
                  ? 'Describe the issue…'
                  : 'Type or pick an option…'
            }
            className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            data-testid="chat-input"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 transition-colors hover:bg-emerald-700 disabled:opacity-50"
            data-testid="chat-send"
          >
            <Send size={14} className="text-white" />
          </button>
        </form>
      </div>
    </>
  );
};

export default RefexionsChat;
