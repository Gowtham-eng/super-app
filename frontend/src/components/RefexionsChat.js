import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API } from '../config/api';
import { mergeItsmProfile } from '../utils/itsmEntity';
import { getApiErrorMessage } from '../utils/apiError';

const FALLBACK_MAIN = ['Expense', 'Travel', 'IT HelpDesk', 'Policies'];
const BACK = 'Back';
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
  const [itDraft, setItDraft] = useState({ description: '', subType: '', entity: '', location: '' });
  const [policyDraft, setPolicyDraft] = useState(null);
  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const policiesRef = useRef(STATIC_POLICIES);
  const profile = useMemo(() => mergeItsmProfile(user), [user]);
  const firstName = (profile.name || user?.name || 'there').split(' ')[0];

  const push = (...next) => setMessages((prev) => [...prev, ...next]);

  const resetToMain = (opts = mainOptions, greeting = mainMessage) => {
    setStep('main');
    setItDraft({ description: '', subType: '', entity: profile.entity || '', location: profile.location || '' });
    setPolicyDraft(null);
    const extras = ['My tickets'];
    setChips([BACK, ...opts, ...extras].filter((chip, idx, all) => chip && all.indexOf(chip) === idx));
    setMessages([
      botMsg(
        `Hi ${firstName}! I'm Refexions. ${greeting}`,
        opts,
      ),
    ]);
  };

  const loadMainMenu = async () => {
    setBusy(true);
    try {
      const res = await axios.get(`${API}/refexions/main-menu`, getAuthHeader());
      const options = Array.isArray(res.data?.options) && res.data.options.length
        ? res.data.options
        : FALLBACK_MAIN;
      const message = res.data?.message || 'Please choose from the following';
      setMainOptions(options);
      setMainMessage(message);
      resetToMain(options, message);
    } catch {
      resetToMain(FALLBACK_MAIN, 'Please choose from the following');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && messages.length === 0) loadMainMenu();
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

  const startItHelpdesk = () => {
    const entity = profile.entity || '';
    const location = profile.location || '';
    setItDraft({ description: '', subType: '', entity, location });
    if (!entity) {
      setStep('it_entity');
      const entityChips = ['Refex', 'Extrovis', 'ModePro', 'Kavis', 'Pharma Pack'];
      setChips([BACK, ...entityChips]);
      push(botMsg('Which company is this ticket for?', entityChips));
      return;
    }
    if (!location) {
      setStep('it_location');
      setChips([BACK, ...LOCATION_CHIPS]);
      push(botMsg('Which office / location should we use?', LOCATION_CHIPS));
      return;
    }
    setStep('it_reason');
    setChips([BACK]);
    push(botMsg('Describe the issue in one or two sentences.'));
  };

  const runItMatch = async (description, entity, location) => {
    setBusy(true);
    try {
      const res = await axios.post(
        `${API}/refexions/it/match`,
        { mail_body: description },
        getAuthHeader(),
      );
      const subType = res.data?.sub_type || 'Other';
      setItDraft({ description, subType, entity, location });
      setStep('it_confirm');
      setChips([BACK, 'Confirm', 'Edit']);
      push(botMsg(
        `Detected: ${subType}${res.data?.matched_keyword ? ` (${res.data.matched_keyword})` : ''}.\n\nCreate this ticket as ${entity} / ${location}?`,
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

  const openPolicies = () => {
    showPolicies();
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
      if (!choice) {
        push(userMsg(value), botMsg('Please pick one of the options below.', mainOptions));
        return;
      }
      push(userMsg(choice));
      if (/helpdesk|help desk|it help/i.test(choice)) return startItHelpdesk();
      if (/polic/i.test(choice)) return openPolicies();
      if (/expense/i.test(choice) || /travel/i.test(choice)) return openSubMenu(choice);
      push(botMsg('That option is not available yet. Pick another from the menu.', mainOptions));
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
      const next = { ...itDraft, entity };
      setItDraft(next);
      if (!next.location) {
        setStep('it_location');
        setChips([BACK, ...LOCATION_CHIPS]);
        push(botMsg('Which office / location should we use?', LOCATION_CHIPS));
        return;
      }
      setStep('it_reason');
      setChips([BACK]);
      push(botMsg('Describe the issue in one or two sentences.'));
      return;
    }

    if (step === 'it_location') {
      const location = matched || value;
      push(userMsg(location));
      const next = { ...itDraft, location };
      setItDraft(next);
      setStep('it_reason');
      setChips([BACK]);
      push(botMsg('Describe the issue in one or two sentences.'));
      return;
    }

    if (step === 'it_reason') {
      push(userMsg(value));
      return runItMatch(value, itDraft.entity, itDraft.location);
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
        className="group flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white pl-4 pr-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
        data-testid="open-chat"
      >
        <MessageCircle size={20} />
        <span className="text-sm font-medium">Refexions</span>
      </button>
    );
  }

  const visibleChips = chips.filter((chip) => chip !== BACK);

  return (
    <div className="w-80 sm:w-96 h-[480px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <MessageCircle size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Refexions</h3>
            <p className="text-emerald-100 text-[11px]">
              {busy ? 'Working…' : profile.entity ? `${profile.entity} assistant` : 'Workplace assistant'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          data-testid="close-chat"
        >
          <X size={18} />
        </button>
      </div>

      <div ref={scrollerRef} className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-3">
        {messages.map((entry) => (
          <div key={entry.id} className={`flex gap-2 ${entry.role === 'user' ? 'justify-end' : ''}`}>
            {entry.role === 'bot' ? (
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle size={12} className="text-emerald-600" />
              </div>
            ) : null}
            <div
              className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                entry.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-sm'
                  : 'bg-white text-slate-700 shadow-sm border border-slate-100 rounded-tl-sm'
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
                      className="block w-full text-left rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
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
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 pl-9">
            <Loader2 size={14} className="animate-spin" />
            Working…
          </div>
        ) : null}
      </div>

      {visibleChips.length ? (
        <div className="px-3 pt-2 pb-1 border-t border-slate-100 bg-white flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {visibleChips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={busy}
              onClick={() => handleChoice(chip)}
              className="text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 px-2.5 py-1.5 rounded-full border border-emerald-100"
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={submitDraft} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
        {step !== 'main' ? (
          <button
            type="button"
            onClick={() => handleChoice(BACK)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2"
          >
            Back
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={step === 'it_reason' ? 'Describe the issue…' : 'Type or pick an option…'}
          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          data-testid="chat-input"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-full flex items-center justify-center transition-colors"
          data-testid="chat-send"
        >
          <Send size={14} className="text-white" />
        </button>
      </form>
    </div>
  );
};

export default RefexionsChat;
