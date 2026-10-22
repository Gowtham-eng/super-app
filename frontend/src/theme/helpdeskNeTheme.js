/**
 * Refex One Tech Helpdesk chrome (create + dashboard only).
 * Does not change login, launcher, or AuthContext.
 *
 * Revert UI: set `export const HELPDESK_THEME = HELPDESK_THEME_CLASSIC`.
 */
import './helpdeskNeTheme.css';

export const HELPDESK_THEME_CLASSIC = {
  pageWrap: 'helpdesk-theme helpdesk-theme-classic',
  hero: 'relative overflow-hidden rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 mb-5',
  heroBlobA: 'absolute -top-12 -right-12 w-56 h-56 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none',
  heroBlobB: 'absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-teal-100/30 blur-3xl pointer-events-none',
  backBtn: 'p-2 rounded-xl border border-emerald-200/80 bg-white/80 text-slate-600 hover:bg-white hover:border-emerald-300 transition-colors shrink-0',
  heroIconWrap: 'rounded-2xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm shrink-0',
  heroIcon: 'text-emerald-600',
  entityChip: 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-200/70 text-emerald-800 text-sm font-medium',
  entityDot: 'w-1.5 h-1.5 rounded-full bg-emerald-500',
  kpiActive: 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-md',
  loader: 'text-emerald-600',
  accentIcon: 'text-emerald-600',
  accentSoft: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  toggleActive: 'bg-white text-emerald-800 shadow-sm border border-emerald-100',
  dropzone: 'w-full rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-8 text-center hover:bg-emerald-50 transition-colors',
  dropzoneTitle: 'text-sm font-semibold text-emerald-800',
  highlightCard: 'border-emerald-200 bg-emerald-50/50',
  highlightIconWrap: 'bg-emerald-100',
  commentMine: 'bg-teal-800 text-teal-50',
  commentBubbleMine: 'rounded-xl border-r-4 border-teal-200 bg-teal-800 text-white',
  commentNameMine: 'text-right text-teal-800',
  commentFocus: 'focus:border-teal-600 focus:ring-2 focus:ring-teal-100',
  sendBtn: 'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-teal-800 px-3.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40',
  inputFocus: 'focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100',
  kpiTone: {
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
  },
};

export const HELPDESK_THEME_NE = {
  pageWrap: 'helpdesk-theme helpdesk-theme-ne',
  hero: 'relative overflow-hidden rounded-2xl border-2 border-[#D0E0F5] bg-gradient-to-br from-[#eef6ff] via-white to-[#e8f3ff] mb-5',
  heroBlobA: 'absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[#dce8fa]/70 blur-3xl pointer-events-none',
  heroBlobB: 'absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-[#e8f3ff]/80 blur-3xl pointer-events-none',
  backBtn: 'p-2 rounded-xl border border-[#D0E0F5] bg-white/80 text-slate-600 hover:bg-white hover:border-[#93c5fd] transition-colors shrink-0',
  heroIconWrap: 'rounded-2xl bg-white border-2 border-[#D0E0F5] flex items-center justify-center shadow-sm shrink-0',
  heroIcon: 'text-[#0f6cbd]',
  entityChip: 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF2FF] border border-[#D0E0F5] text-[#0d5ea8] text-sm font-medium',
  entityDot: 'w-1.5 h-1.5 rounded-full bg-[#0f6cbd]',
  kpiActive: 'border-[#0f6cbd] ring-2 ring-[#0f6cbd]/25 shadow-md',
  loader: 'text-[#0f6cbd]',
  accentIcon: 'text-[#0f6cbd]',
  accentSoft: 'bg-[#EAF2FF] border-[#D0E0F5] text-[#0d5ea8]',
  toggleActive: 'bg-white text-[#0d5ea8] shadow-sm border border-[#D0E0F5]',
  dropzone: 'w-full rounded-xl border-2 border-dashed border-[#D0E0F5] bg-[#eef6ff]/70 px-4 py-8 text-center hover:bg-[#EAF2FF] transition-colors',
  dropzoneTitle: 'text-sm font-semibold text-[#0d5ea8]',
  highlightCard: 'border-[#D0E0F5] bg-[#eef6ff]/80',
  highlightIconWrap: 'bg-[#EAF2FF]',
  commentMine: 'bg-[#0f6cbd] text-sky-50',
  commentBubbleMine: 'rounded-xl border-r-4 border-[#93c5fd] bg-[#0f6cbd] text-white',
  commentNameMine: 'text-right text-[#0d5ea8]',
  commentFocus: 'focus:border-[#0f6cbd] focus:ring-2 focus:ring-[#0f6cbd]/15',
  sendBtn: 'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[#0f6cbd] px-3.5 text-sm font-semibold text-white hover:bg-[#0d5ea8] disabled:opacity-40',
  inputFocus: 'focus:border-[#0f6cbd] focus:ring-2 focus:ring-[#0f6cbd]/15',
  kpiTone: {
    blue: {
      wash: 'from-sky-50/90 via-white to-indigo-50/70',
      value: 'text-[#0d5ea8]',
      iconBg: 'bg-[#0f6cbd]',
    },
    green: {
      wash: 'from-emerald-50/90 via-white to-green-50/70',
      value: 'text-emerald-700',
      iconBg: 'bg-[#22C55E]',
    },
    orange: {
      wash: 'from-orange-50/90 via-white to-amber-50/70',
      value: 'text-orange-700',
      iconBg: 'bg-[#F97316]',
    },
    red: {
      wash: 'from-rose-50/90 via-white to-red-50/70',
      value: 'text-red-700',
      iconBg: 'bg-[#EF4444]',
    },
  },
};

/** Active helpdesk chrome. Revert with HELPDESK_THEME_CLASSIC. */
export const HELPDESK_THEME = HELPDESK_THEME_NE;
