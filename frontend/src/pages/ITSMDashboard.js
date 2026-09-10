import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ITSM_API } from '../config/api';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import { mergeItsmProfile } from '../utils/itsmEntity';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ClockAlert,
  FolderOpen,
  Headphones,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Star,
  Ticket,
} from 'lucide-react';

const KPI_CARDS = [
  { key: 'All', label: 'All Tickets', sub: 'All your requests', icon: Ticket, tone: 'blue' },
  { key: 'Open', label: 'Open Tickets', sub: 'Open & reopened', icon: FolderOpen, tone: 'blue' },
  { key: 'SlaBreached', label: 'SLA Breached', sub: 'SLA breached tickets', icon: ClockAlert, tone: 'red' },
  { key: 'Closed', label: 'Closed Tickets', sub: 'Successfully completed', icon: CheckCircle2, tone: 'green' },
];

const KPI_TONE = {
  blue: {
    wash: 'from-sky-50/90 via-white to-indigo-50/70',
    value: 'text-sky-700',
    iconBg: 'bg-[#0d9488]',
  },
  green: {
    wash: 'from-emerald-50/90 via-white to-teal-50/70',
    value: 'text-emerald-700',
    iconBg: 'bg-[#107C10]',
  },
  orange: {
    wash: 'from-orange-50/90 via-white to-amber-50/70',
    value: 'text-orange-700',
    iconBg: 'bg-[#E56910]',
  },
  red: {
    wash: 'from-rose-50/90 via-white to-red-50/70',
    value: 'text-red-700',
    iconBg: 'bg-[#D13438]',
  },
};

const TABLE_TITLES = {
  All: 'All Tickets',
  Open: 'Open Tickets',
  SlaBreached: 'SLA Breached',
  Closed: 'Closed Tickets',
};

const formatTicketDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  return `${day} ${month} ${d.getFullYear()}`;
};

const statusBadgeClass = (status = '') => {
  const v = status.toLowerCase();
  if (v.includes('fail')) return 'bg-red-100 text-red-800 border-red-200';
  if (v.includes('reopen')) return 'bg-orange-100 text-orange-800 border-orange-200';
  if (v.includes('closed') || v.includes('completed') || v.includes('reject')) {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  if (v.includes('pending')) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
};

const isReopenHoldStep = (step) => {
  const text = String(step || '').trim().toLowerCase();
  if (!text || text.includes('reopened')) return false;
  return (
    text.includes('it tech reopen')
    || text.includes('reopen window')
    || text === 'ticket reopen'
    || (text.includes('ticket reopen') && !text.includes('reopened'))
    || text.includes('ticket can be reopened')
    || text.includes('employee feedback')
    || text.includes('employee verification')
    || text.includes('employee confirmation')
  );
};

const ticketAllowsReopen = (ticket) =>
  Boolean(ticket?.canReopen) || isReopenHoldStep(ticket?.currentStep);

/** Same gate as the Action-column stars — reopen-hold or already rated. */
const showsEmployeeRating = (ticket) =>
  Boolean(ticket) && (ticketAllowsReopen(ticket) || Number(ticket.employeeRating) >= 1);

const REOPENED_IDS_KEY = 'itsmReopenedTicketIds.v1';

const loadRememberedReopenedIds = () => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(REOPENED_IDS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

const rememberedReopenedIds = loadRememberedReopenedIds();

const rememberReopenedTicket = (ticketId) => {
  const id = String(ticketId || '').trim();
  if (!id) return;
  rememberedReopenedIds.add(id);
  try {
    sessionStorage.setItem(REOPENED_IDS_KEY, JSON.stringify([...rememberedReopenedIds]));
  } catch {
    // ignore quota / private mode
  }
};

const reopenRelatedBlob = (ticket) =>
  [
    ticket?.status,
    ticket?.currentStep,
    ticket?.lastCompletedStep,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

/** Closed reopen-hold, sendback/reopened Open rows, or Reopened_Ticket — no Reply/compose. */
const isReopenRelatedTicket = (ticket) => {
  if (!ticket) return false;
  if (showsEmployeeRating(ticket)) return true;
  const id = String(ticket.id || ticket.localId || '').trim();
  if (id && rememberedReopenedIds.has(id)) return true;
  if (ticket.reopened || ticketAllowsReopen(ticket)) return true;
  const blob = reopenRelatedBlob(ticket);
  if (!blob.trim()) return false;
  if (blob.includes('reopen')) return true;
  return (
    blob.includes('employee feedback')
    || blob.includes('employee verification')
    || blob.includes('employee confirmation')
  );
};

const lockCommentsIfReopened = (ticket) => {
  if (!ticket || !isReopenRelatedTicket(ticket)) return ticket;
  return { ...ticket, canComment: false };
};

const ticketStatusKey = (ticket) => (ticket?.status || '').toLowerCase();

const matchesKpiFilter = (ticket, tab) => {
  const status = ticketStatusKey(ticket);
  const isReopened = Boolean(ticket.reopened);
  if (tab === 'All') return true;
  if (tab === 'SlaBreached') return Boolean(ticket.slaBreached);
  if (tab === 'Closed') {
    return !isReopened && (status.includes('closed') || status.includes('completed') || status.includes('reject'));
  }
  if (tab === 'Open' || tab === 'Reopened') {
    // Reopened tickets live under Open (separate KPI removed).
    if (isReopened) return true;
    return (
      !status.includes('fail') &&
      !status.includes('closed') &&
      !status.includes('completed') &&
      !status.includes('reject')
    );
  }
  return true;
};

const isOpenTicket = (ticket) => matchesKpiFilter(ticket, 'Open');

const TicketStatusTags = ({ ticket, size = 'md' }) => {
  const status = (ticket?.status || '').trim() || '—';
  const statusLower = status.toLowerCase();
  const showReopenedTag =
    Boolean(ticket?.reopened) && !statusLower.includes('reopen');
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-1.5 whitespace-normal">
      <span
        className={`inline-flex shrink-0 items-center rounded-full font-semibold border ${pad} ${statusBadgeClass(status)}`}
      >
        {status}
      </span>
      {showReopenedTag ? (
        <span
          className={`inline-flex shrink-0 items-center rounded-full font-semibold border ${pad} bg-orange-100 text-orange-800 border-orange-200`}
        >
          Reopened
        </span>
      ) : null}
    </div>
  );
};

const isRefexHelpdeskEntity = (entity) =>
  String(entity || '').trim().toLowerCase() === 'refex';

/** Comments UI is Extrovis-family only — Refex Help Desk never shows a thread.
 *  Reopen tickets can view history but never Reply / compose. */
const canShowTicketComments = (entity, ticket) =>
  !isRefexHelpdeskEntity(entity)
  && !isRefexHelpdeskEntity(ticket?.entity);

const isItsmBotAssignedPart = (value) => {
  const compact = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!compact) return false;
  return compact.includes('itsmbot') || compact === 'bot' || compact.endsWith('bot');
};

/** Hide ITSM BOT / AppRole from Assigned To — keep the human name. */
const formatAssignedToDisplay = (value) => {
  const parts = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== '—' && !isItsmBotAssignedPart(part));
  const seen = new Set();
  const unique = [];
  parts.forEach((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(part);
  });
  return unique.join(', ') || '—';
};

const canCommentTicket = (ticket, entity) => {
  if (!ticket || showsEmployeeRating(ticket) || isReopenRelatedTicket(ticket)) return false;
  if (!canShowTicketComments(entity, ticket)) return false;
  if (!isOpenTicket(ticket) || ticketAllowsReopen(ticket)) return false;
  if (ticket.canComment === false) return false;
  if (ticket.canComment === true) {
    const step = String(ticket.currentStep || '').trim().toLowerCase();
    if (step.includes('reopen') || isReopenHoldStep(step)) return false;
    return true;
  }
  const step = String(ticket.currentStep || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
  if (!step) return false;
  if (step.includes('reopen')) return false;
  return (
    step.includes('agent solution')
    || step.includes('pickup')
    || step.includes('pick up')
    || step.includes('dependency')
  );
};

const formatRevisionDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const QUICK_REPLIES = [
  { id: 'thanks', label: 'Thanks', text: 'Thanks, this helped.' },
  { id: 'not-fixed', label: 'Not resolved', text: 'This is still not resolved. Please check again.' },
  { id: 'update', label: 'Need update', text: 'Could you please share an update?' },
];

const namesLooselyMatch = (left, right) => {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const first = (value) => value.split(/[\s@._-]+/).filter(Boolean)[0] || '';
  const fa = first(a);
  const fb = first(b);
  return Boolean(fa && fb && fa === fb && fa.length > 2);
};

const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const looksLikeEmail = (value) => /@/.test(String(value || ''));
const looksLikeKissflowId = (value) => /^Pk[A-Za-z0-9]{8,}$/.test(String(value || '').trim());

const realCommentRows = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((entry) => {
    const text = String(entry?.comment || entry?.resolution || '').trim();
    const name = String(entry?.userName || entry?.agentName || '').trim();
    if (!text || looksLikeKissflowId(text)) return false;
    if (looksLikeKissflowId(name) && looksLikeKissflowId(text)) return false;
    return true;
  });

const commentsBelongToTicket = (rows, ticket) => {
  const createdMs = ticket?.createdOn ? new Date(ticket.createdOn).getTime() : 0;
  return (Array.isArray(rows) ? rows : []).filter((entry) => {
    if (!createdMs || Number.isNaN(createdMs)) return true;
    const stamped = entry?.dateTime ? new Date(entry.dateTime).getTime() : 0;
    if (!stamped || Number.isNaN(stamped)) return true;
    return stamped + 120000 >= createdMs;
  });
};

const mergeCommentRows = (...groups) => {
  const seen = new Set();
  const out = [];
  groups.forEach((group) => {
    realCommentRows(group).forEach((row) => {
      const text = String(row?.comment || row?.resolution || '').trim().toLowerCase();
      const id = String(row?.id || row?.recordId || '').trim();
      const token = id || text;
      if (!token || seen.has(token) || seen.has(text)) return;
      if (id) seen.add(id);
      seen.add(text);
      out.push(row);
    });
  });
  return out;
};

const avatarTone = (name, mine) => {
  if (mine) return 'bg-teal-800 text-teal-50';
  const key = String(name || '').trim().toLowerCase();
  if (key.includes('test') || key.includes('employee') || key.includes('requester')) {
    return 'bg-slate-200 text-slate-700';
  }
  return 'bg-slate-700 text-slate-50';
};

const displayAuthorName = (entry, ticket) => {
  const raw = String(entry?.userName || '').trim();
  const requester = String(ticket?.requesterName || '').trim();
  if (!raw || /^employee$/i.test(raw) || /^you$/i.test(raw) || (looksLikeEmail(raw) && requester)) {
    if (requester && (entry?.role === 'employee' || /^employee$/i.test(raw) || looksLikeEmail(raw) || /^you$/i.test(raw))) {
      return requester;
    }
  }
  if (looksLikeKissflowId(raw)) {
    return entry?.role === 'employee' ? requester || 'Employee' : 'IT Support';
  }
  return raw || (entry?.role === 'employee' ? requester || 'Employee' : 'IT Support');
};

const isMineMessage = (entry, ticket, viewerName, viewerEmail) => {
  const name = displayAuthorName(entry, ticket);
  if (namesLooselyMatch(name, viewerName) || namesLooselyMatch(entry?.userName, viewerName)) return true;
  if (viewerEmail && looksLikeEmail(entry?.userName) && String(entry.userName).trim().toLowerCase() === viewerEmail.toLowerCase()) {
    return true;
  }
  if (/^you$/i.test(String(entry?.userName || ''))) return true;
  if (/^employee$/i.test(String(entry?.userName || '')) && namesLooselyMatch(viewerName, ticket?.requesterName)) {
    return true;
  }
  return false;
};

const dayLabel = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const revisionEntriesFromTicket = (ticket) => {
  const rows = realCommentRows(ticket?.agentSolutions);
  return rows
    .map((entry, index) => {
      const comment = String(entry?.comment || entry?.resolution || '').trim();
      if (!comment || looksLikeKissflowId(comment)) return null;
      return {
        recordId: entry.recordId || entry.id || `rev-${index}`,
        userName: String(entry.userName || entry.agentName || '').trim(),
        comment,
        dateTime: entry.dateTime || null,
        role: entry?.role === 'reopen' ? 'reopen' : entry?.role || '',
        timestamp: entry.dateTime ? new Date(entry.dateTime).getTime() || index : index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
};

const TicketConversation = ({
  ticket,
  entity = '',
  environment = '',
  getAuthHeader,
  viewerName = '',
  viewerEmail = '',
  canComment = false,
  commenting = false,
  autoFocus = false,
  onSend,
  onHydrated,
}) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [hydrating, setHydrating] = useState(false);
  const [loadError, setLoadError] = useState('');
  const inputRef = React.useRef(null);
  const scrollerRef = React.useRef(null);
  const authRef = React.useRef(getAuthHeader);
  const hydrateRef = React.useRef(onHydrated);
  const ticketRef = React.useRef(ticket);
  authRef.current = getAuthHeader;
  hydrateRef.current = onHydrated;
  ticketRef.current = ticket;
  const entries = revisionEntriesFromTicket(ticket);
  const allowCompose =
    Boolean(canComment)
    && !showsEmployeeRating(ticket)
    && !isReopenRelatedTicket(ticket);

  const loadComments = React.useCallback(async (force = false) => {
    const live = ticketRef.current;
    if (!ticket?.id || !live?.id || live.id !== ticket.id || !entity || typeof authRef.current !== 'function') return;
    const stored = commentsBelongToTicket(commentsFromStore(live.id), live);
    if (!force && stored.length && typeof hydrateRef.current === 'function') {
      hydrateRef.current(live.id, { comments: stored });
    }
    const hasLocal = stored.length > 0 || revisionEntriesFromTicket(live).length > 0;
    if (force || !hasLocal) setHydrating(true);
    setLoadError('');
    try {
      const res = await axios.get(`${ITSM_API}/itsm/reports/comments`, {
        params: {
          entity,
          instance_id: live.id,
          activity_instance_id: live.activityInstanceId || '',
          environment: environment || undefined,
          ...(force ? { _t: Date.now() } : {}),
        },
        ...authRef.current(),
      });
      const payload = res.data || {};
      const nextComments = Array.isArray(payload.comments) ? realCommentRows(payload.comments) : [];
      if (typeof hydrateRef.current === 'function') {
        hydrateRef.current(live.id, {
          ...payload,
          comments: commentsBelongToTicket(nextComments, live),
        });
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not refresh comments from Kissflow.'));
    } finally {
      setHydrating(false);
    }
  }, [ticket?.id, entity, environment]);

  React.useEffect(() => {
    loadComments();
  }, [loadComments]);

  React.useEffect(() => {
    if (autoFocus && allowCompose && inputRef.current) inputRef.current.focus();
  }, [autoFocus, allowCompose, ticket?.id]);

  React.useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [entries.length, commenting]);

  const send = async (text) => {
    const note = String(text || draft).trim();
    if (!note) {
      setError('Please enter a comment.');
      return;
    }
    setError('');
    try {
      await onSend(note);
      setDraft('');
      loadComments();
    } catch (err) {
      setError(err?.message || 'Unable to save comment.');
    }
  };

  const statusLabel = ticket.status && ticket.status !== '—' ? ticket.status : '';
  const stepLabel = ticket.currentStep || '';
  const entityLabel = ticket.entity || entity || '';
  const createdLabel = formatTicketDate(ticket.createdOn || ticket.createdAt);

  return (
    <div
      className="itsm-conversation w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
      data-testid={`itsm-revisions-${ticket.id}`}
    >
      <div className="border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {ticket.requestId && ticket.requestId !== '—' ? (
                <p className="text-sm font-semibold tracking-tight text-slate-900">{ticket.requestId}</p>
              ) : null}
              {statusLabel ? (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {statusLabel}
                </span>
              ) : null}
              {stepLabel ? (
                <span className="truncate text-[11px] text-slate-500">{stepLabel}</span>
              ) : null}
            </div>
            {ticket.description ? (
              <p className="mt-1 truncate text-sm text-slate-600">{ticket.description}</p>
            ) : null}
            <p className="mt-1 truncate text-[11px] text-slate-400">
              {[ticket.requesterName, entityLabel, createdLabel].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700">
              {entries.length}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                loadComments(true);
              }}
              disabled={hydrating}
              className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              aria-label="Refresh comments"
              data-testid={`itsm-comments-refresh-${ticket.id}`}
              title="Refresh comments from Kissflow"
            >
              <RefreshCw size={13} className={hydrating ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className={`itsm-thread ${entries.length ? 'max-h-80 overflow-y-auto' : ''} px-3 py-4 sm:px-5`}
      >
        {loadError ? <p className="relative z-[1] mb-2 text-center text-[11px] text-rose-600">{loadError}</p> : null}
        {!entries.length ? (
          <div className="relative z-[1] flex flex-col items-center justify-center px-4 py-8 text-center" data-testid={`itsm-revisions-empty-${ticket.id}`}>
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
              {hydrating ? <Loader2 size={20} className="animate-spin" /> : <MessageSquare size={20} />}
            </span>
            <p className="text-sm font-semibold text-slate-800">{hydrating ? 'Loading comments…' : 'No comments yet'}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
              {allowCompose
                ? 'Write a comment below to start this ticket thread with IT Support.'
                : 'Comments from you and IT Support will appear in this thread.'}
            </p>
          </div>
        ) : (
          <div className="relative z-[1]">
            {entries.map((entry, index) => {
            const mine = isMineMessage(entry, ticket, viewerName, viewerEmail);
            const isReopen = entry.role === 'reopen';
            const prev = entries[index - 1];
            const showDay =
              dayLabel(entry.dateTime) && dayLabel(entry.dateTime) !== dayLabel(prev?.dateTime);
            const author = displayAuthorName(entry, ticket);
            const name = mine && namesLooselyMatch(author, viewerName) ? 'You' : author;
            const prevMine = prev ? isMineMessage(prev, ticket, viewerName, viewerEmail) : false;
            const grouped = Boolean(prev)
              && !showDay
              && mine === prevMine
              && String(displayAuthorName(prev, ticket)).toLowerCase() === String(author).toLowerCase();
            const roleLabel = isReopen
              ? 'Reopened'
              : entry.role === 'employee'
                ? 'Requester'
                : 'IT Support';
            return (
              <React.Fragment key={`${entry.recordId}-${entry.timestamp}-${index}`}>
                {showDay ? (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {dayLabel(entry.dateTime)}
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                ) : null}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1.5' : 'mt-3'}`}>
                  <div className={`flex max-w-[85%] items-end gap-2 sm:max-w-[72%] ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {grouped ? (
                      <span className="h-7 w-7 shrink-0" aria-hidden />
                    ) : (
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold ${avatarTone(name, mine)}`}>
                        {initialsOf(name === 'You' ? viewerName || entry.userName : name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      {!grouped ? (
                        <p className={`mb-1 text-[11px] font-medium ${mine ? 'text-right text-teal-800' : 'text-left text-slate-500'}`}>
                          {name === 'You' ? 'You' : name}
                          <span className="font-normal text-slate-400"> · {roleLabel}</span>
                        </p>
                      ) : null}
                      <div
                        className={`whitespace-pre-wrap px-3 py-2 text-left text-sm leading-snug ${
                          isReopen
                            ? 'rounded-xl border-l-4 border-amber-500 bg-amber-50 text-amber-950'
                            : mine
                              ? 'rounded-xl border-r-4 border-teal-200 bg-teal-800 text-white'
                              : 'rounded-xl border border-slate-200 border-l-4 border-l-slate-400 bg-white text-slate-800'
                        }`}
                      >
                        {entry.comment}
                      </div>
                      {entry.dateTime ? (
                        <p className={`mt-1 text-[10px] text-slate-400 ${mine ? 'text-right' : 'text-left'}`}>
                          {formatRevisionDateTime(entry.dateTime)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          </div>
        )}
      </div>

      {allowCompose ? (
        <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={commenting}
                onClick={() => send(item.text)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              disabled={commenting}
              placeholder="Write a comment…"
              className="min-h-[48px] max-h-28 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              data-testid={`itsm-comment-note-${ticket.id}`}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={commenting || !draft.trim()}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-teal-800 px-3.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
              data-testid={`itsm-comment-send-${ticket.id}`}
              aria-label="Send comment"
            >
              {commenting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Send
            </button>
          </div>
          {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
          <p className="mt-1.5 text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
        </div>
      ) : (
        <p className="border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-500">
          {isReopenRelatedTicket(ticket) || showsEmployeeRating(ticket)
            ? 'Comments are disabled on reopened tickets.'
            : 'Replies open when this ticket is with IT on the work step.'}
        </p>
      )}
    </div>
  );
};

const EmployeeRatingStars = ({ ticket, ratingBusyId, onRate }) => {
  const value = Number(ticket.employeeRating) || 0;
  const locked = value >= 1;
  const busy = ratingBusyId === ticket.id;
  return (
    <div className="flex items-center gap-0.5" data-testid={`itsm-rating-${ticket.id}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={locked || busy}
            onClick={() => onRate(ticket, star)}
            className={`p-0.5 rounded ${locked || busy ? 'cursor-default' : 'hover:scale-110'}`}
            aria-label={locked ? `Rated ${value} of 5` : `Rate ${star} of 5`}
          >
            <Star
              size={16}
              className={filled ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}
            />
          </button>
        );
      })}
    </div>
  );
};

const ticketsCache = {
  entityKey: '',
  tickets: [],
  ticketIds: [],
  activeEnvironment: '',
  kissflowBaseUrl: '',
  fetchedAt: 0,
};

const TICKETS_CACHE_KEY = 'itsmTicketsCache.v8';
const COMMENTS_STORE_KEY = 'itsmCommentsStore.v1';
const commentsStore = new Map();
let ticketsInflight = null;

const ticketIdsFingerprint = (rows = []) =>
  [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.id || row?.localId || row || '').trim())
      .filter(Boolean)
  )].sort();

const sameTicketIdSet = (left = [], right = []) => {
  const a = ticketIdsFingerprint(left);
  const b = ticketIdsFingerprint(right);
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
};

const persistCommentsStore = () => {
  try {
    sessionStorage.setItem(COMMENTS_STORE_KEY, JSON.stringify([...commentsStore.entries()]));
  } catch {
    // ignore quota / private mode
  }
};

try {
  const storedComments = sessionStorage.getItem(COMMENTS_STORE_KEY);
  if (storedComments) {
    const parsed = JSON.parse(storedComments);
    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        const id = Array.isArray(entry) ? entry[0] : '';
        const rows = Array.isArray(entry) ? entry[1] : null;
        if (id && Array.isArray(rows) && rows.length) commentsStore.set(id, rows);
      });
    }
  }
} catch {
  // ignore
}

const commentsFromStore = (ticketId) => {
  if (!ticketId) return [];
  return realCommentRows(commentsStore.get(ticketId) || []);
};

const rememberComments = (ticketId, comments) => {
  const rows = realCommentRows(comments);
  if (!ticketId) return [];
  if (!rows.length) return commentsFromStore(ticketId);
  const merged = mergeCommentRows(rows, commentsFromStore(ticketId));
  commentsStore.set(ticketId, merged);
  persistCommentsStore();
  return merged;
};

const persistTicketsCache = () => {
  try {
    sessionStorage.setItem(
      TICKETS_CACHE_KEY,
      JSON.stringify({
        entityKey: ticketsCache.entityKey,
        tickets: ticketsCache.tickets,
        ticketIds: ticketsCache.ticketIds,
        activeEnvironment: ticketsCache.activeEnvironment,
        kissflowBaseUrl: ticketsCache.kissflowBaseUrl,
        fetchedAt: ticketsCache.fetchedAt,
      })
    );
  } catch {
    // ignore quota / private mode
  }
};

try {
  const raw = sessionStorage.getItem(TICKETS_CACHE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.entityKey) {
      ticketsCache.entityKey = parsed.entityKey;
      ticketsCache.tickets = Array.isArray(parsed.tickets) ? parsed.tickets : [];
      ticketsCache.ticketIds = Array.isArray(parsed.ticketIds)
        ? ticketIdsFingerprint(parsed.ticketIds)
        : ticketIdsFingerprint(ticketsCache.tickets);
      ticketsCache.activeEnvironment = parsed.activeEnvironment || '';
      ticketsCache.kissflowBaseUrl = parsed.kissflowBaseUrl || '';
      ticketsCache.fetchedAt = Number(parsed.fetchedAt) || 0;
      ticketsCache.tickets = ticketsCache.tickets.map((row) => {
        const ticketKey = row?.id || row?.localId;
        if (!ticketKey) return row;
        if (Array.isArray(row.agentSolutions) && row.agentSolutions.length) {
          rememberComments(ticketKey, row.agentSolutions);
        }
        const stored = commentsFromStore(ticketKey);
        const withComments = stored.length
          ? { ...row, agentSolutions: mergeCommentRows(realCommentRows(row.agentSolutions), stored) }
          : row;
        return lockCommentsIfReopened(withComments);
      });
    }
  }
} catch {
  // ignore
}

const hydrateFromCache = (entityKey) => {
  if (!entityKey || ticketsCache.entityKey !== entityKey) return null;
  return ticketsCache;
};

const formatRefreshClock = (fetchedAt) => {
  if (!fetchedAt) return 'Not loaded yet';
  return new Date(fetchedAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ITSMDashboard = () => {
  const { getAuthHeader, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const entity = useMemo(() => mergeItsmProfile(user).entity, [user]);
  const entityKey = (entity || '').trim().toLowerCase();
  const cached = hydrateFromCache(entityKey);

  const [tickets, setTickets] = useState(() => cached?.tickets || []);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState('');
  const [activeEnvironment, setActiveEnvironment] = useState(() => cached?.activeEnvironment || '');
  const [kissflowBaseUrl, setKissflowBaseUrl] = useState(() => cached?.kissflowBaseUrl || '');
  const [lastFetchedAt, setLastFetchedAt] = useState(() => cached?.fetchedAt || 0);
  const [refreshing, setRefreshing] = useState(false);
  const [reopeningId, setReopeningId] = useState('');
  const [statusTab, setStatusTab] = useState('Open');
  const [reopenTicketTarget, setReopenTicketTarget] = useState(null);
  const [reopenNote, setReopenNote] = useState('');
  const [reopenError, setReopenError] = useState('');
  const [ratingBusyId, setRatingBusyId] = useState('');
  const [commentingId, setCommentingId] = useState('');
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [composerTicketId, setComposerTicketId] = useState('');
  const viewerName = useMemo(() => (mergeItsmProfile(user).name || '').trim(), [user]);
  const viewerEmail = useMemo(() => (mergeItsmProfile(user).email || '').trim(), [user]);

  const applyCommentThread = (ticketId, payload) => {
    if (!ticketId || !payload) return;
    const authoritative = Array.isArray(payload.comments);
    const comments = authoritative ? realCommentRows(payload.comments) : [];
    setTickets((prev) => {
      const next = prev.map((row) => {
        if (row.id !== ticketId && row.localId !== ticketId) return row;
        const incoming = commentsBelongToTicket(comments, row);
        const existing = commentsBelongToTicket(
          mergeCommentRows(realCommentRows(row.agentSolutions), commentsFromStore(row.id)),
          row,
        );
        // Empty Kissflow GET is not proof the thread is empty (nested table is often
        // missing on instance GET). Never replace a real thread with [].
        const nextComments = incoming.length
          ? rememberComments(row.id, mergeCommentRows(incoming, existing))
          : rememberComments(row.id, existing);
        return {
          ...row,
          agentSolutions: nextComments.length ? nextComments : existing,
          requesterName: payload.requesterName || row.requesterName,
          requesterEmail: payload.requesterEmail || row.requesterEmail,
          currentStep: payload.currentStep || row.currentStep,
          activityInstanceId: payload.activityInstanceId || row.activityInstanceId,
          entity: payload.entity || row.entity,
          source: payload.source || row.source,
          location: payload.location || row.location,
        };
      });
      ticketsCache.tickets = next;
      persistTicketsCache();
      return next;
    });
  };

  const toggleExpanded = (ticketId) => {
    if (!ticketId) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };
  const fetchTickets = async ({ silent = false, force = false } = {}) => {
    if (!entity) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const key = entity.trim().toLowerCase();
    if (!key) {
      setLoading(false);
      setError('Your login profile does not include an entity. Contact admin.');
      setTickets([]);
      return;
    }

    const hasRows = ticketsCache.entityKey === key && ticketsCache.tickets.length > 0;
    if (hasRows) {
      setTickets(ticketsCache.tickets);
      setActiveEnvironment(ticketsCache.activeEnvironment);
      setKissflowBaseUrl(ticketsCache.kissflowBaseUrl);
      setLastFetchedAt(ticketsCache.fetchedAt);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    if (ticketsInflight) {
      try {
        await ticketsInflight;
        if (ticketsCache.entityKey === key) {
          setTickets(ticketsCache.tickets);
          setActiveEnvironment(ticketsCache.activeEnvironment);
          setKissflowBaseUrl(ticketsCache.kissflowBaseUrl);
          setLastFetchedAt(ticketsCache.fetchedAt);
        }
      } catch (err) {
        if (!ticketsCache.tickets.length) {
          setError(getApiErrorMessage(err, 'Unable to load tickets.'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    ticketsInflight = (async () => {
      // Count-first: if session cache matches Kissflow fingerprint, skip heavy /reports.
      if (hasRows && !force) {
        try {
          const countRes = await axios.get(`${ITSM_API}/itsm/reports/count`, {
            ...getAuthHeader(),
            params: { entity },
            timeout: 60000,
          });
          const remoteCount = Number(countRes.data?.count);
          const remoteEnv = countRes.data?.activeEnvironment || '';
          const remoteBase = countRes.data?.kissflowBaseUrl || '';
          const sameHost =
            ticketsCache.activeEnvironment === remoteEnv
            && ticketsCache.kissflowBaseUrl === remoteBase;
          const countMatch =
            Number.isFinite(remoteCount)
            && !countRes.data?.reportError
            && remoteCount === ticketsCache.tickets.length;
          // Kissflow `/count` returns only {"count":"N"} — match on count alone.
          if (sameHost && countMatch) {
            ticketsCache.fetchedAt = Date.now();
            ticketsCache.ticketIds = ticketIdsFingerprint(ticketsCache.tickets);
            persistTicketsCache();
            return {
              skippedFull: true,
              activeEnvironment: remoteEnv,
              kissflowBaseUrl: remoteBase,
              reportError: countRes.data?.reportError || null,
              count: remoteCount,
              tickets: ticketsCache.tickets,
            };
          }
        } catch (err) {
          // Count probe failed — fall through to full reports.
        }
      }

      const res = await axios.get(`${ITSM_API}/itsm/reports`, {
        ...getAuthHeader(),
        params: { entity },
        timeout: 90000,
      });
      const incoming = res.data.tickets || [];
      const incomingEnv = res.data.activeEnvironment || '';
      const incomingBase = res.data.kissflowBaseUrl || '';
      const sameHost =
        ticketsCache.entityKey === key
        && ticketsCache.activeEnvironment === incomingEnv
        && ticketsCache.kissflowBaseUrl === incomingBase;
      const previous = sameHost ? ticketsCache.tickets : [];
      const nextTickets = incoming.map((row) => {
        const prev = previous.find((item) => item.id === row.id || item.localId === row.localId);
        const ticketKey = row.id || row.localId;
        const nextComments = commentsBelongToTicket(realCommentRows(row.agentSolutions), row);
        const prevComments = commentsBelongToTicket(realCommentRows(prev?.agentSolutions), row);
        const storedComments = commentsBelongToTicket(commentsFromStore(ticketKey), row);
        const mergedComments = mergeCommentRows(nextComments, prevComments, storedComments);
        if (mergedComments.length) rememberComments(ticketKey, mergedComments);
        const remembered = Boolean(ticketKey && rememberedReopenedIds.has(String(ticketKey)));
        return lockCommentsIfReopened({
          ...row,
          reopened: Boolean(row.reopened || remembered),
          canComment: remembered || row.reopened ? false : row.canComment,
          assignedTo: formatAssignedToDisplay(row.assignedTo || prev?.assignedTo),
          agentSolutions: mergedComments,
          requesterName: row.requesterName || prev?.requesterName,
          requesterEmail: row.requesterEmail || prev?.requesterEmail,
        });
      });
      const nextEnv = res.data.activeEnvironment || '';
      const nextBase = res.data.kissflowBaseUrl || '';
      const fetchedAt = Date.now();
      ticketsCache.entityKey = key;
      ticketsCache.tickets = nextTickets;
      ticketsCache.ticketIds = ticketIdsFingerprint(nextTickets);
      ticketsCache.activeEnvironment = nextEnv;
      ticketsCache.kissflowBaseUrl = nextBase;
      ticketsCache.fetchedAt = fetchedAt;
      persistTicketsCache();
      return res.data;
    })();

    try {
      const data = await ticketsInflight;
      setTickets(ticketsCache.tickets);
      setActiveEnvironment(ticketsCache.activeEnvironment);
      setKissflowBaseUrl(ticketsCache.kissflowBaseUrl);
      setLastFetchedAt(ticketsCache.fetchedAt);
      if (data?.reportError) {
        toast.error(`Kissflow report: ${data.reportError}`);
      }
    } catch (err) {
      if (!ticketsCache.tickets.length) {
        setTickets([]);
        setActiveEnvironment('');
        setKissflowBaseUrl('');
      }
      setError(getApiErrorMessage(err, 'Unable to load tickets.'));
    } finally {
      ticketsInflight = null;
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    if (!entityKey) {
      setLoading(false);
      return;
    }
    const shouldRefresh = Boolean(location.state?.refreshTickets);
    if (shouldRefresh && location.state) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    const hasCache = ticketsCache.entityKey === entityKey && ticketsCache.tickets.length > 0;
    fetchTickets({
      // First visit / after create: full load. Returning with cache: count-first.
      force: shouldRefresh || !hasCache,
      silent: hasCache && !shouldRefresh,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  React.useEffect(() => {
    const maybeRefresh = () => {
      if (!entityKey) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // Count-first on focus — full /reports only when Kissflow count/ids changed.
      fetchTickets({ force: false, silent: true });
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  const kpis = useMemo(() => {
    const counts = { All: tickets.length, Open: 0, SlaBreached: 0, Closed: 0 };
    tickets.forEach((ticket) => {
      if (matchesKpiFilter(ticket, 'Open')) counts.Open += 1;
      if (matchesKpiFilter(ticket, 'Closed')) counts.Closed += 1;
      if (ticket.slaBreached) counts.SlaBreached += 1;
    });
    return counts;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const tab = statusTab === 'Reopened' ? 'Open' : statusTab;
    return tickets.filter((ticket) => matchesKpiFilter(ticket, tab));
  }, [tickets, statusTab]);

  React.useEffect(() => {
    if (statusTab === 'Reopened') setStatusTab('Open');
  }, [statusTab]);

  const openReopenDialog = (ticket) => {
    if (!ticket?.id || !ticketAllowsReopen(ticket)) return;
    setReopenTicketTarget(ticket);
    setReopenNote('');
    setReopenError('');
  };

  const closeReopenDialog = () => {
    if (reopeningId) return;
    setReopenTicketTarget(null);
    setReopenNote('');
    setReopenError('');
  };

  const submitReopen = async () => {
    const ticket = reopenTicketTarget;
    const note = reopenNote.trim();
    if (!ticket?.id || !ticketAllowsReopen(ticket)) return;
    if (!note) {
      setReopenError('Please enter why you need to reopen this ticket.');
      return;
    }
    setReopeningId(ticket.id);
    setReopenError('');
    try {
      const res = await axios.post(
        `${ITSM_API}/itsm/reports/reopen`,
        {
          entity,
          instance_id: ticket.id,
          activity_instance_id: ticket.activityInstanceId || '',
          // Optional hint only — backend resolves IT Agent `_id` for Kissflow body.
          sendback_id:
            ticket.sendbackId &&
            ticket.sendbackId !== ticket.id &&
            ticket.sendbackId !== ticket.activityInstanceId
              ? ticket.sendbackId
              : '',
          note,
        },
        getAuthHeader()
      );
      toast.success(res.data.message || `Reopened ${ticket.requestId || 'ticket'}`);
      rememberReopenedTicket(ticket.id);
      setReopenTicketTarget(null);
      setReopenNote('');
      await fetchTickets({ force: true, silent: true });
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to reopen ticket.');
      setReopenError(message);
      toast.error(message);
    } finally {
      setReopeningId('');
    }
  };

  const openConversation = (ticket) => {
    const rowId = ticket?.id || ticket?.localId;
    if (!rowId) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
    if (canCommentTicket(ticket, entity)) setComposerTicketId(rowId);
  };

  const submitCommentForTicket = async (ticket, rawNote) => {
    const note = String(rawNote || '').trim();
    if (!ticket?.id || !canCommentTicket(ticket, entity)) {
      throw new Error('Comments are not available on this step.');
    }
    if (!note) throw new Error('Please enter a comment.');
    setCommentingId(ticket.id);
    const optimisticId = `local-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      recordId: optimisticId,
      userName: viewerName || 'You',
      comment: note,
      resolution: note,
      dateTime: new Date().toISOString(),
      stages: 'InProgress',
      role: 'employee',
    };
    setTickets((prev) => {
      const next = prev.map((row) =>
        row.id === ticket.id
          ? { ...row, agentSolutions: [...(Array.isArray(row.agentSolutions) ? row.agentSolutions : []), optimistic] }
          : row
      );
      ticketsCache.tickets = next;
      persistTicketsCache();
      return next;
    });
    setExpandedIds((prev) => new Set(prev).add(ticket.id));
    try {
      const res = await axios.post(
        `${ITSM_API}/itsm/reports/comment`,
        {
          entity,
          instance_id: ticket.id,
          activity_instance_id: ticket.activityInstanceId || '',
          comment: note,
          commenter_name: viewerName || undefined,
          environment: activeEnvironment || undefined,
        },
        getAuthHeader()
      );
      toast.success(res.data.message || 'Comment sent');
      if (Array.isArray(res.data.comments) && res.data.comments.length) {
        applyCommentThread(ticket.id, res.data);
      }
      await fetchTickets({ force: true, silent: true });
    } catch (err) {
      setTickets((prev) => {
        const next = prev.map((row) =>
          row.id === ticket.id
            ? {
                ...row,
                agentSolutions: (Array.isArray(row.agentSolutions) ? row.agentSolutions : []).filter(
                  (item) => item.id !== optimisticId && item.recordId !== optimisticId
                ),
              }
            : row
        );
        ticketsCache.tickets = next;
        persistTicketsCache();
        return next;
      });
      throw new Error(getApiErrorMessage(err, 'Unable to save comment.'));
    } finally {
      setCommentingId('');
    }
  };

  const submitRating = async (ticket, rating) => {
    if (!ticket?.id || !ticketAllowsReopen(ticket) || ticket.employeeRating) return;
    setRatingBusyId(ticket.id);
    try {
      const res = await axios.post(
        `${ITSM_API}/itsm/reports/rating`,
        {
          entity,
          instance_id: ticket.id,
          activity_instance_id: ticket.activityInstanceId || '',
          rating,
        },
        getAuthHeader()
      );
      const saved = Number(res.data.rating) || rating;
      setTickets((prev) => {
        const next = prev.map((row) => (row.id === ticket.id ? { ...row, employeeRating: saved } : row));
        ticketsCache.tickets = next;
        persistTicketsCache();
        return next;
      });
      toast.success('Thanks for your rating');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Unable to save rating.'));
    } finally {
      setRatingBusyId('');
    }
  };

  const renderTicketTable = (rows) => (
    <>
      {/* Desktop only — tablets use cards (md table was too cramped). */}
      <div className="hidden xl:block overflow-x-auto">
        <table
          className="data-table itsm-mis-table min-w-[1220px]"
          data-testid="itsm-ticket-table"
        >
          <thead>
            <tr>
              <th className="w-10 !px-2" aria-label="Expand" />
              <th className="w-[200px]">Request ID</th>
              <th className="w-[280px]">Description</th>
              <th className="w-[120px]">Created On</th>
              <th className="w-[150px]">Assigned To</th>
              <th className="w-[160px]">Status</th>
              <th className="w-[140px]">Closed By</th>
              <th className="w-[120px]">Closed On</th>
              <th className="w-[130px] text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ticket) => {
              const rowId = ticket.id || ticket.localId;
              const expanded = expandedIds.has(rowId);
              const showCommentSection = canShowTicketComments(entity, ticket);
              const showComment =
                canCommentTicket(ticket, entity)
                && !showsEmployeeRating(ticket)
                && !isReopenRelatedTicket(ticket);
              const requestId = ticket.requestId || '—';
              const description = ticket.description || '—';
              return (
                <React.Fragment key={rowId}>
                  <tr>
                    <td className="!px-2">
                      {showCommentSection ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(rowId)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Collapse conversation' : 'Expand conversation'}
                          data-testid={`itsm-expand-${rowId}`}
                        >
                          <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                      ) : null}
                    </td>
                    <td className="font-medium text-slate-900 whitespace-nowrap" title={requestId}>
                      {requestId}
                    </td>
                    <td className="text-slate-600" title={description}>
                      {description}
                    </td>
                    <td className="text-slate-600 whitespace-nowrap">{formatTicketDate(ticket.createdOn)}</td>
                    <td className="text-slate-700" title={formatAssignedToDisplay(ticket.assignedTo)}>
                      {formatAssignedToDisplay(ticket.assignedTo)}
                    </td>
                    <td className="!whitespace-normal">
                      <TicketStatusTags ticket={ticket} />
                    </td>
                    <td className="text-slate-700" title={ticket.closedBy || ''}>
                      {ticket.closedBy || '—'}
                    </td>
                    <td className="text-slate-600 whitespace-nowrap">{formatTicketDate(ticket.closedOn)}</td>
                    <td className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        {showComment ? (
                          <button
                            type="button"
                            onClick={() => openConversation(ticket)}
                            disabled={commentingId === ticket.id}
                            className="btn-secondary !py-1.5 !px-3 text-xs"
                            data-testid={`itsm-comment-${ticket.id}`}
                          >
                            {commentingId === ticket.id ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                            Reply
                          </button>
                        ) : null}
                        {ticketAllowsReopen(ticket) || Number(ticket.employeeRating) >= 1 ? (
                          <>
                            <EmployeeRatingStars ticket={ticket} ratingBusyId={ratingBusyId} onRate={submitRating} />
                            {ticketAllowsReopen(ticket) ? (
                            <button
                              type="button"
                              onClick={() => openReopenDialog(ticket)}
                              disabled={reopeningId === ticket.id}
                              className="btn-secondary !py-1.5 !px-3 text-xs"
                              data-testid={`itsm-reopen-${ticket.id}`}
                            >
                              {reopeningId === ticket.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                              Reopen
                            </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded && showCommentSection ? (
                    <tr className="bg-slate-50/80">
                      <td colSpan={9} className="itsm-conversation-cell !p-3 sm:!p-4 border-t border-slate-100">
                        <TicketConversation
                          ticket={ticket}
                          entity={entity}
                          environment={activeEnvironment}
                          getAuthHeader={getAuthHeader}
                          viewerName={viewerName}
                          viewerEmail={viewerEmail}
                          canComment={showComment}
                          commenting={commentingId === ticket.id}
                          autoFocus={composerTicketId === rowId}
                          onSend={(note) => submitCommentForTicket(ticket, note)}
                          onHydrated={applyCommentThread}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="xl:hidden space-y-3 p-3" data-testid="itsm-ticket-cards">
        {rows.map((ticket) => {
          const rowId = ticket.id || ticket.localId;
          const expanded = expandedIds.has(rowId);
          const showCommentSection = canShowTicketComments(entity, ticket);
          const showComment =
            canCommentTicket(ticket, entity)
            && !showsEmployeeRating(ticket)
            && !isReopenRelatedTicket(ticket);
          return (
            <div key={rowId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="font-semibold text-slate-900 text-sm break-all">{ticket.requestId || '—'}</p>
                <TicketStatusTags ticket={ticket} size="sm" />
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap mb-2">{ticket.description || '—'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 mb-3">
                <p className="text-xs text-slate-500">Created On: {formatTicketDate(ticket.createdOn)}</p>
                <p className="text-xs text-slate-500">Assigned To: {formatAssignedToDisplay(ticket.assignedTo)}</p>
                <p className="text-xs text-slate-500">Closed By: {ticket.closedBy || '—'}</p>
                <p className="text-xs text-slate-500">Closed On: {formatTicketDate(ticket.closedOn)}</p>
                {ticket.currentStep ? (
                  <p className="text-xs text-slate-500 sm:col-span-2">Step: {ticket.currentStep}</p>
                ) : null}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {showCommentSection ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(rowId)}
                    className="btn-secondary w-full sm:w-auto"
                    data-testid={`itsm-expand-mobile-${rowId}`}
                  >
                    <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    {expanded ? 'Hide chat' : 'Conversation'}
                  </button>
                ) : null}
                {showComment ? (
                  <button
                    type="button"
                    onClick={() => openConversation(ticket)}
                    disabled={commentingId === ticket.id}
                    className="btn-secondary w-full sm:w-auto"
                    data-testid={`itsm-comment-mobile-${ticket.id}`}
                  >
                    {commentingId === ticket.id ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                    Reply
                  </button>
                ) : null}
                {ticketAllowsReopen(ticket) || Number(ticket.employeeRating) >= 1 ? (
                  <div className="space-y-2 w-full">
                    <EmployeeRatingStars ticket={ticket} ratingBusyId={ratingBusyId} onRate={submitRating} />
                    {ticketAllowsReopen(ticket) ? (
                    <button
                      type="button"
                      onClick={() => openReopenDialog(ticket)}
                      disabled={reopeningId === ticket.id}
                      className="btn-secondary w-full"
                      data-testid={`itsm-reopen-mobile-${ticket.id}`}
                    >
                      {reopeningId === ticket.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Reopen
                    </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {expanded && showCommentSection ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <TicketConversation
                    ticket={ticket}
                    entity={entity}
                    environment={activeEnvironment}
                    getAuthHeader={getAuthHeader}
                    viewerName={viewerName}
                    viewerEmail={viewerEmail}
                    canComment={showComment}
                    commenting={commentingId === ticket.id}
                    autoFocus={composerTicketId === rowId}
                    onSend={(note) => submitCommentForTicket(ticket, note)}
                    onHydrated={applyCommentThread}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="animate-fadeIn w-full pb-8" data-testid="itsm-dashboard-page">
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 mb-5">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />
        <div className="relative px-4 py-4 sm:px-7 sm:py-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate('/launcher')}
              className="p-2 rounded-xl border border-emerald-200/80 bg-white/80 text-slate-600 hover:bg-white hover:border-emerald-300 transition-colors shrink-0"
              aria-label="Back to launcher"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm shrink-0">
              <Headphones size={22} className="text-emerald-600" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
                  IT Help Desk
                </h1>
                {activeEnvironment && (
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      activeEnvironment === 'live'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                    title={kissflowBaseUrl || activeEnvironment}
                  >
                    {activeEnvironment === 'live' ? 'Live' : 'Dev'}
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-sm mt-0.5 font-medium">My tickets</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap md:justify-end shrink-0">
            {entity && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-200/70 text-emerald-800 text-sm font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {entity}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchTickets({ force: true })}
              disabled={loading || refreshing}
              className="btn-secondary !px-3"
              aria-label="Refresh tickets"
              title={lastFetchedAt ? `Last refreshed ${formatRefreshClock(lastFetchedAt)}` : 'Refresh tickets'}
            >
              <RefreshCw size={16} className={loading || refreshing ? 'animate-spin' : ''} />
            </button>
            {entity ? (
              <span className="text-[11px] text-slate-500 leading-tight" data-testid="itsm-last-refresh">
                {refreshing ? 'Refreshing…' : `Last refresh ${formatRefreshClock(lastFetchedAt)}`}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/itsm/new')}
              className="btn-primary"
              data-testid="itsm-new-request"
            >
              <Plus size={16} />
              Create Ticket
            </button>
          </div>
        </div>
      </div>

      {!entity ? (
        <div className="card-default p-6 text-center">
          <p className="text-sm text-slate-600 mb-4">Set your entity in personal details to view tickets.</p>
          <button type="button" onClick={() => navigate('/itsm/new')} className="btn-primary">
            Open IT Request Form
          </button>
        </div>
      ) : error && !loading ? (
        <div className="card-default p-6 text-center border-red-200">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button type="button" onClick={() => fetchTickets({ force: true })} className="btn-primary">
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {KPI_CARDS.map((card) => {
              const tone = KPI_TONE[card.tone] || KPI_TONE.blue;
              const Icon = card.icon;
              const active = statusTab === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setStatusTab(card.key)}
                  className={`relative overflow-hidden rounded-2xl border bg-white text-left p-3 min-h-[100px] md:min-h-[112px] transition ${
                    active
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                      : 'border-slate-200 hover:shadow-md'
                  }`}
                  data-testid={`itsm-kpi-${card.key}`}
                >
                  <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.wash}`} />
                  <div className="relative z-10">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-white ${tone.iconBg}`}>
                      <Icon size={12} strokeWidth={2.25} />
                    </span>
                    <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {card.label}
                    </p>
                    <p className={`mt-1 text-2xl font-bold tabular-nums leading-none ${tone.value}`}>
                      {loading ? 0 : (kpis[card.key] ?? 0)}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{card.sub}</p>
                  </div>
                </button>
              );
            })}
          </section>

          <div className="card-default overflow-hidden">
            <div className="px-4 py-4 sm:px-5 border-b border-slate-100">
              <h2 className="font-heading text-base font-semibold text-slate-900">
                {TABLE_TITLES[statusTab] || 'My Requests'}
              </h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-emerald-600" size={28} />
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-10 text-center">
                <ClipboardList className="mx-auto text-slate-300 mb-3" size={36} />
                <h3 className="font-heading text-lg font-semibold text-slate-800 mb-1">No tickets yet</h3>
                <p className="text-sm text-slate-500 mb-4">Raise an IT request and it will appear here.</p>
                <button type="button" onClick={() => navigate('/itsm/new')} className="btn-primary">
                  Create IT Request
                </button>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-10 text-center">
                <ClipboardList className="mx-auto text-slate-300 mb-3" size={36} />
                <h3 className="font-heading text-lg font-semibold text-slate-800 mb-1">No tickets in this view</h3>
                <p className="text-sm text-slate-500">Try another KPI card to see matching requests.</p>
              </div>
            ) : (
              renderTicketTable(filteredTickets)
            )}
          </div>
        </>
      )}

      <Dialog open={Boolean(reopenTicketTarget)} onOpenChange={(open) => { if (!open) closeReopenDialog(); }}>
        <DialogContent className="sm:max-w-md" data-testid="itsm-reopen-dialog">
          <DialogHeader>
            <DialogTitle>Why do you need to reopen this?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            {reopenTicketTarget?.requestId ? `Request ${reopenTicketTarget.requestId}` : 'This ticket'} will be sent back to IT support.
          </p>
          <textarea
            value={reopenNote}
            onChange={(e) => {
              setReopenNote(e.target.value);
              if (reopenError) setReopenError('');
            }}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            placeholder="Enter the reason to reopen"
            data-testid="itsm-reopen-note"
          />
          {reopenError ? <p className="text-sm text-red-600">{reopenError}</p> : null}
          <DialogFooter>
            <button type="button" className="btn-secondary" onClick={closeReopenDialog} disabled={Boolean(reopeningId)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={submitReopen} disabled={Boolean(reopeningId)} data-testid="itsm-reopen-submit">
              {reopeningId ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reopen Ticket
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ITSMDashboard;
