import React, { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';

const RESULT_LIMIT = 40;

const UserAssignPicker = ({ users = [], assignedUsers = [], onAssign, testId = 'assign-user-select' }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const available = useMemo(() => {
    const assigned = new Set(assignedUsers.map((u) => u.id));
    return users.filter((u) => u?.id && !assigned.has(u.id));
  }, [users, assignedUsers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? available.filter((u) => {
          const name = String(u.name || '').toLowerCase();
          const email = String(u.email || '').toLowerCase();
          return name.includes(q) || email.includes(q);
        })
      : available;
    return matches.slice(0, RESULT_LIMIT);
  }, [available, query]);

  const pick = (userId) => {
    onAssign(userId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative mt-1">
      <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search by name or email..."
        className="input-brutalist w-full pl-9"
        data-testid={testId}
        autoComplete="off"
      />
      {open && (
        <div
          className="mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-sm"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">No matching users</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pick(u.id)}
                className="w-full text-left px-3 py-2 hover:bg-violet-50 border-b border-slate-50 last:border-0"
                data-testid={`assign-user-option-${u.id}`}
              >
                <span className="block text-sm font-medium text-slate-800 truncate">{u.name || u.email}</span>
                <span className="block text-xs text-slate-500 truncate">{u.email}</span>
              </button>
            ))
          )}
          {!query.trim() && available.length > RESULT_LIMIT && (
            <p className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100">
              Showing {RESULT_LIMIT} of {available.length}. Type to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default UserAssignPicker;
