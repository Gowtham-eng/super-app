const RECENT_LIMIT = 8;
const STORAGE_PREFIX = 'refexone_recent_apps';

const storageKey = (userId) => `${STORAGE_PREFIX}:${userId || 'anon'}`;

const readIds = (userId) => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : [];
  } catch (e) {
    return [];
  }
};

export const recordRecentApp = (userId, appId) => {
  if (!appId) return;
  try {
    const next = [String(appId), ...readIds(userId).filter((id) => id !== String(appId))].slice(
      0,
      RECENT_LIMIT
    );
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch (e) {
    // ignore quota / private-mode failures
  }
};

export const resolveRecentApps = (apps, userId) => {
  const byId = new Map((apps || []).filter((app) => app?.id).map((app) => [String(app.id), app]));
  return readIds(userId).map((id) => byId.get(id)).filter(Boolean);
};
