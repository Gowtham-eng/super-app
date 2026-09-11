/** Canonical ITSM legal entities (display names). */
export const ITSM_ENTITIES = ['Refex', 'Extrovis', 'ModePro', 'Kavis', 'Pharma Pack'];

export const PROFILE_STORAGE_KEY = 'itsm_personal_details';

const normalize = (value = '') =>
  value.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

export const mapEntityFromUser = (user) => {
  const raw = (
    user?.company ||
    user?.legal_entity_code ||
    user?.organization?.name ||
    ''
  ).trim();
  if (!raw) return '';
  const lower = normalize(raw);

  if (lower.includes('extrovis')) return 'Extrovis';
  if (lower.includes('modepro') || lower.includes('mode pro')) return 'ModePro';
  if (lower.includes('pharmapack') || (lower.includes('pharma') && lower.includes('pack'))) {
    return 'Pharma Pack';
  }
  if (lower.includes('kavis') || lower.includes('kavipharm') || lower.includes('kavi pharm')) {
    return 'Kavis';
  }
  if (lower.includes('refex')) return 'Refex';

  const exact = ITSM_ENTITIES.find((opt) => normalize(opt) === lower);
  return exact || raw;
};

export const locationFromUser = (user) =>
  (user?.location || user?.office_location || user?.branch_code || '').trim();

export const isRefexEntity = (entity = '') => normalize(entity) === 'refex';

export const normalizeNonRefexEntityKey = (value = '') => {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\n.-]+/g, '');
  if (!token) return '';
  if (token.startsWith('extrovis')) return 'Extrovis';
  if (token.startsWith('modepro')) return 'ModePro';
  if (token.startsWith('kavis')) return 'Kavis';
  if (token.startsWith('pharma')) return 'Pharma Pack';
  return String(value || '').trim();
};

export const normalizeNonRefexLocationKey = (value = '') => {
  let token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
  if (!token) return '';
  token = token.replace(/iii$/, '3').replace(/ii$/, '2').replace(/i$/, '1');
  return token;
};

export const matchLocationOption = (userLocation = '', options = []) => {
  const key = normalizeNonRefexLocationKey(userLocation);
  if (!key) return '';
  return options.find((opt) => normalizeNonRefexLocationKey(opt) === key) || '';
};

export const locationsForEntity = (rows = [], entity = '') => {
  const key = normalizeNonRefexEntityKey(entity);
  const filtered = key
    ? rows.filter(
        (row) => normalizeNonRefexEntityKey(row.entityKey || row.entity) === key
      )
    : rows;
  const seen = new Set();
  const out = [];
  for (const row of filtered) {
    const location = String(row?.location || '').trim();
    if (!location) continue;
    const matchKey = normalizeNonRefexLocationKey(location);
    if (seen.has(matchKey)) continue;
    seen.add(matchKey);
    out.push(location);
  }
  return out;
};

export const profileFromUser = (user) => {
  const first = (user?.first_name || user?.firstName || '').trim();
  const last = (user?.last_name || user?.lastName || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  const email = (user?.email || '').trim();
  const rawName = (user?.name || user?.full_name || user?.display_name || '').trim();
  // Prefer real person name; never treat email as the display name.
  const name =
    combined ||
    (rawName && rawName.toLowerCase() !== email.toLowerCase() && !rawName.includes('@')
      ? rawName
      : '') ||
    '';
  return {
    name,
    email,
    entity: mapEntityFromUser(user),
    location: locationFromUser(user),
  };
};

export const mergeItsmProfile = (user) => {
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

export const mergeEntityOptions = (fromApi = []) => {
  const seen = new Set();
  const out = [];
  for (const name of [...ITSM_ENTITIES, ...fromApi]) {
    const label = (name || '').trim();
    if (!label) continue;
    const key = normalize(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
};
