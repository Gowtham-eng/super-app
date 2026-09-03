import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ITSM_API } from '../config/api';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import { mapEntityFromUser } from '../utils/itsmEntity';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ClockAlert,
  FolderOpen,
  Headphones,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Ticket,
} from 'lucide-react';

const KPI_CARDS = [
  { key: 'All', label: 'All Tickets', sub: 'All your requests', icon: Ticket, tone: 'blue' },
  { key: 'Open', label: 'Open Tickets', sub: 'Currently open', icon: FolderOpen, tone: 'blue' },
  { key: 'SlaBreached', label: 'SLA Breached', sub: 'SLA breached tickets', icon: ClockAlert, tone: 'red' },
  { key: 'Closed', label: 'Closed Tickets', sub: 'Successfully completed', icon: CheckCircle2, tone: 'green' },
  { key: 'Reopened', label: 'Reopened Tickets', sub: 'Sent back to agent', icon: RotateCcw, tone: 'orange' },
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
  Reopened: 'Reopened Tickets',
};

const formatTicketDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  return `${day} ${month} ${d.getFullYear()}`;
};

const resolveEntity = (user) => mapEntityFromUser(user);

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

const ticketStatusKey = (ticket) => (ticket?.status || '').toLowerCase();

const matchesKpiFilter = (ticket, tab) => {
  const status = ticketStatusKey(ticket);
  const isReopened = Boolean(ticket.reopened);
  if (tab === 'All') return true;
  if (tab === 'SlaBreached') return Boolean(ticket.slaBreached);
  if (tab === 'Reopened') return isReopened;
  if (tab === 'Closed') {
    return !isReopened && (status.includes('closed') || status.includes('completed') || status.includes('reject'));
  }
  if (tab === 'Open') {
    return (
      !isReopened &&
      !status.includes('fail') &&
      !status.includes('closed') &&
      !status.includes('completed') &&
      !status.includes('reject')
    );
  }
  return true;
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

const ITSMDashboard = () => {
  const { getAuthHeader, user } = useAuth();
  const navigate = useNavigate();
  const entity = useMemo(() => resolveEntity(user), [user]);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeEnvironment, setActiveEnvironment] = useState('');
  const [kissflowBaseUrl, setKissflowBaseUrl] = useState('');
  const [reopeningId, setReopeningId] = useState('');
  const [statusTab, setStatusTab] = useState('Open');
  const [reopenTicketTarget, setReopenTicketTarget] = useState(null);
  const [reopenNote, setReopenNote] = useState('');
  const [reopenError, setReopenError] = useState('');
  const [ratingBusyId, setRatingBusyId] = useState('');

  const fetchTickets = async () => {
    if (!entity) {
      setLoading(false);
      setTickets([]);
      return;
    }
    const key = entity.trim().toLowerCase();
    if (!key) {
      setLoading(false);
      setError('Your login profile does not include an entity. Contact admin.');
      setTickets([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${ITSM_API}/itsm/reports`, {
        ...getAuthHeader(),
        params: { entity },
      });
      setTickets(res.data.tickets || []);
      setActiveEnvironment(res.data.activeEnvironment || '');
      setKissflowBaseUrl(res.data.kissflowBaseUrl || '');
      if (res.data.reportError) {
        toast.error(`Kissflow report: ${res.data.reportError}`);
      }
    } catch (err) {
      setTickets([]);
      setActiveEnvironment('');
      setKissflowBaseUrl('');
      setError(getApiErrorMessage(err, 'Unable to load tickets.'));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  React.useEffect(() => {
    const onFocus = () => {
      if (entity) fetchTickets();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const kpis = useMemo(() => {
    const counts = { All: tickets.length, Open: 0, SlaBreached: 0, Closed: 0, Reopened: 0 };
    tickets.forEach((ticket) => {
      if (matchesKpiFilter(ticket, 'Open')) counts.Open += 1;
      if (matchesKpiFilter(ticket, 'Closed')) counts.Closed += 1;
      if (matchesKpiFilter(ticket, 'Reopened')) counts.Reopened += 1;
      if (ticket.slaBreached) counts.SlaBreached += 1;
    });
    return counts;
  }, [tickets]);

  const filteredTickets = useMemo(
    () => tickets.filter((ticket) => matchesKpiFilter(ticket, statusTab)),
    [tickets, statusTab]
  );

  const openReopenDialog = (ticket) => {
    if (!ticket?.id || !ticket.canReopen) return;
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
    if (!ticket?.id || !ticket.canReopen) return;
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
      setReopenTicketTarget(null);
      setReopenNote('');
      await fetchTickets();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to reopen ticket.');
      setReopenError(message);
      toast.error(message);
    } finally {
      setReopeningId('');
    }
  };

  const submitRating = async (ticket, rating) => {
    if (!ticket?.id || !ticket.canReopen || ticket.employeeRating) return;
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
      setTickets((prev) =>
        prev.map((row) => (row.id === ticket.id ? { ...row, employeeRating: saved } : row))
      );
      toast.success('Thanks for your rating');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Unable to save rating.'));
    } finally {
      setRatingBusyId('');
    }
  };

  const renderTicketTable = (rows) => (
    <>
      <div className="hidden md:block overflow-x-auto">
            <table className="data-table" data-testid="itsm-ticket-table">
          <thead>
            <tr>
              <th className="w-[140px]">Request ID</th>
              <th>Description</th>
              <th className="w-[120px]">Created On</th>
              <th className="w-[150px]">Assigned To</th>
              <th className="w-[120px]">Status</th>
              <th className="w-[150px]">Closed By</th>
              <th className="w-[120px]">Closed On</th>
              <th className="w-[180px] text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ticket) => (
              <tr key={ticket.id || ticket.localId}>
                <td className="font-medium text-slate-900">{ticket.requestId || '—'}</td>
                <td className="text-slate-600 whitespace-normal">{ticket.description || '—'}</td>
                <td className="text-slate-600 whitespace-nowrap">{formatTicketDate(ticket.createdOn)}</td>
                <td className="text-slate-700 whitespace-normal">{ticket.assignedTo || '—'}</td>
                <td>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadgeClass(ticket.status)}`}>
                    {ticket.status || '—'}
                  </span>
                </td>
                <td className="text-slate-700 whitespace-normal">{ticket.closedBy || '—'}</td>
                <td className="text-slate-600 whitespace-nowrap">{formatTicketDate(ticket.closedOn)}</td>
                <td className="text-right">
                  {ticket.canReopen ? (
                    <div className="flex flex-col items-end gap-2">
                      <EmployeeRatingStars ticket={ticket} ratingBusyId={ratingBusyId} onRate={submitRating} />
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
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3 p-3" data-testid="itsm-ticket-cards">
        {rows.map((ticket) => (
          <div key={ticket.id || ticket.localId} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="font-semibold text-slate-900 text-sm break-all">{ticket.requestId || '—'}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${statusBadgeClass(ticket.status)}`}>
                {ticket.status || '—'}
              </span>
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-wrap mb-2">{ticket.description || '—'}</p>
            <p className="text-xs text-slate-500 mb-1">Created On: {formatTicketDate(ticket.createdOn)}</p>
            <p className="text-xs text-slate-500 mb-1">Assigned To: {ticket.assignedTo || '—'}</p>
            <p className="text-xs text-slate-500 mb-1">Closed By: {ticket.closedBy || '—'}</p>
            <p className="text-xs text-slate-500 mb-3">Closed On: {formatTicketDate(ticket.closedOn)}</p>
            {ticket.canReopen ? (
              <div className="space-y-2">
                <EmployeeRatingStars ticket={ticket} ratingBusyId={ratingBusyId} onRate={submitRating} />
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
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="animate-fadeIn w-full pb-8" data-testid="itsm-dashboard-page">
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 mb-5">
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />
        <div className="relative px-5 py-5 sm:px-7 sm:py-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate('/launcher')}
              className="p-2 rounded-xl border border-emerald-200/80 bg-white/80 text-slate-600 hover:bg-white hover:border-emerald-300 transition-colors shrink-0"
              aria-label="Back to launcher"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm shrink-0">
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
          <div className="flex items-center gap-2 sm:justify-end">
            {entity && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-200/70 text-emerald-800 text-sm font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {entity}
              </span>
            )}
            <button
              type="button"
              onClick={fetchTickets}
              disabled={loading}
              className="btn-secondary !px-3"
              aria-label="Refresh tickets"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/itsm/new')}
              className="btn-primary"
              data-testid="itsm-new-request"
            >
              <Plus size={16} />
              New Request
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
          <button type="button" onClick={fetchTickets} className="btn-primary">
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {KPI_CARDS.map((card) => {
              const tone = KPI_TONE[card.tone] || KPI_TONE.blue;
              const Icon = card.icon;
              const active = statusTab === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setStatusTab(card.key)}
                  className={`relative overflow-hidden rounded-2xl border bg-white text-left p-3 min-h-[112px] transition ${
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
