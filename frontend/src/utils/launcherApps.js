/** Pure launcher routing helpers — keep Reports OIDC and All-tab SAML from sharing one click path. */

export const NE_EMBED_HOST = 'refex-admin-ui';
export const ITSM_VIRTUAL_ID = 'itsm-inapp';

export function isNeEmbedApp(app = {}) {
  const url = String(app.home_url || '');
  return url.includes(NE_EMBED_HOST) && (url.includes('embed=1') || url.includes('/applications/') || url.includes('/dashboard'));
}

export function isKissflowApp(app = {}) {
  const blob = `${app.name || ''} ${app.description || ''} ${app.home_url || ''} ${app.acs_url || ''} ${app.entity_id || ''}`.toLowerCase();
  return /kissflow/.test(blob);
}

/** Named ITSM / helpdesk tiles. Never NE embed Reports. */
export function isItsmNamedApp(app = {}) {
  if (isNeEmbedApp(app)) return false;
  const name = (app.name || '').toLowerCase();
  const desc = (app.description || '').toLowerCase();
  const id = (app.id || '').toLowerCase();
  return (
    id === ITSM_VIRTUAL_ID ||
    /itsm|tech support|it support|helpdesk|it helpdesk|it service/.test(name) ||
    /itsm|tech support|it helpdesk|helpdesk/.test(desc)
  );
}

/**
 * Virtual ITSM + All-tab ITSM SAML run the Kissflow-status probe.
 * Reports OIDC must never enter that path (it was opening EMS).
 */
export function shouldHijackItsmLaunch(app = {}) {
  if (!app || isNeEmbedApp(app)) return false;
  if (app.type === 'oidc') return false;
  return isItsmNamedApp(app);
}

/**
 * GET /itsm/kissflow-status returns HTTP 200 even when Kissflow is down.
 * Use Kissflow's own status_code / ok flag. Not 2xx → in-app /itsm dashboard.
 */
export function isKissflowApiOk(res) {
  const httpOk = Number(res?.status) === 200;
  const data = res?.data || {};
  const kfCode = Number(data.status_code);
  return httpOk && data.ok === true && kfCode >= 200 && kfCode < 300;
}

export function itsmKissflowFallbackReason(res, userInKissflow) {
  if (!isKissflowApiOk(res)) return 'kissflow_unavailable';
  if (!userInKissflow) return 'not_in_kissflow';
  return 'no_sso_target';
}

function usableLauncherApp(app) {
  return Boolean(
    app
    && app.has_access !== false
    && !app.policy_blocked
    && !app.is_placeholder
    && app.id !== ITSM_VIRTUAL_ID,
  );
}

const HONORIFIC_TITLE_RE = /^(mr|mrs|ms|miss|dr|sir|madam|mx)\.?$/i;
const CHIEF_TITLE_RE = /\bchief\b|\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|\bcio\b|\bcmo\b|\bchro\b|\bciso\b|\bcxo\b/i;

export function isReportsLauncherApp(app = {}) {
  if ((app.category || '').trim() === 'Reports') return true;
  return isNeEmbedApp(app);
}

/** Reports stay on the Reports tab — never mix them into All Apps. */
export function shouldShowOnAllTab(app = {}) {
  return !isReportsLauncherApp(app);
}

function jobTitleFromUser(user = {}) {
  for (const key of ['designation', 'job_title', 'position']) {
    const title = String(user?.[key] || '').trim();
    if (title) return title;
  }
  const title = String(user?.title || '').trim();
  if (title && !HONORIFIC_TITLE_RE.test(title)) return title;
  return '';
}

export function isChiefPosition(user = {}) {
  const parts = [jobTitleFromUser(user), user?.designation, user?.job_title, user?.position];
  const title = String(user?.title || '').trim();
  if (title && !HONORIFIC_TITLE_RE.test(title)) parts.push(title);
  const blob = parts.filter(Boolean).join(' ');
  return Boolean(blob) && CHIEF_TITLE_RE.test(blob);
}

export function userCanSeeReports(user = {}) {
  return isChiefPosition(user);
}

export function userCanSeeKissflow(_user = {}) {
  return true;
}

export function isKissflowLauncherApp(app = {}) {
  if (isReportsLauncherApp(app)) return false;
  if (isKissflowApp(app)) return true;
  if ((app.id || '') === ITSM_VIRTUAL_ID) return true;
  return isItsmNamedApp(app);
}

export function filterLauncherAppsForUser(apps, user) {
  const list = Array.isArray(apps) ? apps : [];
  return list.filter((app) => {
    if (isReportsLauncherApp(app) && !userCanSeeReports(user)) return false;
    return true;
  });
}

/** @deprecated use filterLauncherAppsForUser */
export function filterReportsForUser(apps, user) {
  return filterLauncherAppsForUser(apps, user);
}

/**
 * Resolve which Kissflow SAML app the virtual ITSM tile should open.
 * Prefer the tapped app, then an ITSM-named Kissflow SAML row — never the first
 * Kissflow module in the list (that was sending ITSM clicks to EMS_001_A00).
 */
export function resolveKissflowLaunchApp(list, tappedApp) {
  const rows = Array.isArray(list) ? list : [];
  if (tappedApp && usableLauncherApp(tappedApp) && tappedApp.type === 'saml' && isKissflowApp(tappedApp)) {
    return tappedApp;
  }
  const itsmKissflow = rows.find(
    (a) => usableLauncherApp(a) && a.type === 'saml' && isKissflowApp(a) && isItsmNamedApp(a),
  );
  if (itsmKissflow) return itsmKissflow;
  return rows.find((a) => usableLauncherApp(a) && a.type === 'saml' && isKissflowApp(a)) || null;
}
