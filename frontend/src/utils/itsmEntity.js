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

export const profileFromUser = (user) => ({
  name: (user?.name || user?.full_name || '').trim(),
  email: (user?.email || '').trim(),
  entity: mapEntityFromUser(user),
  location: locationFromUser(user),
});

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
